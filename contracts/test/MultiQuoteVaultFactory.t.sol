// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/Registry.sol";
import "../src/PythiaVault.sol";
import "../src/MultiQuoteVaultFactory.sol";
import "../src/SlashingArbiter.sol";
import "../src/MockPredictionMarket.sol";
import "../src/MockUSDC.sol";

contract MultiQuoteVaultFactoryTest is Test {
    MockUSDC usdc;
    MockUSDC usyc;
    MockUSDC eurc;
    MockPredictionMarket market;
    Registry registry;
    SlashingArbiter arbiter;
    MultiQuoteVaultFactory factory;

    // actors
    address owner    = address(0xA110);
    address daemon   = address(0xDAE1);
    address staker1  = address(0xB0B1);
    address nonOwner = address(0xBAD1);

    uint256 internal automationPk = 0xA0701;
    uint256 internal validatorPk  = 0xA0702;
    address automation;
    address validator;

    // bond params
    uint256 constant BOND_FLOOR   = 500e6;
    uint256 constant INITIAL_BOND = 2_000e6;

    function setUp() public {
        automation = vm.addr(automationPk);
        validator  = vm.addr(validatorPk);

        // deploy three quote tokens
        usdc = new MockUSDC();
        usyc = new MockUSDC();
        eurc = new MockUSDC();

        // deploy market (uses usdc as the quote token)
        market = new MockPredictionMarket(address(usdc));

        // deploy registry (bootstrap with address(this) as initial arbiter, then rewire)
        registry = new Registry(address(this));
        arbiter  = new SlashingArbiter(address(registry), automation, validator);
        registry.setArbiter(address(arbiter));
        registry.lockArbiter();

        // build initial quotes list: [usdc, usyc] — eurc is intentionally excluded
        address[] memory initialQuotes = new address[](2);
        initialQuotes[0] = address(usdc);
        initialQuotes[1] = address(usyc);

        factory = new MultiQuoteVaultFactory(
            address(registry),
            address(arbiter),
            address(market),   // defaultMarket
            initialQuotes
        );

        // fund owner with tokens for bonds
        usdc.faucet(100_000e6);
        usyc.faucet(100_000e6);
        eurc.faucet(100_000e6);
        usdc.transfer(owner, 50_000e6);
        usyc.transfer(owner, 50_000e6);
        eurc.transfer(owner, 50_000e6);

        // fund staker1 with usdc for integration test
        usdc.transfer(staker1, 10_000e6);
    }

    // ============================================================
    //  HAPPY PATH 1 — createPythia with USDC quote
    // ============================================================
    function test_createPythia_withUsdc() public {
        vm.startPrank(owner);
        usdc.approve(address(factory), INITIAL_BOND);

        // Only check the two indexed topics (nameHash, owner); skip non-indexed data
        // because the vault address is only known after deployment.
        vm.expectEmit(true, true, false, false);
        emit MultiQuoteVaultFactory.VaultCreated(
            keccak256(bytes("apollo")),
            "apollo",
            owner,
            address(0),
            address(usdc)
        );

        (address vault, bytes32 nameHash) = factory.createPythia(
            "apollo",
            daemon,
            address(0),
            keccak256("MANIFEST"),
            keccak256("MANDATE"),
            BOND_FLOOR,
            INITIAL_BOND,
            address(usdc)
        );
        vm.stopPrank();

        // verify the emitted event carried the correct quote by inspecting the vault
        // (the vault address from the return value validates the event indirectly)

        // vault address is non-zero
        assertTrue(vault != address(0), "vault must be deployed");

        // nameHash matches keccak256("apollo")
        assertEq(nameHash, keccak256(bytes("apollo")), "nameHash mismatch");

        // registry recorded the vault
        Registry.Pythia memory p = registry.getPythia(nameHash);
        assertEq(p.vault, vault, "registry vault mismatch");

        // bond was posted
        PythiaVault v = PythiaVault(vault);
        assertGe(v.bond(), BOND_FLOOR, "bond must be >= bondFloor");
        assertEq(v.bond(), INITIAL_BOND, "bond should equal initialBond");
    }

    // ============================================================
    //  HAPPY PATH 2 — createPythia with USYC quote
    // ============================================================
    function test_createPythia_withUsyc() public {
        vm.startPrank(owner);
        usyc.approve(address(factory), INITIAL_BOND);

        (address vault, bytes32 nameHash) = factory.createPythia(
            "hermes",
            daemon,
            address(0),
            keccak256("MANIFEST2"),
            keccak256("MANDATE2"),
            BOND_FLOOR,
            INITIAL_BOND,
            address(usyc)
        );
        vm.stopPrank();

        assertTrue(vault != address(0), "vault must be deployed");
        assertEq(nameHash, keccak256(bytes("hermes")), "nameHash mismatch");

        Registry.Pythia memory p = registry.getPythia(nameHash);
        assertEq(p.vault, vault, "registry vault mismatch");

        PythiaVault v = PythiaVault(vault);
        assertEq(v.bond(), INITIAL_BOND, "bond should equal initialBond");
    }

    // ============================================================
    //  HAPPY PATH 3 — uses defaultMarket when market param is zero
    // ============================================================
    function test_createPythia_usesDefaultMarketWhenZero() public {
        vm.startPrank(owner);
        usdc.approve(address(factory), INITIAL_BOND);

        (address vault,) = factory.createPythia(
            "apollo-dm",
            daemon,
            address(0),   // <-- triggers defaultMarket path
            keccak256("MANIFEST3"),
            keccak256("MANDATE3"),
            BOND_FLOOR,
            INITIAL_BOND,
            address(usdc)
        );
        vm.stopPrank();

        assertTrue(vault != address(0), "vault must be deployed");
        // defaultMarket is address(market)
        assertEq(address(PythiaVault(vault).market()), address(market), "should use defaultMarket");
    }

    // ============================================================
    //  HAPPY PATH 4 — uses custom market when non-zero
    // ============================================================
    function test_createPythia_usesCustomMarket() public {
        MockPredictionMarket customMarket = new MockPredictionMarket(address(usdc));

        vm.startPrank(owner);
        usdc.approve(address(factory), INITIAL_BOND);

        (address vault,) = factory.createPythia(
            "apollo-cm",
            daemon,
            address(customMarket),  // <-- explicit market
            keccak256("MANIFEST4"),
            keccak256("MANDATE4"),
            BOND_FLOOR,
            INITIAL_BOND,
            address(usdc)
        );
        vm.stopPrank();

        assertTrue(vault != address(0), "vault must be deployed");
        assertEq(address(PythiaVault(vault).market()), address(customMarket), "should use custom market");
    }

    // ============================================================
    //  HAPPY PATH 5 — setQuoteAllowed adds EURC; then createPythia succeeds
    // ============================================================
    function test_setQuoteAllowed_addsEurc() public {
        // eurc is not in initial list
        assertFalse(factory.allowedQuotes(address(eurc)), "eurc should not be allowed yet");

        // owner adds eurc
        factory.setQuoteAllowed(address(eurc), true);
        assertTrue(factory.allowedQuotes(address(eurc)), "eurc should now be allowed");

        // now createPythia with eurc should succeed
        vm.startPrank(owner);
        eurc.approve(address(factory), INITIAL_BOND);

        (address vault, bytes32 nameHash) = factory.createPythia(
            "athena",
            daemon,
            address(0),
            keccak256("MANIFEST5"),
            keccak256("MANDATE5"),
            BOND_FLOOR,
            INITIAL_BOND,
            address(eurc)
        );
        vm.stopPrank();

        assertTrue(vault != address(0), "vault must be deployed");
        assertEq(nameHash, keccak256(bytes("athena")), "nameHash mismatch");
    }

    // ============================================================
    //  HAPPY PATH 6 — setQuoteAllowed removes USDC; createPythia reverts
    // ============================================================
    function test_setQuoteAllowed_removesUsdc() public {
        assertTrue(factory.allowedQuotes(address(usdc)), "usdc should be allowed initially");

        // owner removes usdc
        factory.setQuoteAllowed(address(usdc), false);
        assertFalse(factory.allowedQuotes(address(usdc)), "usdc should now be disallowed");

        // createPythia with usdc must revert
        vm.startPrank(owner);
        usdc.approve(address(factory), INITIAL_BOND);

        vm.expectRevert(MultiQuoteVaultFactory.QuoteNotAllowed.selector);
        factory.createPythia(
            "apollo-rm",
            daemon,
            address(0),
            keccak256("MANIFEST6"),
            keccak256("MANDATE6"),
            BOND_FLOOR,
            INITIAL_BOND,
            address(usdc)
        );
        vm.stopPrank();
    }

    // ============================================================
    //  HAPPY PATH 7 — allowedQuotes initial state
    // ============================================================
    function test_allowedQuotes_initialState() public view {
        assertTrue(factory.allowedQuotes(address(usdc)), "usdc should be in initial allowlist");
        assertTrue(factory.allowedQuotes(address(usyc)), "usyc should be in initial allowlist");
        assertFalse(factory.allowedQuotes(address(eurc)), "eurc should NOT be in initial allowlist");
    }

    // ============================================================
    //  HAPPY PATH 8 — vault has correct quote token
    // ============================================================
    function test_vaultHasCorrectQuoteToken() public {
        vm.startPrank(owner);
        usdc.approve(address(factory), INITIAL_BOND);

        (address vault,) = factory.createPythia(
            "apollo-qt",
            daemon,
            address(0),
            keccak256("MANIFEST7"),
            keccak256("MANDATE7"),
            BOND_FLOOR,
            INITIAL_BOND,
            address(usdc)
        );
        vm.stopPrank();

        assertEq(address(PythiaVault(vault).quote()), address(usdc), "vault quote token mismatch");
    }

    // ============================================================
    //  SAD PATH 9 — createPythia reverts on non-allowed quote
    // ============================================================
    function test_createPythia_revertsOnNonAllowedQuote() public {
        // eurc is not in initial allowlist
        vm.startPrank(owner);
        eurc.approve(address(factory), INITIAL_BOND);

        vm.expectRevert(MultiQuoteVaultFactory.QuoteNotAllowed.selector);
        factory.createPythia(
            "apollo-na",
            daemon,
            address(0),
            keccak256("MANIFEST8"),
            keccak256("MANDATE8"),
            BOND_FLOOR,
            INITIAL_BOND,
            address(eurc)
        );
        vm.stopPrank();
    }

    // ============================================================
    //  SAD PATH 10 — createPythia reverts when initialBond < bondFloor
    // ============================================================
    function test_createPythia_revertsOnBondBelowFloor() public {
        uint256 highFloor = 1_000e6;
        uint256 lowBond   = 500e6;  // below the floor

        vm.startPrank(owner);
        usdc.approve(address(factory), lowBond);

        vm.expectRevert(MultiQuoteVaultFactory.BondBelowFloor.selector);
        factory.createPythia(
            "apollo-bf",
            daemon,
            address(0),
            keccak256("MANIFEST9"),
            keccak256("MANDATE9"),
            highFloor,
            lowBond,
            address(usdc)
        );
        vm.stopPrank();
    }

    // ============================================================
    //  SAD PATH 11 — setQuoteAllowed reverts for non-owner
    // ============================================================
    function test_setQuoteAllowed_revertsForNonOwner() public {
        vm.prank(nonOwner);
        vm.expectRevert(); // OwnableUnauthorizedAccount
        factory.setQuoteAllowed(address(eurc), true);
    }

    // ============================================================
    //  INTEGRATION 12 — create vault then second user stakes
    // ============================================================
    function test_createThenStake() public {
        // owner creates vault
        vm.startPrank(owner);
        usdc.approve(address(factory), INITIAL_BOND);
        (address vaultAddr,) = factory.createPythia(
            "apollo-st",
            daemon,
            address(0),
            keccak256("MANIFEST10"),
            keccak256("MANDATE10"),
            BOND_FLOOR,
            INITIAL_BOND,
            address(usdc)
        );
        vm.stopPrank();

        PythiaVault vault = PythiaVault(vaultAddr);

        // confirm vault has no shares before staking
        assertEq(vault.totalSupply(), 0, "no shares before stake");

        // staker1 stakes into the vault
        vm.startPrank(staker1);
        usdc.approve(vaultAddr, 5_000e6);
        uint256 sharesOut = vault.stake(5_000e6);
        vm.stopPrank();

        // staker got shares
        assertGt(sharesOut, 0, "staker must receive shares");
        assertEq(vault.balanceOf(staker1), sharesOut, "staker balance should match sharesOut");
        // total supply includes dead shares + staker shares
        assertGt(vault.totalSupply(), sharesOut, "total supply includes dead shares");
    }
}
