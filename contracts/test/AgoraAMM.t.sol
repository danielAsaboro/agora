// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/AgoraAMM.sol";
import "../src/AgoraAMMFactory.sol";
import "../src/MockUSDC.sol";

/// @notice Minimal ERC-20 with public mint — used as tokenA (PYT stand-in).
contract MockERC20 is ERC20 {
    constructor(string memory name_, string memory symbol_) ERC20(name_, symbol_) {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

// ============================================================
//  AgoraAMM unit tests
// ============================================================
contract AgoraAMMTest is Test {
    MockERC20 tokenA;
    MockUSDC  tokenB;
    AgoraAMM  pool;

    address alice   = address(0xA11CE);
    address bob     = address(0xB0B);
    address dead    = 0x000000000000000000000000000000000000dEaD;

    uint256 constant MINIMUM_LIQUIDITY = 1_000;

    // Starting balances
    uint256 constant ALICE_A = 1_000_000e18;
    uint256 constant ALICE_B = 1_000_000e6;
    uint256 constant BOB_A   =   500_000e18;
    uint256 constant BOB_B   =   500_000e6;

    function setUp() public {
        tokenA = new MockERC20("PYT-test", "PYT-test");
        tokenB = new MockUSDC();

        pool = new AgoraAMM(address(tokenA), address(tokenB), "test");

        // Mint tokens to alice and bob
        tokenA.mint(alice, ALICE_A);
        tokenA.mint(bob,   BOB_A);

        vm.prank(alice);
        tokenB.faucet(ALICE_B);

        vm.prank(bob);
        tokenB.faucet(BOB_B);
    }

    // ----------------------------------------------------------------
    // Helpers
    // ----------------------------------------------------------------

    /// Add liquidity as a given user; approvals done inside.
    function _addLiquidity(address user, uint256 amtA, uint256 amtB) internal returns (uint256 lp) {
        vm.startPrank(user);
        tokenA.approve(address(pool), amtA);
        tokenB.approve(address(pool), amtB);
        lp = pool.addLiquidity(amtA, amtB);
        vm.stopPrank();
    }

    /// Integer sqrt, mirrors AgoraAMM._sqrt.
    function _sqrt(uint256 y) internal pure returns (uint256 z) {
        if (y > 3) {
            z = y;
            uint256 x = y / 2 + 1;
            while (x < z) { z = x; x = (y / x + x) / 2; }
        } else if (y != 0) {
            z = 1;
        }
    }

    // ================================================================
    //  addLiquidity
    // ================================================================

    function test_addLiquidity_firstDeposit() public {
        uint256 amtA = 100_000e18;
        uint256 amtB = 200_000e6;

        uint256 lp = _addLiquidity(alice, amtA, amtB);

        // Expected: sqrt(amtA * amtB) - MINIMUM_LIQUIDITY
        uint256 expectedLp = _sqrt(amtA * amtB) - MINIMUM_LIQUIDITY;
        assertEq(lp, expectedLp, "first deposit LP mismatch");

        // Dead address received MINIMUM_LIQUIDITY
        assertEq(pool.balanceOf(dead), MINIMUM_LIQUIDITY, "dead address LP lock");

        // Alice got the right LP
        assertEq(pool.balanceOf(alice), lp, "alice LP balance");

        // Total supply = lp + MINIMUM_LIQUIDITY
        assertEq(pool.totalSupply(), lp + MINIMUM_LIQUIDITY, "total supply");

        // Reserves updated
        (uint256 rA, uint256 rB) = pool.reserves();
        assertEq(rA, amtA, "reserveA");
        assertEq(rB, amtB, "reserveB");
    }

    function test_addLiquidity_subsequentDeposit() public {
        // First deposit to seed the pool
        uint256 seedA = 100_000e18;
        uint256 seedB = 200_000e6;
        uint256 lp1 = _addLiquidity(alice, seedA, seedB);
        uint256 supplyAfterSeed = pool.totalSupply(); // lp1 + MINIMUM_LIQUIDITY

        // Second deposit: proportional to the smaller side.
        // Deposit exactly the same ratio so both ratios are equal → lpMinted = min(lpA, lpB).
        uint256 depA = 10_000e18;
        uint256 depB = 20_000e6; // same ratio as seed

        uint256 lp2 = _addLiquidity(bob, depA, depB);

        uint256 expectedLpA = (depA * supplyAfterSeed) / seedA;
        uint256 expectedLpB = (depB * supplyAfterSeed) / seedB;
        uint256 expectedLp2 = expectedLpA < expectedLpB ? expectedLpA : expectedLpB;

        assertEq(lp2, expectedLp2, "subsequent deposit LP mismatch");
        assertEq(pool.balanceOf(bob), lp2, "bob LP balance");
    }

    function test_addLiquidity_revertsOnZeroAmountA() public {
        vm.startPrank(alice);
        tokenA.approve(address(pool), 1e18);
        tokenB.approve(address(pool), 1e6);
        vm.expectRevert(AgoraAMM.ZeroAmount.selector);
        pool.addLiquidity(0, 1e6);
        vm.stopPrank();
    }

    function test_addLiquidity_revertsOnZeroAmountB() public {
        vm.startPrank(alice);
        tokenA.approve(address(pool), 1e18);
        tokenB.approve(address(pool), 1e6);
        vm.expectRevert(AgoraAMM.ZeroAmount.selector);
        pool.addLiquidity(1e18, 0);
        vm.stopPrank();
    }

    // ================================================================
    //  removeLiquidity
    // ================================================================

    function test_removeLiquidity_happyPath() public {
        uint256 amtA = 100_000e18;
        uint256 amtB = 200_000e6;
        uint256 lp = _addLiquidity(alice, amtA, amtB);
        uint256 supply = pool.totalSupply();

        // Expected pro-rata amounts
        (uint256 rA, uint256 rB) = pool.reserves();
        uint256 expectedA = (lp * rA) / supply;
        uint256 expectedB = (lp * rB) / supply;

        uint256 aliceABefore = tokenA.balanceOf(alice);
        uint256 aliceBBefore = tokenB.balanceOf(alice);

        vm.prank(alice);
        (uint256 outA, uint256 outB) = pool.removeLiquidity(lp);

        assertEq(outA, expectedA, "amountA returned");
        assertEq(outB, expectedB, "amountB returned");
        assertEq(tokenA.balanceOf(alice), aliceABefore + outA, "alice tokenA balance");
        assertEq(tokenB.balanceOf(alice), aliceBBefore + outB, "alice tokenB balance");
        assertEq(pool.balanceOf(alice), 0, "alice LP burned");
    }

    function test_removeLiquidity_revertsOnZero() public {
        _addLiquidity(alice, 100_000e18, 200_000e6);
        vm.prank(alice);
        vm.expectRevert(AgoraAMM.ZeroAmount.selector);
        pool.removeLiquidity(0);
    }

    // ================================================================
    //  swap
    // ================================================================

    function test_swap_aToB_happyPath() public {
        // Seed pool
        _addLiquidity(alice, 100_000e18, 200_000e6);

        uint256 amountIn = 1_000e18;
        uint256 quote = pool.getAmountOut(address(tokenA), amountIn);

        (uint256 rA0, uint256 rB0) = pool.reserves();
        uint256 kBefore = rA0 * rB0;

        uint256 aliceBBefore = tokenB.balanceOf(alice);

        vm.startPrank(alice);
        tokenA.approve(address(pool), amountIn);
        uint256 out = pool.swap(address(tokenA), amountIn, quote);
        vm.stopPrank();

        assertEq(out, quote, "swap output matches quote");
        assertEq(tokenB.balanceOf(alice), aliceBBefore + out, "alice received tokenB");

        // k must not decrease (fee accrues to reserves → k strictly increases)
        (uint256 rA1, uint256 rB1) = pool.reserves();
        assertGe(rA1 * rB1, kBefore, "k must not decrease after swap");
    }

    function test_swap_bToA_happyPath() public {
        _addLiquidity(alice, 100_000e18, 200_000e6);

        uint256 amountIn = 1_000e6;
        uint256 quote = pool.getAmountOut(address(tokenB), amountIn);

        uint256 aliceABefore = tokenA.balanceOf(alice);

        vm.startPrank(alice);
        tokenB.approve(address(pool), amountIn);
        uint256 out = pool.swap(address(tokenB), amountIn, quote);
        vm.stopPrank();

        assertEq(out, quote, "swap output matches quote");
        assertEq(tokenA.balanceOf(alice), aliceABefore + out, "alice received tokenA");
    }

    function test_swap_revertsOnInsufficientOutput() public {
        _addLiquidity(alice, 100_000e18, 200_000e6);

        uint256 amountIn = 1_000e18;
        uint256 quote = pool.getAmountOut(address(tokenA), amountIn);

        vm.startPrank(alice);
        tokenA.approve(address(pool), amountIn);
        vm.expectRevert(AgoraAMM.InsufficientOutput.selector);
        pool.swap(address(tokenA), amountIn, quote + 1);
        vm.stopPrank();
    }

    function test_swap_revertsOnInvalidToken() public {
        _addLiquidity(alice, 100_000e18, 200_000e6);

        address random = address(0xDEAD1);
        vm.startPrank(alice);
        vm.expectRevert(AgoraAMM.InvalidToken.selector);
        pool.swap(random, 1e18, 0);
        vm.stopPrank();
    }

    function test_swap_revertsOnZeroAmount() public {
        _addLiquidity(alice, 100_000e18, 200_000e6);

        vm.startPrank(alice);
        vm.expectRevert(AgoraAMM.ZeroAmount.selector);
        pool.swap(address(tokenA), 0, 0);
        vm.stopPrank();
    }

    // ================================================================
    //  getAmountOut
    // ================================================================

    function test_getAmountOut_matchesSwap() public {
        _addLiquidity(alice, 100_000e18, 200_000e6);

        uint256 amountIn = 500e18;
        uint256 quote = pool.getAmountOut(address(tokenA), amountIn);

        uint256 aliceBBefore = tokenB.balanceOf(alice);

        vm.startPrank(alice);
        tokenA.approve(address(pool), amountIn);
        uint256 out = pool.swap(address(tokenA), amountIn, 0);
        vm.stopPrank();

        assertEq(out, quote, "getAmountOut must equal actual swap output");
        assertEq(tokenB.balanceOf(alice) - aliceBBefore, out, "balance change matches");
    }

    // ================================================================
    //  reserves
    // ================================================================

    function test_reserves_updatesAfterSwap() public {
        uint256 amtA = 100_000e18;
        uint256 amtB = 200_000e6;
        _addLiquidity(alice, amtA, amtB);

        uint256 amountIn = 2_000e18;

        vm.startPrank(alice);
        tokenA.approve(address(pool), amountIn);
        uint256 out = pool.swap(address(tokenA), amountIn, 0);
        vm.stopPrank();

        (uint256 rA, uint256 rB) = pool.reserves();
        assertEq(rA, amtA + amountIn, "reserveA increased by amountIn");
        assertEq(rB, amtB - out,      "reserveB decreased by amountOut");
    }

    // ================================================================
    //  Fuzz: k invariant never decreases
    // ================================================================

    function testFuzz_kInvariantNeverDecreases(uint256 amountIn) public {
        vm.assume(amountIn > 1e6 && amountIn < 1e12);

        // Seed pool with plenty of liquidity
        _addLiquidity(alice, 100_000e18, 200_000e6);

        (uint256 rA0, uint256 rB0) = pool.reserves();
        uint256 kBefore = rA0 * rB0;

        // Give bob enough tokenA to swap
        tokenA.mint(bob, amountIn);

        vm.startPrank(bob);
        tokenA.approve(address(pool), amountIn);
        pool.swap(address(tokenA), amountIn, 0);
        vm.stopPrank();

        (uint256 rA1, uint256 rB1) = pool.reserves();
        uint256 kAfter = rA1 * rB1;

        assertGe(kAfter, kBefore, "k must not decrease after swap (fee accrues to reserves)");
    }

    // ================================================================
    //  Fuzz: remove all LP after add → get back proportional amounts
    // ================================================================

    function testFuzz_removeAll_returnsDeposit(uint256 amountA, uint256 amountB) public {
        // Constrain so that sqrt(amountA * amountB) > MINIMUM_LIQUIDITY and no overflow
        vm.assume(amountA > 1e6 && amountA < 1e30);
        vm.assume(amountB > 1e6 && amountB < 1e30);
        // Ensure first-deposit LP > 0: sqrt(a*b) > MINIMUM_LIQUIDITY
        vm.assume(_sqrt(amountA * amountB) > MINIMUM_LIQUIDITY + 1);

        // Mint tokens to alice
        tokenA.mint(alice, amountA);
        vm.prank(alice);
        tokenB.faucet(amountB);

        uint256 lp = _addLiquidity(alice, amountA, amountB);

        uint256 supply = pool.totalSupply();
        (uint256 rA, uint256 rB) = pool.reserves();

        uint256 expectedA = (lp * rA) / supply;
        uint256 expectedB = (lp * rB) / supply;

        vm.prank(alice);
        (uint256 outA, uint256 outB) = pool.removeLiquidity(lp);

        // Returned amounts should match pro-rata expectation exactly
        assertEq(outA, expectedA, "amountA proportional");
        assertEq(outB, expectedB, "amountB proportional");

        // Amounts returned cannot exceed what was deposited
        assertLe(outA, amountA, "cannot get back more tokenA than deposited");
        assertLe(outB, amountB, "cannot get back more tokenB than deposited");
    }
}

// ============================================================
//  AgoraAMMFactory unit tests
// ============================================================
contract AgoraAMMFactoryTest is Test {
    AgoraAMMFactory factory;
    MockERC20 pytToken;
    MockUSDC  usdc;

    address deployer = address(this);

    function setUp() public {
        factory  = new AgoraAMMFactory();
        pytToken = new MockERC20("PYT-factory-test", "PYT-ft");
        usdc     = new MockUSDC();
    }

    function test_createPool_happyPath() public {
        vm.expectEmit(true, true, false, false);
        emit AgoraAMMFactory.PoolCreated(address(pytToken), address(usdc), address(0));

        address pool = factory.createPool(address(pytToken), address(usdc), "factory-test");

        assertTrue(pool != address(0), "pool address non-zero");
        assertEq(factory.pools(address(pytToken)), pool, "stored in pools mapping");
    }

    function test_createPool_revertsOnDuplicate() public {
        factory.createPool(address(pytToken), address(usdc), "factory-test");

        vm.expectRevert(AgoraAMMFactory.PoolExists.selector);
        factory.createPool(address(pytToken), address(usdc), "factory-test-2");
    }

    function test_createPool_revertsOnZeroAddressPytToken() public {
        vm.expectRevert(AgoraAMMFactory.ZeroAddress.selector);
        factory.createPool(address(0), address(usdc), "test");
    }

    function test_createPool_revertsOnZeroAddressUsdc() public {
        vm.expectRevert(AgoraAMMFactory.ZeroAddress.selector);
        factory.createPool(address(pytToken), address(0), "test");
    }

    function test_predictPool_matchesDeployedAddress() public {
        address predicted = factory.predictPool(address(pytToken), address(usdc), "factory-test");
        address actual    = factory.createPool(address(pytToken), address(usdc), "factory-test");

        assertEq(predicted, actual, "predictPool must match deployed address");
    }

    function test_getPool_returnsCorrectAddress() public {
        address created = factory.createPool(address(pytToken), address(usdc), "factory-test");
        address stored  = factory.getPool(address(pytToken));

        assertEq(stored, created, "getPool returns the deployed pool address");
    }
}
