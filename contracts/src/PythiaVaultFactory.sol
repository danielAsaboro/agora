// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./PythiaVault.sol";
import "./Registry.sol";

/// @title PythiaVaultFactory
/// @notice Deterministic deploy + Registry binding for a new Pythia.
contract PythiaVaultFactory {
    Registry public immutable registry;
    address  public immutable quote;
    address  public immutable arbiter;
    address  public immutable defaultMarket;

    event VaultCreated(
        bytes32 indexed nameHash,
        string  name,
        address indexed owner,
        address vault
    );

    constructor(address _registry, address _quote, address _arbiter, address _defaultMarket) {
        registry = Registry(_registry);
        quote = _quote;
        arbiter = _arbiter;
        defaultMarket = _defaultMarket;
    }

    /// @notice One-shot: deploys the vault, posts initial bond from caller, and
    /// registers the Pythia. Caller must pre-approve `initialBond` of `quote`.
    function createPythia(
        string calldata name,
        address daemon,
        address market,
        bytes32 manifestHash,
        bytes32 mandateRoot,
        uint256 bondFloor,
        uint256 initialBond
    ) external returns (address vault, bytes32 nameHash) {
        nameHash = keccak256(bytes(name));
        require(initialBond >= bondFloor, "bond < floor");
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
        // Caller approved quote to factory; factory forwards to vault.
        require(IERC20(quote).transferFrom(msg.sender, address(this), initialBond), "bond pull");
        require(IERC20(quote).approve(vault, initialBond), "approve");
        v.postBond(initialBond);
        registry.registerPythia(name, vault, daemon, manifestHash, mandateRoot, bondFloor);
        emit VaultCreated(nameHash, name, msg.sender, vault);
    }

    /// @notice Predict the address for a name without deploying.
    function predictVault(string calldata name) external view returns (address) {
        bytes32 nameHash = keccak256(bytes(name));
        bytes32 codeHash = keccak256(abi.encodePacked(type(PythiaVault).creationCode));
        // Note: actual creationCode also includes constructor args, so this is
        // illustrative only. Off-chain we recompute with the real args.
        return address(
            uint160(uint256(keccak256(abi.encodePacked(bytes1(0xff), address(this), nameHash, codeHash))))
        );
    }
}
