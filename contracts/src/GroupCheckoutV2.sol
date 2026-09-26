// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title GroupCheckoutV2 — the restaurant opens a bill, the table picks how to pay.
/// @notice Flow: restaurant creates a bill (amount only) → friends join → someone proposes
///         SPLIT or CHAOS → everyone accepts (anyone can decline and re-open the vote) →
///         the contract assigns every share → everyone pays → the merchant is paid in the
///         same transaction as the last payment. Unfinished bills refund after the deadline.
/// @dev    CHAOS randomness comes from block data (prevrandao + blockhash). Good enough for a
///         testnet game, not tamper-proof: a validator or the last accepter could bias it.
contract GroupCheckoutV2 is ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum Status {
        None,
        Joining, // friends scan and join
        Agreeing, // a mode was proposed, waiting for everyone to accept
        Paying, // shares assigned, collecting payments
        Settled,
        Refunded
    }

    enum Mode {
        None,
        Split,
        Chaos
    }

    struct Bill {
        address merchant;
        bytes32 terminalId;
        uint256 total; // USDC base units (6 decimals)
        uint256 paidAmount;
        uint64 deadline;
        uint8 joined;
        uint8 accepted;
        uint8 paidCount;
        uint32 round; // bumps on every proposal, so old acceptances don't count
        Mode mode;
        Status status;
    }

    uint8 public constant MIN_PARTICIPANTS = 2;
    uint8 public constant MAX_PARTICIPANTS = 20;
    uint64 public constant MAX_TTL = 7 days;
    /// @notice In CHAOS everyone pays at least this share of the bill (in basis points): 3%.
    uint256 public constant CHAOS_FLOOR_BPS = 300;

    IERC20 public immutable usdc;
    uint256 public billCount;

    mapping(uint256 billId => Bill) private _bills;
    mapping(uint256 billId => address[]) private _members;
    mapping(uint256 billId => mapping(address => uint256)) private _slot; // index + 1
    mapping(uint256 billId => mapping(address => uint32)) private _acceptedRound;
    mapping(uint256 billId => mapping(address => uint256)) public shareOf;
    mapping(uint256 billId => mapping(address => uint256)) public paidBy;
    mapping(bytes32 terminalId => uint256 billId) public activeBillOf;

    event BillCreated(uint256 indexed billId, address indexed merchant, bytes32 indexed terminalId, uint256 total);
    event ParticipantJoined(uint256 indexed billId, address indexed participant, uint8 joinedCount);
    event ModeProposed(uint256 indexed billId, address indexed proposer, Mode mode);
    event ModeAccepted(uint256 indexed billId, address indexed participant, uint8 acceptedCount);
    event ModeDeclined(uint256 indexed billId, address indexed participant);
    event SharesAssigned(uint256 indexed billId, Mode mode, address[] participants, uint256[] shares);
    event SharePaid(uint256 indexed billId, address indexed participant, uint256 amount, uint8 paidCount);
    event BillSettled(uint256 indexed billId, address indexed merchant, uint256 total);
    event BillRefunded(uint256 indexed billId);

    error InvalidBill();
    error InvalidParams();
    error WrongStatus();
    error Expired();
    error NotExpired();
    error NotMember();
    error AlreadyJoined();
    error BillFull();
    error NotEnoughPeople();
    error AlreadyAccepted();
    error AlreadyPaid();

    constructor(IERC20 usdc_) {
        usdc = usdc_;
    }

    // ------------------------------------------------------------ restaurant

    /// @param terminalId keccak256 of the table name, e.g. keccak256("table-12")
    /// @param total      bill total in USDC base units
    /// @param ttlSeconds time the table has to finish paying before refunds open
    function createBill(bytes32 terminalId, uint256 total, uint64 ttlSeconds) external returns (uint256 billId) {
        if (total < 100 || ttlSeconds == 0 || ttlSeconds > MAX_TTL) revert InvalidParams(); // ≥ $0.0001
        billId = ++billCount;
        Bill storage b = _bills[billId];
        b.merchant = msg.sender;
        b.terminalId = terminalId;
        b.total = total;
        b.deadline = uint64(block.timestamp) + ttlSeconds;
        b.status = Status.Joining;
        if (terminalId != bytes32(0)) activeBillOf[terminalId] = billId;
        emit BillCreated(billId, msg.sender, terminalId, total);
    }

    // ---------------------------------------------------------------- guests

    function join(uint256 billId) external {
        Bill storage b = _live(billId, Status.Joining);
        if (_slot[billId][msg.sender] != 0) revert AlreadyJoined();
        if (b.joined >= MAX_PARTICIPANTS) revert BillFull();
        _members[billId].push(msg.sender);
        b.joined += 1;
        _slot[billId][msg.sender] = b.joined;
        emit ParticipantJoined(billId, msg.sender, b.joined);
    }

    /// @notice Lock the table and put SPLIT or CHAOS to a vote. The proposer accepts automatically.
    function proposeMode(uint256 billId, Mode mode) external {
        Bill storage b = _live(billId, Status.Joining);
        _requireMember(billId);
        if (mode == Mode.None) revert InvalidParams();
        if (b.joined < MIN_PARTICIPANTS) revert NotEnoughPeople();

        b.mode = mode;
        b.status = Status.Agreeing;
        b.round += 1;
        b.accepted = 1;
        _acceptedRound[billId][msg.sender] = b.round;
        emit ModeProposed(billId, msg.sender, mode);
        emit ModeAccepted(billId, msg.sender, 1);
    }

    /// @notice Agree to the proposed mode. The last acceptance assigns every share.
    function acceptMode(uint256 billId) external {
        Bill storage b = _live(billId, Status.Agreeing);
        _requireMember(billId);
        if (_acceptedRound[billId][msg.sender] == b.round) revert AlreadyAccepted();

        _acceptedRound[billId][msg.sender] = b.round;
        b.accepted += 1;
        emit ModeAccepted(billId, msg.sender, b.accepted);
        if (b.accepted == b.joined) _assignShares(billId, b);
    }

    /// @notice Say no to the proposed mode: the table re-opens (people can join again) and anyone can propose.
    function declineMode(uint256 billId) external {
        Bill storage b = _live(billId, Status.Agreeing);
        _requireMember(billId);
        b.status = Status.Joining;
        b.mode = Mode.None;
        b.accepted = 0;
        emit ModeDeclined(billId, msg.sender);
    }

    /// @notice Pay your assigned share. Requires `usdc.approve(address(this), shareOf(billId, you))`.
    function payShare(uint256 billId) external nonReentrant {
        Bill storage b = _live(billId, Status.Paying);
        _requireMember(billId);
        if (paidBy[billId][msg.sender] != 0) revert AlreadyPaid();

        uint256 amount = shareOf[billId][msg.sender];
        paidBy[billId][msg.sender] = amount;
        b.paidAmount += amount;
        b.paidCount += 1;
        bool settled = b.paidCount == b.joined;
        if (settled) b.status = Status.Settled;

        usdc.safeTransferFrom(msg.sender, address(this), amount);
        emit SharePaid(billId, msg.sender, amount, b.paidCount);

        if (settled) {
            usdc.safeTransfer(b.merchant, b.total);
            emit BillSettled(billId, b.merchant, b.total);
        }
    }

    /// @notice Return every payment. Anyone after the deadline; the merchant any time.
    function refund(uint256 billId) external nonReentrant {
        Bill storage b = _bills[billId];
        if (b.status == Status.None || b.status == Status.Settled || b.status == Status.Refunded) revert WrongStatus();
        if (block.timestamp < b.deadline && msg.sender != b.merchant) revert NotExpired();

        b.status = Status.Refunded;
        address[] storage members = _members[billId];
        for (uint256 i; i < members.length; ++i) {
            uint256 amount = paidBy[billId][members[i]];
            if (amount != 0) usdc.safeTransfer(members[i], amount);
        }
        emit BillRefunded(billId);
    }

    // ------------------------------------------------------------------ read

    function getBill(uint256 billId) external view returns (Bill memory) {
        if (_bills[billId].status == Status.None) revert InvalidBill();
        return _bills[billId];
    }

    function getParticipants(uint256 billId)
        external
        view
        returns (address[] memory members, uint256[] memory shares, bool[] memory accepted, bool[] memory paid)
    {
        Bill storage b = _bills[billId];
        members = _members[billId];
        uint256 n = members.length;
        shares = new uint256[](n);
        accepted = new bool[](n);
        paid = new bool[](n);
        bool voting = b.status == Status.Agreeing;
        for (uint256 i; i < n; ++i) {
            shares[i] = shareOf[billId][members[i]];
            accepted[i] = voting ? _acceptedRound[billId][members[i]] == b.round : b.status >= Status.Paying;
            paid[i] = paidBy[billId][members[i]] != 0;
        }
    }

    // -------------------------------------------------------------- internal

    function _live(uint256 billId, Status expected) private view returns (Bill storage b) {
        b = _bills[billId];
        if (b.status != expected) revert WrongStatus();
        if (block.timestamp >= b.deadline) revert Expired();
    }

    function _requireMember(uint256 billId) private view {
        if (_slot[billId][msg.sender] == 0) revert NotMember();
    }

    function _assignShares(uint256 billId, Bill storage b) private {
        address[] storage members = _members[billId];
        uint256 n = members.length;
        uint256[] memory shares = new uint256[](n);

        if (b.mode == Mode.Split) {
            // Equal; the first person to join absorbs the rounding remainder.
            uint256 base = b.total / n;
            for (uint256 i; i < n; ++i) shares[i] = base;
            shares[0] += b.total - base * n;
        } else {
            // CHAOS: everyone pays a 3% floor, the rest is split by squared random weights
            // (squaring makes the result satisfyingly uneven). Leftover dust goes to the heaviest.
            uint256 seed = uint256(
                keccak256(abi.encode(block.prevrandao, blockhash(block.number - 1), block.timestamp, billId, msg.sender))
            );
            uint256 floor = (b.total * CHAOS_FLOOR_BPS) / 10_000;
            uint256 pool = b.total - floor * n; // ≥ 40% of the bill since n ≤ 20
            uint256[] memory w = new uint256[](n);
            uint256 sumW;
            uint256 heaviest;
            for (uint256 i; i < n; ++i) {
                uint256 r = (uint256(keccak256(abi.encode(seed, i))) % 1000) + 1;
                w[i] = r * r;
                sumW += w[i];
                if (w[i] > w[heaviest]) heaviest = i;
            }
            uint256 assigned;
            for (uint256 i; i < n; ++i) {
                shares[i] = floor + (pool * w[i]) / sumW;
                assigned += shares[i];
            }
            shares[heaviest] += b.total - assigned;
        }

        for (uint256 i; i < n; ++i) shareOf[billId][members[i]] = shares[i];
        b.status = Status.Paying;
        emit SharesAssigned(billId, b.mode, members, shares);
    }
}
