// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./Registry.sol";
import "./PythiaVault.sol";

/// @title SlashingArbiter
/// @notice Coordinates all four slash types. Calls into PythiaVault.slashBond
/// and Registry.recordSlash so indexers can react.
///
/// Slash types:
///   1 = mandate breach      (auto, off-chain detect, signed by `automation`)
///   2 = downtime            (auto, on-chain check via lastForecastAt)
///   3 = trace fraud         (EIP-712 dispute submission + AI validator + vote)
///   4 = accuracy decay      (auto, off-chain Brier check, signed by `automation`)
///
/// For MVP we ship types 1, 2, 4 fully autonomous; type 3 is the EIP-712 +
/// AI-validator pattern lifted from arc-escrow, with a single trusted
/// validator wallet for the hackathon window.
contract SlashingArbiter is EIP712, Ownable {
    Registry public immutable registry;

    /// @notice Off-chain automation wallet — signs mandate + decay attestations.
    address public automation;
    /// @notice OpenAI-validator wallet — signs trace-fraud verdicts.
    address public traceValidator;

    /// @notice Pre-configured slash recipients (dead address by default).
    address public constant BURN_ADDRESS = 0x000000000000000000000000000000000000dEaD;

    /// @notice 24h timelock between proposing and activating a setter change.
    uint64 public constant TIMELOCK = 24 hours;
    /// @notice Bond above this threshold ($10k) requires a co-sig on mandate
    /// + decay slashes. Sub-threshold (hackathon cohort) stays single-sig.
    uint256 public constant DUAL_SIG_BOND_THRESHOLD = 10_000e6;

    /// @notice Pending automation rotation; activated by `activateAutomation`.
    address public pendingAutomation;
    uint64  public automationEffectiveAt;
    /// @notice Pending trace-validator rotation.
    address public pendingTraceValidator;
    uint64  public traceValidatorEffectiveAt;

    bytes32 public constant MANDATE_TYPEHASH = keccak256(
        "MandateBreach(bytes32 nameHash,bytes32 marketId,bytes32 traceHash,uint256 expiry,uint256 salt)"
    );
    bytes32 public constant DECAY_TYPEHASH = keccak256(
        "AccuracyDecay(bytes32 nameHash,uint256 brierScaled,uint256 expiry,uint256 salt)"
    );
    bytes32 public constant TRACE_FRAUD_TYPEHASH = keccak256(
        "TraceFraud(bytes32 nameHash,bytes32 traceHash,address submitter,uint256 expiry,uint256 salt)"
    );

    mapping(bytes32 => bool) public usedAttestations;

    event MandateBreachSlashed(bytes32 indexed nameHash, bytes32 marketId, uint256 amount);
    event DowntimeSlashed(bytes32 indexed nameHash, uint256 hoursLate, uint256 amount);
    event TraceFraudSlashed(bytes32 indexed nameHash, address submitter, uint256 toSubmitter, uint256 burned);
    event AccuracyDecayDelisted(bytes32 indexed nameHash, uint256 brierScaled);
    event AutomationProposed(address indexed newAutomation, uint64 effectiveAt);
    event AutomationActivated(address indexed newAutomation);
    event TraceValidatorProposed(address indexed newValidator, uint64 effectiveAt);
    event TraceValidatorActivated(address indexed newValidator);

    error InvalidSignature();
    error AttestationReplay();
    error AttestationExpired();
    error NotYetSlashable();
    error NeedSecondAttestation();
    error TimelockNotElapsed();
    error NoPendingChange();

    constructor(address _registry, address _automation, address _traceValidator)
        EIP712("AgoraSlashing", "1")
        Ownable(msg.sender)
    {
        registry = Registry(_registry);
        automation = _automation;
        traceValidator = _traceValidator;
    }

    // -- Type 1: mandate breach -------------------------------------------
    /// @dev `v2/r2/s2` are the traceValidator co-sig over the SAME digest.
    /// Verified only when bond > DUAL_SIG_BOND_THRESHOLD; ignored otherwise.
    function slashMandateBreach(
        bytes32 nameHash,
        bytes32 marketId,
        bytes32 traceHash,
        uint256 expiry,
        uint256 salt,
        uint8 v, bytes32 r, bytes32 s,
        uint8 v2, bytes32 r2, bytes32 s2
    ) external {
        bytes32 structHash = keccak256(abi.encode(MANDATE_TYPEHASH, nameHash, marketId, traceHash, expiry, salt));
        bytes32 digest = _hashTypedDataV4(structHash);
        _verifyAndConsume(digest, automation, expiry, v, r, s);
        Registry.Pythia memory p = registry.getPythia(nameHash);
        require(p.owner != address(0), "unknown pythia");
        PythiaVault vault = PythiaVault(p.vault);
        if (vault.bond() > DUAL_SIG_BOND_THRESHOLD) {
            if (ecrecover(digest, v2, r2, s2) != traceValidator) revert NeedSecondAttestation();
        }
        uint256 slashAmt = vault.bond() / 4; // 25%
        vault.slashBond(1, slashAmt, BURN_ADDRESS);
        registry.recordSlash(nameHash, 1, slashAmt);
        emit MandateBreachSlashed(nameHash, marketId, slashAmt);
    }

    // -- Type 2: downtime -------------------------------------------------
    function slashDowntime(bytes32 nameHash) external {
        Registry.Pythia memory p = registry.getPythia(nameHash);
        require(p.owner != address(0), "unknown pythia");
        uint256 last = p.lastForecastAt == 0 ? p.registeredAt : p.lastForecastAt;
        uint256 hoursLate;
        if (block.timestamp <= last + 24 hours) revert NotYetSlashable();
        hoursLate = (block.timestamp - last - 24 hours) / 1 hours;
        uint256 daysLate = (hoursLate / 24) + 1; // round up
        uint256 bps = daysLate * 500; // 5%/day
        if (bps > 5000) bps = 5000;   // cap 50%
        PythiaVault vault = PythiaVault(p.vault);
        uint256 slashAmt = (vault.bond() * bps) / 10_000;
        vault.slashBond(2, slashAmt, BURN_ADDRESS);
        registry.recordSlash(nameHash, 2, slashAmt);
        emit DowntimeSlashed(nameHash, hoursLate, slashAmt);
    }

    // -- Type 3: trace fraud ----------------------------------------------
    function slashTraceFraud(
        bytes32 nameHash,
        bytes32 traceHash,
        address submitter,
        uint256 expiry,
        uint256 salt,
        uint8 v, bytes32 r, bytes32 s
    ) external {
        bytes32 structHash = keccak256(abi.encode(TRACE_FRAUD_TYPEHASH, nameHash, traceHash, submitter, expiry, salt));
        bytes32 digest = _hashTypedDataV4(structHash);
        _verifyAndConsume(digest, traceValidator, expiry, v, r, s);
        Registry.Pythia memory p = registry.getPythia(nameHash);
        PythiaVault vault = PythiaVault(p.vault);
        uint256 half = vault.bond() / 2;
        // 50% to submitter, 50% burned
        vault.slashBond(3, half, submitter);
        vault.slashBond(3, half, BURN_ADDRESS);
        registry.recordSlash(nameHash, 3, half * 2);
        emit TraceFraudSlashed(nameHash, submitter, half, half);
    }

    // -- Type 4: accuracy decay (delist, no slash) ------------------------
    /// @dev Dual-sig same as type 1: bond > $10k requires co-sig.
    function delistAccuracyDecay(
        bytes32 nameHash,
        uint256 brierScaled,
        uint256 expiry,
        uint256 salt,
        uint8 v, bytes32 r, bytes32 s,
        uint8 v2, bytes32 r2, bytes32 s2
    ) external {
        bytes32 structHash = keccak256(abi.encode(DECAY_TYPEHASH, nameHash, brierScaled, expiry, salt));
        bytes32 digest = _hashTypedDataV4(structHash);
        _verifyAndConsume(digest, automation, expiry, v, r, s);
        Registry.Pythia memory p = registry.getPythia(nameHash);
        require(p.owner != address(0), "unknown pythia");
        PythiaVault vault = PythiaVault(p.vault);
        if (vault.bond() > DUAL_SIG_BOND_THRESHOLD) {
            if (ecrecover(digest, v2, r2, s2) != traceValidator) revert NeedSecondAttestation();
        }
        registry.recordSlash(nameHash, 4, 0);
        emit AccuracyDecayDelisted(nameHash, brierScaled);
    }

    // -- Admin: timelocked rotations --------------------------------------
    /// @notice Step 1 — propose a new automation key. Takes effect after TIMELOCK.
    function proposeAutomation(address a) external onlyOwner {
        pendingAutomation = a;
        automationEffectiveAt = uint64(block.timestamp) + TIMELOCK;
        emit AutomationProposed(a, automationEffectiveAt);
    }

    /// @notice Step 2 — activate after the timelock elapses.
    function activateAutomation() external onlyOwner {
        if (automationEffectiveAt == 0) revert NoPendingChange();
        if (block.timestamp < automationEffectiveAt) revert TimelockNotElapsed();
        address activated = pendingAutomation;
        automation = activated;
        pendingAutomation = address(0);
        automationEffectiveAt = 0;
        emit AutomationActivated(activated);
    }

    function proposeTraceValidator(address a) external onlyOwner {
        pendingTraceValidator = a;
        traceValidatorEffectiveAt = uint64(block.timestamp) + TIMELOCK;
        emit TraceValidatorProposed(a, traceValidatorEffectiveAt);
    }

    function activateTraceValidator() external onlyOwner {
        if (traceValidatorEffectiveAt == 0) revert NoPendingChange();
        if (block.timestamp < traceValidatorEffectiveAt) revert TimelockNotElapsed();
        address activated = pendingTraceValidator;
        traceValidator = activated;
        pendingTraceValidator = address(0);
        traceValidatorEffectiveAt = 0;
        emit TraceValidatorActivated(activated);
    }

    // -- Internal ---------------------------------------------------------
    function _verifyAndConsume(bytes32 digest, address signer, uint256 expiry, uint8 v, bytes32 r, bytes32 s) internal {
        if (block.timestamp > expiry) revert AttestationExpired();
        if (usedAttestations[digest]) revert AttestationReplay();
        if (ecrecover(digest, v, r, s) != signer) revert InvalidSignature();
        usedAttestations[digest] = true;
    }

    // -- Views for off-chain ---------------------------------------------
    // solhint-disable-next-line func-name-mixedcase
    function DOMAIN_SEPARATOR() external view returns (bytes32) {
        return _domainSeparatorV4();
    }
}
