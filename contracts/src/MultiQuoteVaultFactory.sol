// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./PythiaVault.sol";
import "./Registry.sol";

/// @title MultiQuoteVaultFactory
/// @notice Like PythiaVaultFactory but accepts any allowlisted quote token (USDC, USYC, EURC).
/// The owner maintains the allowlist via setQuoteAllowed().
contract MultiQuoteVaultFactory is Ownable {
    Registry public immutable registry;
    address  public immutable arbiter;
    address  public immutable defaultMarket;

    mapping(address => bool) public allowedQuotes;

    event VaultCreated(
        bytes32 indexed nameHash,
        string  name,
        address indexed owner,
        address vault,
        address quote
    );
    event QuoteAllowlistUpdated(address indexed quote, bool allowed);

    error QuoteNotAllowed();
    error BondBelowFloor();

    constructor(
        address _registry,
        address _arbiter,
        address _defaultMarket,
        address[] memory _initialQuotes
    ) Ownable(msg.sender) {
        registry = Registry(_registry);
        arbiter = _arbiter;
        defaultMarket = _defaultMarket;
        for (uint256 i = 0; i < _initialQuotes.length; i++) {
            allowedQuotes[_initialQuotes[i]] = true;
            emit QuoteAllowlistUpdated(_initialQuotes[i], true);
        }
    }

    function setQuoteAllowed(address quote, bool allowed) external onlyOwner {
        allowedQuotes[quote] = allowed;
        emit QuoteAllowlistUpdated(quote, allowed);
    }

    /// @notice Deploy vault + register Pythia with a caller-specified quote token.
    /// @param quote  The collateral/stake token. Must be in allowedQuotes.
    function createPythia(
        string calldata name,
        address daemon,
        address market,
        bytes32 manifestHash,
        bytes32 mandateRoot,
        uint256 bondFloor,
        uint256 initialBond,
        address quote
    ) external returns (address vault, bytes32 nameHash) {
        if (!allowedQuotes[quote]) revert QuoteNotAllowed();
        if (initialBond < bondFloor) revert BondBelowFloor();
        nameHash = keccak256(bytes(name));
        address mkt = market == address(0) ? defaultMarket : market;
        PythiaVault v = new PythiaVault{salt: nameHash}(
            name,
            nameHash,
            quote,
            address(registry),
            arbiter,
            msg.sender,
            daemon == address(0) ? msg.sender : daemon,
            mkt,
            bondFloor
        );
        vault = address(v);
        require(IERC20(quote).transferFrom(msg.sender, address(this), initialBond), "bond pull");
        require(IERC20(quote).approve(vault, initialBond), "approve");
        v.postBond(initialBond);
        registry.registerPythia(name, vault, daemon, manifestHash, mandateRoot, bondFloor);
        emit VaultCreated(nameHash, name, msg.sender, vault, quote);
    }
}
