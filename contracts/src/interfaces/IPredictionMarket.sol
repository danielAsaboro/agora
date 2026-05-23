// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Minimal adapter the PythiaVault uses to open positions on a
/// downstream prediction market (Polymarket V2, Limitless, mock, etc).
/// The builderCode is the Pythia's wallet address — fee accrual flows back
/// through `claimBuilderFees`.
interface IPredictionMarket {
    /// @notice Open a YES/NO position on `marketId` at `prob` (1e18 fixed-point).
    /// Caller approves `IERC20(quoteToken)` for at least `quoteAmount`.
    function openPosition(
        bytes32 marketId,
        bool yes,
        uint256 quoteAmount,
        uint256 prob,
        address builderCode
    ) external returns (uint256 positionId);

    /// @notice Close a previously opened position. Returns quote tokens to caller.
    function closePosition(uint256 positionId) external returns (uint256 returned);

    /// @notice Pull accumulated builder-code fees for `builderCode` to caller.
    function claimBuilderFees(address builderCode) external returns (uint256 claimed);

    /// @notice Off-chain resolution oracle marks a market resolved.
    /// @return resolved true once final.
    /// @return outcomeYes true if YES side won.
    function marketStatus(bytes32 marketId) external view returns (bool resolved, bool outcomeYes);

    /// @notice The quote token used (typically USDC).
    function quoteToken() external view returns (address);
}
