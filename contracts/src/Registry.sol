// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";

/// @title Registry
/// @notice Onchain registry of bonded Pythias. Stores manifest anchors,
/// emits signed forecast events, exposes slashing hooks called by the arbiter.
/// Off-chain indexers consume `ForecastEmitted` to compute Brier + agoraRank.
contract Registry is Ownable {
    struct Pythia {
        address owner;
        address vault;
        address daemon;           // signer wallet (may equal owner)
        bytes32 manifestHash;     // keccak256 of manifest JSON
        bytes32 mandateRoot;      // Merkle root over allowed marketCategories
        uint256 bondFloor;        // minimum bond required, in quote units
        uint64  registeredAt;
        uint64  lastForecastAt;
        bool    delisted;
    }

    address public arbiter; // SlashingArbiter contract — set once by owner during bootstrap.
    bool    public arbiterLocked;
    mapping(bytes32 => Pythia) public pythias; // key = keccak256(name)
    mapping(bytes32 => bool)   public usedTraceHashes;

    event PythiaRegistered(
        bytes32 indexed nameHash,
        string  name,
        address indexed owner,
        address vault,
        bytes32 manifestHash,
        uint256 bondFloor
    );
    event ForecastEmitted(
        bytes32 indexed nameHash,
        bytes32 indexed marketId,
        uint256 prob,             // 1e18 fixed-point
        bytes32 traceHash,        // Irys-anchored reasoning trace
        uint64  blockTime
    );
    event PythiaSlashed(
        bytes32 indexed nameHash,
        uint8   slashType,        // 1=mandate, 2=downtime, 3=trace-fraud, 4=decay (delist)
        uint256 amount
    );
    event PythiaDelisted(bytes32 indexed nameHash, uint8 reason);
    event ManifestUpdated(bytes32 indexed nameHash, bytes32 oldHash, bytes32 newHash);

    error NameAlreadyRegistered();
    error UnknownPythia();
    error CallerNotOwner();
    error CallerNotDaemon();
    error CallerNotArbiter();
    error TraceReplayed();
    error AlreadyDelisted();
    error ArbiterAlreadyLocked();

    modifier onlyArbiter() {
        if (msg.sender != arbiter) revert CallerNotArbiter();
        _;
    }

    constructor(address _arbiter) Ownable(msg.sender) {
        arbiter = _arbiter;
    }

    /// @notice One-time arbiter rewire. Lets us deploy Registry first, then
    /// SlashingArbiter (which needs Registry's address), then link them.
    function setArbiter(address newArbiter) external onlyOwner {
        if (arbiterLocked) revert ArbiterAlreadyLocked();
        arbiter = newArbiter;
    }

    function lockArbiter() external onlyOwner {
        arbiterLocked = true;
    }

    /// @notice Register a new Pythia. The vault address is computed externally
    /// (PythiaVaultFactory deploys it deterministically and supplies it here).
    function registerPythia(
        string calldata name,
        address vault,
        address daemon,
        bytes32 manifestHash,
        bytes32 mandateRoot,
        uint256 bondFloor
    ) external returns (bytes32 nameHash) {
        nameHash = keccak256(bytes(name));
        if (pythias[nameHash].owner != address(0)) revert NameAlreadyRegistered();
        pythias[nameHash] = Pythia({
            owner: msg.sender,
            vault: vault,
            daemon: daemon == address(0) ? msg.sender : daemon,
            manifestHash: manifestHash,
            mandateRoot: mandateRoot,
            bondFloor: bondFloor,
            registeredAt: uint64(block.timestamp),
            lastForecastAt: 0,
            delisted: false
        });
        emit PythiaRegistered(nameHash, name, msg.sender, vault, manifestHash, bondFloor);
    }

    /// @notice The daemon wallet emits a forecast. `traceHash` is keccak of the
    /// Irys-pinned reasoning trace; replay-protected.
    function emitForecast(
        bytes32 nameHash,
        bytes32 marketId,
        uint256 prob,
        bytes32 traceHash
    ) external {
        Pythia storage p = pythias[nameHash];
        if (p.owner == address(0)) revert UnknownPythia();
        if (msg.sender != p.daemon) revert CallerNotDaemon();
        if (p.delisted) revert AlreadyDelisted();
        if (usedTraceHashes[traceHash]) revert TraceReplayed();
        usedTraceHashes[traceHash] = true;
        p.lastForecastAt = uint64(block.timestamp);
        emit ForecastEmitted(nameHash, marketId, prob, traceHash, uint64(block.timestamp));
    }

    function updateManifest(bytes32 nameHash, bytes32 newHash, bytes32 newMandateRoot) external {
        Pythia storage p = pythias[nameHash];
        if (p.owner == address(0)) revert UnknownPythia();
        if (msg.sender != p.owner) revert CallerNotOwner();
        bytes32 old = p.manifestHash;
        p.manifestHash = newHash;
        p.mandateRoot = newMandateRoot;
        emit ManifestUpdated(nameHash, old, newHash);
    }

    function rotateDaemon(bytes32 nameHash, address newDaemon) external {
        Pythia storage p = pythias[nameHash];
        if (msg.sender != p.owner) revert CallerNotOwner();
        p.daemon = newDaemon;
    }

    // -- Arbiter-only slashing notifications -------------------------------
    // Arbiter is the SlashingArbiter contract. It calls into the vault for the
    // actual lamport movement and then records the event here for indexers.
    function recordSlash(bytes32 nameHash, uint8 slashType, uint256 amount) external onlyArbiter {
        Pythia storage p = pythias[nameHash];
        if (p.owner == address(0)) revert UnknownPythia();
        emit PythiaSlashed(nameHash, slashType, amount);
        if (slashType == 4) {
            p.delisted = true;
            emit PythiaDelisted(nameHash, slashType);
        }
    }

    // -- Views -------------------------------------------------------------
    function getPythia(bytes32 nameHash) external view returns (Pythia memory) {
        return pythias[nameHash];
    }

    function isLive(bytes32 nameHash) external view returns (bool) {
        Pythia storage p = pythias[nameHash];
        return p.owner != address(0) && !p.delisted;
    }
}
