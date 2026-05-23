// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/Registry.sol";
import "../src/PythiaVault.sol";
import "../src/PythiaVaultFactory.sol";
import "../src/SlashingArbiter.sol";
import "../src/MockPredictionMarket.sol";
import "../src/MockUSDC.sol";

/// @title E2E
/// @notice End-to-end happy- and sad-path scenarios exercising every code path
/// the python daemon, indexer, and web UI rely on. Equivalent to running the
/// real demo, just inside `forge test`.
contract E2ETest is Test {
    MockUSDC usdc;
    MockPredictionMarket market;
    Registry registry;
    SlashingArbiter arbiter;
    PythiaVaultFactory factory;

    // -- actors
    address owner   = address(0xA110);  // Apollo owner
    address daemon  = address(0xDAE1);  // Apollo daemon
    address staker1 = address(0xB0B1);
    address staker2 = address(0xB0B2);
    address attacker = address(0xBAD);

    uint256 internal automationPk = 0xA0701;
    uint256 internal validatorPk  = 0xA0702;
    address automation;
    address validator;

    function setUp() public {
        automation = vm.addr(automationPk);
        validator  = vm.addr(validatorPk);

        usdc = new MockUSDC();
        market = new MockPredictionMarket(address(usdc));
        registry = new Registry(address(this));
        arbiter = new SlashingArbiter(address(registry), automation, validator);
        registry.setArbiter(address(arbiter));
        registry.lockArbiter();
        factory = new PythiaVaultFactory(address(registry), address(usdc), address(arbiter), address(market));

        usdc.faucet(10_000_000e6);
        usdc.transfer(owner,   100_000e6);
        usdc.transfer(staker1, 100_000e6);
        usdc.transfer(staker2, 100_000e6);
        usdc.transfer(attacker,  1_000e6);
    }

    // ============================================================
    //  HAPPY PATH
    // ============================================================
    // 1. Owner registers Apollo with bond
    // 2. Two stakers stake → mints PYT-apollo shares
    // 3. Daemon emits forecast → updates lastForecastAt
    // 4. Daemon opens YES position on a market via vault
    // 5. Oracle resolves market YES → vault closes, gets payout + builder fee
    // 6. Owner claims owner-fees
    // 7. Staker queues redeem, waits cooldown, redeems at uplifted NAV
    function test_happyPath() public {
        bytes32 nameHash;
        address vaultAddr;

        // ----- 1. register
        vm.startPrank(owner);
        usdc.approve(address(factory), 2_000e6);
        (vaultAddr, nameHash) = factory.createPythia(
            "apollo", daemon, address(0),
            keccak256("MANIFEST"), keccak256("MANDATE"),
            500e6, 2_000e6
        );
        vm.stopPrank();
        PythiaVault vault = PythiaVault(vaultAddr);
        assertEq(vault.bond(), 2_000e6, "bond after register");
        assertEq(vault.totalSupply(), 0, "no shares yet");

        // ----- 2. two stakers
        vm.startPrank(staker1);
        usdc.approve(vaultAddr, 5_000e6);
        uint256 sh1 = vault.stake(5_000e6);
        vm.stopPrank();

        vm.startPrank(staker2);
        usdc.approve(vaultAddr, 5_000e6);
        uint256 sh2 = vault.stake(5_000e6);
        vm.stopPrank();
        assertEq(sh1, sh2, "first-staker parity");
        assertEq(vault.totalSupply(), sh1 + sh2);
        assertApproxEqAbs(vault.nav(), 1e18, 1, "nav ~1 before any PnL");

        // ----- 3. create a market and emit a forecast
        bytes32 marketId = keccak256("CPI-2026-Q2-OVER-3.5");
        market.createMarket(marketId, "CPI Q2 2026 over 3.5%");

        vm.prank(daemon);
        registry.emitForecast(nameHash, marketId, 0.65e18, keccak256("TRACE-1"));
        Registry.Pythia memory p = registry.getPythia(nameHash);
        assertGt(p.lastForecastAt, 0, "lastForecastAt set");

        // ----- 4. daemon opens YES position
        uint256 freeBefore = vault.freeStake();
        assertEq(freeBefore, 10_000e6, "free stake = sum of stakes");
        vm.prank(daemon);
        uint256 positionId = vault.openPosition(marketId, true, 1_000e6, 0.65e18);
        assertEq(positionId, 1);
        // Positions are off-balance-sheet: freeStake drops by the full position amount.
        assertEq(vault.freeStake(), freeBefore - 1_000e6, "free drops by full position");

        // Attacker opens a NO position so there's a losing pot for the win to claim
        vm.startPrank(attacker);
        usdc.approve(address(market), 1_000e6);
        market.openPosition(marketId, false, 1_000e6, 0.5e18, attacker);
        vm.stopPrank();

        // ----- 5. operator resolves market YES
        market.resolveMarket(marketId, true);
        (bool resolved, bool outcomeYes) = market.marketStatus(marketId);
        assertTrue(resolved && outcomeYes);

        uint256 vaultUsdcBefore = usdc.balanceOf(vaultAddr);
        vm.prank(daemon);
        vault.closePosition(positionId);
        uint256 vaultUsdcAfter = usdc.balanceOf(vaultAddr);
        assertGt(vaultUsdcAfter, vaultUsdcBefore, "vault receives payout");

        // builder-code fees: vault opens new position to trigger fee, but for
        // the test we just claim what's already accumulated.
        vault.claimBuilderFees();

        // ----- 6. owner claims owner-fees
        uint256 ownerUsdcBefore = usdc.balanceOf(owner);
        vm.prank(owner);
        vault.payOwnerFees(address(0));
        assertGt(usdc.balanceOf(owner), ownerUsdcBefore, "owner fees paid");

        // ----- 7. staker1 queues redeem, waits, redeems
        vm.startPrank(staker1);
        vault.queueRedeem(sh1);
        vm.stopPrank();
        skip(24 hours + 1);
        uint256 stakerBefore = usdc.balanceOf(staker1);
        vm.prank(staker1);
        uint256 returned = vault.redeem();
        assertGt(returned, 0, "redemption returned >0");
        assertEq(usdc.balanceOf(staker1), stakerBefore + returned);
        // NAV should be > principal because builder fees + PnL inflated it
        assertGt(returned, 5_000e6, "staker redeems above principal due to winning forecast");
    }

    // ============================================================
    //  SAD PATH 1 — Downtime slash (5%/day, cap 50%)
    // ============================================================
    function test_sadPath_downtime() public {
        bytes32 nameHash;
        address vaultAddr;
        vm.startPrank(owner);
        usdc.approve(address(factory), 2_000e6);
        (vaultAddr, nameHash) = factory.createPythia("apollo-d", daemon, address(0), keccak256("M"), keccak256("R"), 100e6, 2_000e6);
        vm.stopPrank();
        PythiaVault vault = PythiaVault(vaultAddr);

        // not slashable within 24h
        vm.expectRevert(SlashingArbiter.NotYetSlashable.selector);
        arbiter.slashDowntime(nameHash);

        // 2 days late: 1*5% = 5%? Let's actually compute it
        skip(2 days);
        uint256 bondBefore = vault.bond();
        arbiter.slashDowntime(nameHash);
        uint256 burned = bondBefore - vault.bond();
        assertGt(burned, 0, "downtime burn > 0");
        assertLe(burned, bondBefore / 2, "cap at 50%");

        // skip past the 50% cap
        skip(30 days);
        arbiter.slashDowntime(nameHash);
        assertGt(vault.bond(), 0, "bond never fully drained even past cap");
    }

    // ============================================================
    //  SAD PATH 2 — Mandate breach (EIP-712, 25% burn)
    // ============================================================
    function test_sadPath_mandate_breach() public {
        bytes32 nameHash;
        address vaultAddr;
        vm.startPrank(owner);
        usdc.approve(address(factory), 4_000e6);
        (vaultAddr, nameHash) = factory.createPythia("apollo-m", daemon, address(0), keccak256("M"), keccak256("R"), 100e6, 4_000e6);
        vm.stopPrank();
        PythiaVault vault = PythiaVault(vaultAddr);

        // off-chain automation signs a MandateBreach attestation
        bytes32 marketId = keccak256("SUPER-BOWL-WINNER");
        bytes32 traceHash = keccak256("OUT-OF-MANDATE-TRACE");
        uint256 expiry = block.timestamp + 1 hours;
        uint256 salt = 1;

        bytes32 structHash = keccak256(abi.encode(
            arbiter.MANDATE_TYPEHASH(), nameHash, marketId, traceHash, expiry, salt
        ));
        bytes32 digest = _hashTypedDataV4(structHash);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(automationPk, digest);

        uint256 bondBefore = vault.bond();
        arbiter.slashMandateBreach(nameHash, marketId, traceHash, expiry, salt, v, r, s);
        assertEq(vault.bond(), bondBefore - bondBefore / 4, "25% burn");

        // replay protection: same digest can't be used twice
        vm.expectRevert(SlashingArbiter.AttestationReplay.selector);
        arbiter.slashMandateBreach(nameHash, marketId, traceHash, expiry, salt, v, r, s);

        // wrong signer is rejected
        (uint8 v2, bytes32 r2, bytes32 s2) = vm.sign(0xDEAD, digest);
        vm.expectRevert(SlashingArbiter.InvalidSignature.selector);
        arbiter.slashMandateBreach(nameHash, marketId, traceHash, expiry, salt + 1, v2, r2, s2);
    }

    // ============================================================
    //  SAD PATH 3 — Trace fraud (EIP-712 by validator; 50/50 split)
    // ============================================================
    function test_sadPath_trace_fraud() public {
        bytes32 nameHash;
        address vaultAddr;
        vm.startPrank(owner);
        usdc.approve(address(factory), 4_000e6);
        (vaultAddr, nameHash) = factory.createPythia("apollo-t", daemon, address(0), keccak256("M"), keccak256("R"), 100e6, 4_000e6);
        vm.stopPrank();
        PythiaVault vault = PythiaVault(vaultAddr);

        address submitter = address(0xDEFEC7);
        bytes32 traceHash = keccak256("FAKED-TRACE");
        uint256 expiry = block.timestamp + 1 hours;
        uint256 salt = 1;

        bytes32 structHash = keccak256(abi.encode(
            arbiter.TRACE_FRAUD_TYPEHASH(), nameHash, traceHash, submitter, expiry, salt
        ));
        bytes32 digest = _hashTypedDataV4(structHash);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(validatorPk, digest);

        uint256 submitterBefore = usdc.balanceOf(submitter);
        uint256 bondBefore = vault.bond();
        arbiter.slashTraceFraud(nameHash, traceHash, submitter, expiry, salt, v, r, s);
        uint256 half = bondBefore / 2;
        assertEq(usdc.balanceOf(submitter), submitterBefore + half, "50% to submitter");
        // floor floor: 100e6 ; we slashed half then half, so ~0 left if bondFloor=0 path,
        // but our slashBond clamps to remaining bond. Two halves => ~0 remaining.
        assertLe(vault.bond(), 1, "near-full burn");
    }

    // ============================================================
    //  SAD PATH 4 — Accuracy decay → delist (no slash; vault keeps funds)
    // ============================================================
    function test_sadPath_decay_delist() public {
        bytes32 nameHash;
        address vaultAddr;
        vm.startPrank(owner);
        usdc.approve(address(factory), 2_000e6);
        (vaultAddr, nameHash) = factory.createPythia("apollo-x", daemon, address(0), keccak256("M"), keccak256("R"), 100e6, 2_000e6);
        vm.stopPrank();
        PythiaVault vault = PythiaVault(vaultAddr);

        uint256 brierScaled = 320_000_000_000_000_000; // 0.32 in 1e18 — over the 0.30 threshold
        uint256 expiry = block.timestamp + 1 hours;
        uint256 salt = 1;
        bytes32 structHash = keccak256(abi.encode(arbiter.DECAY_TYPEHASH(), nameHash, brierScaled, expiry, salt));
        bytes32 digest = _hashTypedDataV4(structHash);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(automationPk, digest);

        uint256 bondBefore = vault.bond();
        arbiter.delistAccuracyDecay(nameHash, brierScaled, expiry, salt, v, r, s);

        Registry.Pythia memory p = registry.getPythia(nameHash);
        assertTrue(p.delisted, "delisted flag set");
        assertEq(vault.bond(), bondBefore, "decay does NOT burn bond");

        // delisted Pythia can't emit new forecasts
        vm.prank(daemon);
        vm.expectRevert(Registry.AlreadyDelisted.selector);
        registry.emitForecast(nameHash, keccak256("M"), 0.5e18, keccak256("TRACE-X"));
    }

    // ============================================================
    //  SAD PATH 5 — Permission boundaries
    // ============================================================
    function test_sadPath_permissions() public {
        bytes32 nameHash;
        address vaultAddr;
        vm.startPrank(owner);
        usdc.approve(address(factory), 2_000e6);
        (vaultAddr, nameHash) = factory.createPythia("apollo-p", daemon, address(0), keccak256("M"), keccak256("R"), 100e6, 2_000e6);
        vm.stopPrank();
        PythiaVault vault = PythiaVault(vaultAddr);

        // Non-daemon cannot emit
        vm.expectRevert(Registry.CallerNotDaemon.selector);
        registry.emitForecast(nameHash, keccak256("M"), 0.5e18, keccak256("T1"));

        // Non-daemon cannot open position
        vm.expectRevert(PythiaVault.CallerNotDaemon.selector);
        vault.openPosition(keccak256("M"), true, 100e6, 0.5e18);

        // Non-owner cannot withdraw bond
        vm.prank(attacker);
        vm.expectRevert();
        vault.withdrawBond(100e6);

        // Trace replay protection
        bytes32 marketId = keccak256("M-rep");
        market.createMarket(marketId, "Replay test market");
        bytes32 traceHash = keccak256("UNIQUE-TRACE");
        vm.prank(daemon);
        registry.emitForecast(nameHash, marketId, 0.5e18, traceHash);
        vm.prank(daemon);
        vm.expectRevert(Registry.TraceReplayed.selector);
        registry.emitForecast(nameHash, marketId, 0.5e18, traceHash);

        // Non-owner cannot setArbiter (registry was locked in setUp anyway, but
        // double-check via revert kind)
        vm.prank(attacker);
        vm.expectRevert();
        registry.setArbiter(address(0xCAFE));
    }

    // ============================================================
    //  SAD PATH 6 — Stake NEVER slashes when bond does
    // ============================================================
    function test_sadPath_stake_isolated_from_bond_slash() public {
        bytes32 nameHash;
        address vaultAddr;
        vm.startPrank(owner);
        usdc.approve(address(factory), 4_000e6);
        (vaultAddr, nameHash) = factory.createPythia("apollo-i", daemon, address(0), keccak256("M"), keccak256("R"), 100e6, 4_000e6);
        vm.stopPrank();
        PythiaVault vault = PythiaVault(vaultAddr);

        // Staker puts in 10k
        vm.startPrank(staker1);
        usdc.approve(vaultAddr, 10_000e6);
        uint256 shares = vault.stake(10_000e6);
        vm.stopPrank();
        uint256 freeBefore = vault.freeStake();

        // 25% mandate breach: shouldn't touch freeStake
        uint256 expiry = block.timestamp + 1 hours;
        uint256 salt = 1;
        bytes32 structHash = keccak256(abi.encode(arbiter.MANDATE_TYPEHASH(), nameHash, keccak256("BAD-M"), keccak256("BAD-T"), expiry, salt));
        bytes32 digest = _hashTypedDataV4(structHash);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(automationPk, digest);
        arbiter.slashMandateBreach(nameHash, keccak256("BAD-M"), keccak256("BAD-T"), expiry, salt, v, r, s);

        assertEq(vault.freeStake(), freeBefore, "freeStake unchanged by bond slash");

        // Staker still redeems exactly principal (no PnL, no fees)
        vm.startPrank(staker1);
        vault.queueRedeem(shares);
        vm.stopPrank();
        skip(24 hours + 1);
        vm.prank(staker1);
        uint256 out = vault.redeem();
        assertEq(out, 10_000e6, "staker keeps full principal");
    }

    // -- EIP-712 digest helper that matches SlashingArbiter's domain
    function _hashTypedDataV4(bytes32 structHash) internal view returns (bytes32) {
        return keccak256(abi.encodePacked("\x19\x01", arbiter.DOMAIN_SEPARATOR(), structHash));
    }
}
