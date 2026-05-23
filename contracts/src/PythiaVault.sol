// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./interfaces/IPredictionMarket.sol";

/// @title PythiaVault
/// @notice Per-Pythia vault. Splits a single underlying (USDC) into two pools:
/// - **bond**: owner's collateral against honesty. Burnable on slashing.
/// - **stake**: followers' capital, accounted as ERC-20 shares (PYT-{name}).
/// Stake is NEVER slashed; it only erodes via NAV when market positions lose.
/// Builder-code fees and position PnL accrue to the vault's free balance, which
/// inflates NAV pro-rata.
contract PythiaVault is ERC20, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice Bond + stake collateral token (USDC).
    IERC20 public immutable quote;
    /// @notice Registry that authorized this vault.
    address public immutable registry;
    /// @notice Slashing arbiter contract (may slash bond).
    address public immutable arbiter;
    /// @notice The Pythia's daemon wallet — opens/closes positions.
    address public daemon;
    /// @notice The downstream prediction market adapter (Polymarket / mock).
    IPredictionMarket public market;

    /// @notice Pythia name (used to seed PYT-{name} symbol).
    string  public pythiaName;
    bytes32 public immutable nameHash;

    /// @notice Owner-posted bond. Burns on dishonesty slashing.
    uint256 public bond;
    /// @notice Configured floor below which the Pythia is auto-delisted.
    uint256 public bondFloor;
    /// @notice Cumulative stake principal. Useful for diagnostics; not used in NAV math.
    uint256 public stakePrincipal;

    /// @notice Per-share NAV is computed as freeStake() / totalSupply().
    /// @notice Withdrawal queue: a 24h cooldown to prevent stake fleeing right before resolution.
    struct PendingRedeem {
        uint256 shares;
        uint64  availableAt;
    }
    mapping(address => PendingRedeem) public pendingRedeems;
    uint64 public constant REDEEM_COOLDOWN = 24 hours;

    /// @notice Active position book. positionId => (marketId, amount, yes).
    struct Position {
        bytes32 marketId;
        uint256 amount;
        bool yes;
        bool closed;
    }
    uint256 public nextPositionId;
    mapping(uint256 => Position) public positions;

    /// @notice Owner-fee bps on accrued NAV uplift since last claim. Default 1000 = 10%.
    uint256 public ownerFeeBps = 1000;
    uint256 public lastFreeStakeSnapshot;
    uint256 public accruedOwnerFees;

    event BondPosted(address indexed owner, uint256 amount, uint256 newBond);
    event BondWithdrawn(address indexed owner, uint256 amount, uint256 newBond);
    event BondSlashed(uint8 slashType, uint256 amount, uint256 newBond);
    event Staked(address indexed user, uint256 quoteIn, uint256 sharesOut);
    event RedeemQueued(address indexed user, uint256 shares, uint64 availableAt);
    event Redeemed(address indexed user, uint256 shares, uint256 quoteOut);
    event PositionOpened(uint256 indexed positionId, bytes32 indexed marketId, bool yes, uint256 amount);
    event PositionClosed(uint256 indexed positionId, uint256 returned);
    event BuilderFeesClaimed(uint256 amount);
    event OwnerFeesAccrued(uint256 amount);
    event OwnerFeesPaid(uint256 amount);

    error CallerNotDaemon();
    error CallerNotArbiter();
    error CallerNotRegistry();
    error InsufficientBond();
    error InsufficientFreeStake();
    error RedeemNotReady();
    error NothingToRedeem();
    error InvalidShares();

    modifier onlyDaemon() {
        if (msg.sender != daemon) revert CallerNotDaemon();
        _;
    }
    modifier onlyArbiter() {
        if (msg.sender != arbiter) revert CallerNotArbiter();
        _;
    }

    constructor(
        string memory _pythiaName,
        bytes32 _nameHash,
        address _quote,
        address _registry,
        address _arbiter,
        address _owner,
        address _daemon,
        address _market,
        uint256 _bondFloor
    )
        ERC20(string.concat("Pythia ", _pythiaName), string.concat("PYT-", _pythiaName))
        Ownable(_owner)
    {
        pythiaName = _pythiaName;
        nameHash = _nameHash;
        quote = IERC20(_quote);
        registry = _registry;
        arbiter = _arbiter;
        daemon = _daemon;
        market = IPredictionMarket(_market);
        bondFloor = _bondFloor;
    }

    // -- Bond ---------------------------------------------------------------
    function postBond(uint256 amount) external {
        quote.safeTransferFrom(msg.sender, address(this), amount);
        bond += amount;
        emit BondPosted(msg.sender, amount, bond);
    }

    function withdrawBond(uint256 amount) external onlyOwner nonReentrant {
        if (amount > bond) revert InsufficientBond();
        // Owner can only reduce bond above floor while live. If delisted in
        // future, the indexer/Registry should set bondFloor=0 to allow full claw.
        if (bond - amount < bondFloor) revert InsufficientBond();
        bond -= amount;
        quote.safeTransfer(msg.sender, amount);
        emit BondWithdrawn(msg.sender, amount, bond);
    }

    /// @dev Called by SlashingArbiter. Always burns from `bond`, never stake.
    function slashBond(uint8 slashType, uint256 amount, address burnTo) external onlyArbiter nonReentrant {
        if (amount > bond) amount = bond;
        bond -= amount;
        if (burnTo == address(0)) {
            // burn — send to dead address to keep solidity simple
            quote.safeTransfer(0x000000000000000000000000000000000000dEaD, amount);
        } else {
            quote.safeTransfer(burnTo, amount);
        }
        emit BondSlashed(slashType, amount, bond);
    }

    // -- Stake (ERC-20 shares) ---------------------------------------------
    /// @notice freeStake() == quote balance minus bond minus accruedOwnerFees.
    /// Open positions are NOT reserved here — once the daemon sends quote to
    /// the market, those tokens leave the vault. NAV temporarily dips while
    /// positions are open, then snaps back on close (more on a win, less on a
    /// loss). This is intentional: stake erodes via NAV when forecasts lose.
    function freeStake() public view returns (uint256) {
        uint256 bal = quote.balanceOf(address(this));
        uint256 reserved = bond + accruedOwnerFees;
        return bal > reserved ? bal - reserved : 0;
    }

    function nav() public view returns (uint256) {
        uint256 supply = totalSupply();
        if (supply == 0) return 1e18;
        return (freeStake() * 1e18) / supply;
    }

    function stake(uint256 quoteIn) external nonReentrant returns (uint256 sharesOut) {
        _accrueOwnerFees();
        quote.safeTransferFrom(msg.sender, address(this), quoteIn);
        uint256 supply = totalSupply();
        // Compute shares against the pre-deposit freeStake (we just topped it up
        // so subtract quoteIn to keep math fair).
        uint256 freePre = freeStake() - quoteIn;
        sharesOut = supply == 0 ? quoteIn : (quoteIn * supply) / (freePre == 0 ? quoteIn : freePre);
        _mint(msg.sender, sharesOut);
        stakePrincipal += quoteIn;
        lastFreeStakeSnapshot = freeStake();
        emit Staked(msg.sender, quoteIn, sharesOut);
    }

    function queueRedeem(uint256 shares) external {
        if (shares == 0 || balanceOf(msg.sender) < shares) revert InvalidShares();
        // Move shares to vault custody during cooldown so user can't double-redeem.
        _transfer(msg.sender, address(this), shares);
        PendingRedeem storage q = pendingRedeems[msg.sender];
        q.shares += shares;
        q.availableAt = uint64(block.timestamp + REDEEM_COOLDOWN);
        emit RedeemQueued(msg.sender, shares, q.availableAt);
    }

    function redeem() external nonReentrant returns (uint256 quoteOut) {
        PendingRedeem memory q = pendingRedeems[msg.sender];
        if (q.shares == 0) revert NothingToRedeem();
        if (block.timestamp < q.availableAt) revert RedeemNotReady();
        _accrueOwnerFees();
        uint256 supply = totalSupply();
        uint256 free = freeStake();
        quoteOut = (q.shares * free) / supply;
        if (quoteOut > free) revert InsufficientFreeStake();
        _burn(address(this), q.shares);
        delete pendingRedeems[msg.sender];
        quote.safeTransfer(msg.sender, quoteOut);
        emit Redeemed(msg.sender, q.shares, quoteOut);
    }

    // -- Positions ----------------------------------------------------------
    function openPosition(bytes32 marketId, bool yes, uint256 amount, uint256 prob)
        external
        onlyDaemon
        nonReentrant
        returns (uint256 positionId)
    {
        if (amount > freeStake()) revert InsufficientFreeStake();
        quote.forceApprove(address(market), amount);
        // builderCode = this vault (so fees flow back to stake pool)
        uint256 externalId = market.openPosition(marketId, yes, amount, prob, address(this));
        positionId = ++nextPositionId;
        positions[positionId] = Position({marketId: marketId, amount: amount, yes: yes, closed: false});
        emit PositionOpened(positionId, marketId, yes, amount);
        // record externalId off-chain via Position event — kept simple here.
        externalId; // silence warning
    }

    function closePosition(uint256 positionId) external onlyDaemon nonReentrant {
        Position storage p = positions[positionId];
        require(!p.closed, "closed");
        p.closed = true;
        uint256 returned = market.closePosition(positionId);
        emit PositionClosed(positionId, returned);
    }

    function claimBuilderFees() external nonReentrant {
        uint256 claimed = market.claimBuilderFees(address(this));
        emit BuilderFeesClaimed(claimed);
        _accrueOwnerFees();
    }

    function payOwnerFees(address to) external onlyOwner nonReentrant {
        _accrueOwnerFees();
        uint256 amt = accruedOwnerFees;
        accruedOwnerFees = 0;
        quote.safeTransfer(to == address(0) ? msg.sender : to, amt);
        emit OwnerFeesPaid(amt);
    }

    function rotateDaemon(address newDaemon) external onlyOwner {
        daemon = newDaemon;
    }

    // -- Internal ----------------------------------------------------------
    function _accrueOwnerFees() internal {
        uint256 cur = freeStake();
        if (cur > lastFreeStakeSnapshot) {
            uint256 gain = cur - lastFreeStakeSnapshot;
            uint256 fee = (gain * ownerFeeBps) / 10_000;
            accruedOwnerFees += fee;
            lastFreeStakeSnapshot = cur - fee;
            emit OwnerFeesAccrued(fee);
        } else {
            lastFreeStakeSnapshot = cur;
        }
    }
}
