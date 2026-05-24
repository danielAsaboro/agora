// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./PythiaVault.sol";
import "./Registry.sol";

/// @title CCTPReceiver
/// @notice Receives cross-chain USDC via Circle CCTP and stakes it into the
/// target PythiaVault on behalf of the originating staker.
///
/// Circle's MessageTransmitter on Arc Testnet calls handleReceiveMessage()
/// after verifying the attestation. The message body encodes (nameHash, staker).
///
/// Deploy once on Arc Testnet. Register as the callerAddress on the source-chain
/// CCTPSender.stakeRemote() calls.
contract CCTPReceiver is Ownable {
    using SafeERC20 for IERC20;

    Registry public immutable registry;
    IERC20   public immutable usdc;

    /// @notice Circle MessageTransmitter on Arc Testnet.
    address public messageTransmitter;

    event CrossChainStake(
        bytes32 indexed nameHash,
        address indexed staker,
        uint256 amount,
        uint32  sourceDomain
    );

    error CallerNotTransmitter();
    error VaultNotFound();

    modifier onlyTransmitter() {
        if (msg.sender != messageTransmitter) revert CallerNotTransmitter();
        _;
    }

    constructor(
        address _registry,
        address _usdc,
        address _messageTransmitter
    ) Ownable(msg.sender) {
        registry = Registry(_registry);
        usdc = IERC20(_usdc);
        messageTransmitter = _messageTransmitter;
    }

    function setMessageTransmitter(address _mt) external onlyOwner {
        messageTransmitter = _mt;
    }

    /// @notice Called by Circle's MessageTransmitter after attestation is verified.
    /// @param sourceDomain   Circle domain ID of the originating chain.
    /// @param sender         Bytes32-encoded address of the CCTPSender contract.
    /// @param messageBody    ABI-encoded (bytes32 nameHash, address staker, uint256 amount).
    function handleReceiveMessage(
        uint32  sourceDomain,
        bytes32 sender,
        bytes   calldata messageBody
    ) external onlyTransmitter returns (bool) {
        (bytes32 nameHash, address staker, uint256 amount) =
            abi.decode(messageBody, (bytes32, address, uint256));

        Registry.Pythia memory rec = registry.getPythia(nameHash);
        if (rec.vault == address(0)) revert VaultNotFound();

        usdc.forceApprove(rec.vault, amount);
        PythiaVault(rec.vault).stake(amount);

        // Transfer the minted PYT shares to the staker.
        IERC20 pyt = IERC20(rec.vault);
        uint256 shares = pyt.balanceOf(address(this));
        if (shares > 0) {
            pyt.safeTransfer(staker, shares);
        }

        emit CrossChainStake(nameHash, staker, amount, sourceDomain);
        return true;
    }
}
