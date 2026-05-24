// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title AgoraAMM
/// @notice Minimal constant-product (x·y = k) pool for PYT-{name} / USDC pairs.
/// LP shares are ERC-20 ("ALP-{name}"). 0.3% fee accrues to reserves.
contract AgoraAMM is ERC20, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable tokenA; // PYT-{name}
    IERC20 public immutable tokenB; // USDC

    uint256 public reserveA;
    uint256 public reserveB;

    uint256 private constant FEE_BPS = 30;    // 0.30%
    uint256 private constant BPS = 10_000;
    uint256 private constant MINIMUM_LIQUIDITY = 1_000;
    address private constant DEAD = 0x000000000000000000000000000000000000dEaD;

    event LiquidityAdded(address indexed provider, uint256 amountA, uint256 amountB, uint256 lpMinted);
    event LiquidityRemoved(address indexed provider, uint256 lpBurned, uint256 amountA, uint256 amountB);
    event Swap(address indexed sender, address tokenIn, uint256 amountIn, uint256 amountOut, address indexed to);

    error InsufficientLiquidity();
    error InsufficientOutput();
    error InvalidToken();
    error ZeroAmount();

    constructor(address _tokenA, address _tokenB, string memory nameSuffix)
        ERC20(
            string.concat("Agora LP ", nameSuffix),
            string.concat("ALP-", nameSuffix)
        )
    {
        tokenA = IERC20(_tokenA);
        tokenB = IERC20(_tokenB);
    }

    // -- Liquidity ---------------------------------------------------------

    function addLiquidity(uint256 amountA, uint256 amountB)
        external
        nonReentrant
        returns (uint256 lpMinted)
    {
        if (amountA == 0 || amountB == 0) revert ZeroAmount();
        tokenA.safeTransferFrom(msg.sender, address(this), amountA);
        tokenB.safeTransferFrom(msg.sender, address(this), amountB);

        uint256 supply = totalSupply();
        if (supply == 0) {
            // Geometric mean seeding, lock MINIMUM_LIQUIDITY to dead address.
            lpMinted = _sqrt(amountA * amountB) - MINIMUM_LIQUIDITY;
            _mint(DEAD, MINIMUM_LIQUIDITY);
        } else {
            // Proportional to the smaller contribution (mirrors Uniswap v2).
            uint256 lpA = (amountA * supply) / reserveA;
            uint256 lpB = (amountB * supply) / reserveB;
            lpMinted = lpA < lpB ? lpA : lpB;
        }
        if (lpMinted == 0) revert InsufficientLiquidity();
        _mint(msg.sender, lpMinted);
        _updateReserves();
        emit LiquidityAdded(msg.sender, amountA, amountB, lpMinted);
    }

    function removeLiquidity(uint256 lpShares)
        external
        nonReentrant
        returns (uint256 amountA, uint256 amountB)
    {
        if (lpShares == 0) revert ZeroAmount();
        uint256 supply = totalSupply();
        amountA = (lpShares * reserveA) / supply;
        amountB = (lpShares * reserveB) / supply;
        if (amountA == 0 || amountB == 0) revert InsufficientLiquidity();
        _burn(msg.sender, lpShares);
        tokenA.safeTransfer(msg.sender, amountA);
        tokenB.safeTransfer(msg.sender, amountB);
        _updateReserves();
        emit LiquidityRemoved(msg.sender, lpShares, amountA, amountB);
    }

    // -- Swap --------------------------------------------------------------

    function swap(address tokenIn, uint256 amountIn, uint256 minOut)
        external
        nonReentrant
        returns (uint256 amountOut)
    {
        if (tokenIn != address(tokenA) && tokenIn != address(tokenB)) revert InvalidToken();
        if (amountIn == 0) revert ZeroAmount();

        amountOut = getAmountOut(tokenIn, amountIn);
        if (amountOut < minOut) revert InsufficientOutput();

        IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amountIn);
        IERC20(tokenIn == address(tokenA) ? address(tokenB) : address(tokenA)).safeTransfer(
            msg.sender,
            amountOut
        );
        _updateReserves();
        emit Swap(msg.sender, tokenIn, amountIn, amountOut, msg.sender);
    }

    // -- View --------------------------------------------------------------

    function getAmountOut(address tokenIn, uint256 amountIn) public view returns (uint256 amountOut) {
        if (tokenIn != address(tokenA) && tokenIn != address(tokenB)) revert InvalidToken();
        bool aIn = tokenIn == address(tokenA);
        uint256 rIn  = aIn ? reserveA : reserveB;
        uint256 rOut = aIn ? reserveB : reserveA;
        if (rIn == 0 || rOut == 0) revert InsufficientLiquidity();
        // constant product with fee: amountOut = rOut * amountInFee / (rIn + amountInFee)
        uint256 amountInFee = amountIn * (BPS - FEE_BPS);
        amountOut = (rOut * amountInFee) / (rIn * BPS + amountInFee);
    }

    function reserves() external view returns (uint256, uint256) {
        return (reserveA, reserveB);
    }

    // -- Internal ----------------------------------------------------------

    function _updateReserves() internal {
        reserveA = tokenA.balanceOf(address(this));
        reserveB = tokenB.balanceOf(address(this));
    }

    function _sqrt(uint256 y) internal pure returns (uint256 z) {
        if (y > 3) {
            z = y;
            uint256 x = y / 2 + 1;
            while (x < z) {
                z = x;
                x = (y / x + x) / 2;
            }
        } else if (y != 0) {
            z = 1;
        }
    }
}
