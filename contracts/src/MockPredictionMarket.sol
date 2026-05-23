// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./interfaces/IPredictionMarket.sol";

/// @title MockPredictionMarket
/// @notice Thin local prediction-market used as the fallback when Polymarket V2
/// isn't reachable from Arc testnet. Owner (an oracle EOA) resolves markets.
/// Honors the same `IPredictionMarket` shape as the Polymarket adapter so the
/// vault sees one consistent interface.
contract MockPredictionMarket is IPredictionMarket, Ownable {
    using SafeERC20 for IERC20;

    IERC20 public immutable usdc;
    /// @notice builder fee in bps charged on every fill, paid to the position
    /// opener's builder code (i.e., the vault that opened the position).
    uint256 public builderFeeBps = 50; // 0.5%

    struct Market {
        bool exists;
        bool resolved;
        bool outcomeYes;
        uint256 totalYes;
        uint256 totalNo;
    }
    mapping(bytes32 => Market) public markets;

    struct PositionRec {
        address opener;
        bytes32 marketId;
        bool yes;
        uint256 amount;
        bool closed;
    }
    uint256 public nextId;
    mapping(uint256 => PositionRec) public positions;
    mapping(address => uint256) public pendingBuilderFees;

    event MarketCreated(bytes32 indexed marketId, string label);
    event MarketResolved(bytes32 indexed marketId, bool outcomeYes);
    event PositionOpened(uint256 indexed positionId, bytes32 indexed marketId, address opener, bool yes, uint256 amount, uint256 fee);
    event PositionClosed(uint256 indexed positionId, uint256 payout);
    event BuilderFeesClaimed(address indexed builder, uint256 amount);

    constructor(address _usdc) Ownable(msg.sender) {
        usdc = IERC20(_usdc);
    }

    function createMarket(bytes32 marketId, string calldata label) external onlyOwner {
        require(!markets[marketId].exists, "exists");
        markets[marketId] = Market({exists: true, resolved: false, outcomeYes: false, totalYes: 0, totalNo: 0});
        emit MarketCreated(marketId, label);
    }

    function resolveMarket(bytes32 marketId, bool outcomeYes) external onlyOwner {
        Market storage m = markets[marketId];
        require(m.exists && !m.resolved, "bad market");
        m.resolved = true;
        m.outcomeYes = outcomeYes;
        emit MarketResolved(marketId, outcomeYes);
    }

    function openPosition(
        bytes32 marketId,
        bool yes,
        uint256 quoteAmount,
        uint256 /*prob*/,
        address builderCode
    ) external override returns (uint256 positionId) {
        Market storage m = markets[marketId];
        require(m.exists && !m.resolved, "bad market");
        usdc.safeTransferFrom(msg.sender, address(this), quoteAmount);
        uint256 fee = (quoteAmount * builderFeeBps) / 10_000;
        uint256 net = quoteAmount - fee;
        pendingBuilderFees[builderCode] += fee;
        positionId = ++nextId;
        positions[positionId] = PositionRec({opener: msg.sender, marketId: marketId, yes: yes, amount: net, closed: false});
        if (yes) m.totalYes += net; else m.totalNo += net;
        emit PositionOpened(positionId, marketId, msg.sender, yes, net, fee);
    }

    function closePosition(uint256 positionId) external override returns (uint256 returned) {
        PositionRec storage p = positions[positionId];
        require(!p.closed && p.opener == msg.sender, "bad caller");
        Market storage m = markets[p.marketId];
        require(m.resolved, "unresolved");
        p.closed = true;
        // Simple pari-mutuel payout: winner side splits totalLosing pot pro-rata
        // plus gets their own stake back.
        if (p.yes == m.outcomeYes) {
            uint256 winningPot = m.outcomeYes ? m.totalYes : m.totalNo;
            uint256 losingPot  = m.outcomeYes ? m.totalNo  : m.totalYes;
            returned = p.amount + (p.amount * losingPot) / (winningPot == 0 ? 1 : winningPot);
        } else {
            returned = 0;
        }
        if (returned > 0) usdc.safeTransfer(msg.sender, returned);
        emit PositionClosed(positionId, returned);
    }

    function claimBuilderFees(address builderCode) external override returns (uint256 claimed) {
        require(msg.sender == builderCode, "self only");
        claimed = pendingBuilderFees[builderCode];
        pendingBuilderFees[builderCode] = 0;
        if (claimed > 0) usdc.safeTransfer(builderCode, claimed);
        emit BuilderFeesClaimed(builderCode, claimed);
    }

    function marketStatus(bytes32 marketId) external view override returns (bool resolved, bool outcomeYes) {
        Market storage m = markets[marketId];
        return (m.resolved, m.outcomeYes);
    }

    function quoteToken() external view override returns (address) {
        return address(usdc);
    }

    function setBuilderFeeBps(uint256 bps) external onlyOwner {
        require(bps <= 1000, "too high");
        builderFeeBps = bps;
    }
}
