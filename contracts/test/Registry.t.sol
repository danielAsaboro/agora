// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/Registry.sol";
import "../src/PythiaVault.sol";
import "../src/PythiaVaultFactory.sol";
import "../src/SlashingArbiter.sol";
import "../src/MockPredictionMarket.sol";
import "../src/MockUSDC.sol";

contract RegistryTest is Test {
    MockUSDC usdc;
    MockPredictionMarket market;
    Registry registry;
    SlashingArbiter arbiter;
    PythiaVaultFactory factory;

    address alice = address(0xA11CE);
    address bob   = address(0xB0B);

    function setUp() public {
        usdc = new MockUSDC();
        market = new MockPredictionMarket(address(usdc));
        registry = new Registry(address(this));
        arbiter = new SlashingArbiter(address(registry), address(this), address(this));
        registry.setArbiter(address(arbiter));
        registry.lockArbiter();
        factory = new PythiaVaultFactory(address(registry), address(usdc), address(arbiter), address(market));

        usdc.faucet(1_000_000e6);
        usdc.transfer(alice, 100_000e6);
        usdc.transfer(bob,   100_000e6);
    }

    function test_registerAndStake() public {
        vm.startPrank(alice);
        usdc.approve(address(factory), 1_000e6);
        (address vaultAddr, bytes32 nameHash) = factory.createPythia(
            "apollo",
            alice,
            address(0),
            bytes32("MANIFEST-HASH"),
            bytes32("MANDATE-ROOT"),
            500e6, // bondFloor
            1_000e6 // initialBond
        );
        vm.stopPrank();

        PythiaVault vault = PythiaVault(vaultAddr);
        assertEq(vault.bond(), 1_000e6);
        assertEq(vault.totalSupply(), 0);

        // Bob stakes
        vm.startPrank(bob);
        usdc.approve(vaultAddr, 5_000e6);
        uint256 shares = vault.stake(5_000e6);
        vm.stopPrank();
        assertGt(shares, 0);
        assertEq(vault.balanceOf(bob), shares);

        // Apollo emits forecast
        bytes32 marketId = keccak256("CPI-2026-Q2-OVER-3.5");
        vm.prank(address(this));
        market.createMarket(marketId, "CPI Q2 2026 over 3.5%");

        vm.prank(alice);
        registry.emitForecast(nameHash, marketId, 0.65e18, bytes32("TRACE-1"));
    }

    function test_downtimeSlash() public {
        vm.startPrank(alice);
        usdc.approve(address(factory), 2_000e6);
        (, bytes32 nameHash) = factory.createPythia(
            "hermes", alice, address(0),
            bytes32("M"), bytes32("R"), 1_000e6, 2_000e6
        );
        vm.stopPrank();
        // Fast-forward 3 days past registration
        skip(3 days);
        arbiter.slashDowntime(nameHash);
        // 3 days late = 15% (above 5%/day cap kicks in at 10 days).
        Registry.Pythia memory p = registry.getPythia(nameHash);
        PythiaVault v = PythiaVault(p.vault);
        assertLt(v.bond(), 2_000e6);
    }
}
