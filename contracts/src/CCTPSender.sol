// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @notice Minimal interface for Circle CCTP TokenMessenger.
interface ITokenMessenger {
    function depositForBurnWithCaller(
        uint256 amount,
        uint32  destinationDomain,
        bytes32 mintRecipient,
        address burnToken,
        bytes32 destinationCaller
    ) external returns (uint64 nonce);
}

/// @title CCTPSender
/// @notice Deployed on source chains (Base, Arbitrum, Ethereum).
/// Callers approve USDC here, then call stakeRemote() which burns USDC via CCTP
/// and encodes (nameHash, staker) in the message body so that the CCTPReceiver
/// on Arc can stake on their behalf.
contract CCTPSender {
    using SafeERC20 for IERC20;

    ITokenMessenger public immutable tokenMessenger;
    IERC20          public immutable usdc;
    /// @notice The CCTPReceiver contract address on Arc Testnet (bytes32-encoded).
    bytes32         public immutable arcReceiver;
    /// @notice Circle domain ID for Arc Testnet.
    uint32          public immutable arcDomain;

    event StakeRemoteInitiated(
        bytes32 indexed nameHash,
        address indexed staker,
        uint256 amount,
        uint64  nonce
    );

    constructor(
        address _tokenMessenger,
        address _usdc,
        bytes32 _arcReceiver,
        uint32  _arcDomain
    ) {
        tokenMessenger = ITokenMessenger(_tokenMessenger);
        usdc = IERC20(_usdc);
        arcReceiver = _arcReceiver;
        arcDomain = _arcDomain;
    }

    /// @notice Initiate a cross-chain stake into a PythiaVault on Arc Testnet.
    /// @param nameHash   keccak256(pythiaName) — identifies the target vault.
    /// @param staker     Address that will receive PYT shares on Arc.
    /// @param amount     USDC amount (in 6-decimal units). Caller must pre-approve.
    function stakeRemote(
        bytes32 nameHash,
        address staker,
        uint256 amount
    ) external returns (uint64 nonce) {
        usdc.safeTransferFrom(msg.sender, address(this), amount);
        usdc.forceApprove(address(tokenMessenger), amount);

        bytes memory messageBody = abi.encode(nameHash, staker, amount);
        bytes32 mintRecipient = arcReceiver;

        nonce = tokenMessenger.depositForBurnWithCaller(
            amount,
            arcDomain,
            mintRecipient,
            address(usdc),
            arcReceiver     // destinationCaller = CCTPReceiver (enforces caller)
        );

        emit StakeRemoteInitiated(nameHash, staker, amount, nonce);
    }
}
