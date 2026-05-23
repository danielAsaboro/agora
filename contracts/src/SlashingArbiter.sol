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

    error InvalidSignature();
    error AttestationReplay();
    error AttestationExpired();
    error NotYetSlashable();

    constructor(address _registry, address _automation, address _traceValidator)
        EIP712("AgoraSlashing", "1")
        Ownable(msg.sender)
    {
        registry = Registry(_registry);
        automation = _automation;
        traceValidator = _traceValidator;
    }

    // -- Type 1: mandate breach -------------------------------------------
    function slashMandateBreach(
        bytes32 nameHash,
        bytes32 marketId,
        bytes32 traceHash,
        uint256 expiry,
        uint256 salt,
        uint8 v, bytes32 r, bytes32 s
    ) external {
        bytes32 structHash = keccak256(abi.encode(MANDATE_TYPEHASH, nameHash, marketId, traceHash, expiry, salt));
        _verify(structHash, automation, expiry, v, r, s);
        Registry.Pythia memory p = registry.getPythia(nameHash);
        require(p.owner != address(0), "unknown pythia");
        PythiaVault vault = PythiaVault(p.vault);
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
        _verify(structHash, traceValidator, expiry, v, r, s);
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
    function delistAccuracyDecay(
        bytes32 nameHash,
        uint256 brierScaled,
        uint256 expiry,
        uint256 salt,
        uint8 v, bytes32 r, bytes32 s
    ) external {
        bytes32 structHash = keccak256(abi.encode(DECAY_TYPEHASH, nameHash, brierScaled, expiry, salt));
        _verify(structHash, automation, expiry, v, r, s);
        registry.recordSlash(nameHash, 4, 0);
        emit AccuracyDecayDelisted(nameHash, brierScaled);
    }

    // -- Admin ------------------------------------------------------------
    function setAutomation(address a) external onlyOwner { automation = a; }
    function setTraceValidator(address a) external onlyOwner { traceValidator = a; }

    // -- Internal ---------------------------------------------------------
    function _verify(bytes32 structHash, address signer, uint256 expiry, uint8 v, bytes32 r, bytes32 s) internal {
        if (block.timestamp > expiry) revert AttestationExpired();
        bytes32 digest = _hashTypedDataV4(structHash);
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
