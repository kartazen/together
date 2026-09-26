// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title GroupCheckout — a restaurant bill that a group pays together.
/// @notice Checkpoint 1: equal split. The merchant creates a bill for N people,
///         each person pays their share in USDC, and the full amount is sent to
///         the merchant in the same transaction as the last payment.
///         If the bill isn't fully paid before its deadline, everyone is refunded.
contract GroupCheckout is ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum Status {
        None,
        Open,
        Settled,
        Refunded
    }

    struct Bill {
        address merchant;
        bytes32 terminalId;
        uint256 total; // USDC base units (6 decimals)
        uint256 paidAmount;
        uint64 deadline;
        uint8 participants; // expected number of people
        uint8 joined;
        uint8 paidCount;
        Status status;
    }

    IERC20 public immutable usdc;

    uint256 public billCount;
    mapping(uint256 billId => Bill) private _bills;
    mapping(uint256 billId => address[]) private _members;
    /// @dev member index + 1, so 0 means "not a member".
    mapping(uint256 billId => mapping(address => uint256)) private _slot;
    mapping(uint256 billId => mapping(address => uint256)) public paidBy;

    /// @notice The latest bill created for a terminal (0 = none). The ESP32 backend reads this.
    mapping(bytes32 terminalId => uint256 billId) public activeBillOf;

    event BillCreated(
        uint256 indexed billId, address indexed merchant, bytes32 indexed terminalId, uint256 total, uint8 participants
    );
    event ParticipantJoined(uint256 indexed billId, address indexed participant, uint8 joinedCount);
    event SharePaid(uint256 indexed billId, address indexed participant, uint256 amount, uint8 paidCount);
    event BillSettled(uint256 indexed billId, address indexed merchant, uint256 total);
    event BillRefunded(uint256 indexed billId);

    error InvalidBill();
    error InvalidParams();
    error NotOpen();
    error Expired();
    error NotExpired();
    error BillFull();
    error AlreadyJoined();
    error AlreadyPaid();
    error NotMerchant();

    uint64 public constant MAX_TTL = 7 days;

    constructor(IERC20 usdc_) {
        usdc = usdc_;
    }

    // ------------------------------------------------------------------ write

    /// @param terminalId  keccak256 of the terminal name, e.g. keccak256("table-12")
    /// @param total       bill total in USDC base units
    /// @param participants number of people splitting (2–50)
    /// @param ttlSeconds  how long the group has to pay before refunds open up
    function createBill(bytes32 terminalId, uint256 total, uint8 participants, uint64 ttlSeconds)
        external
        returns (uint256 billId)
    {
        if (participants < 2 || participants > 50) revert InvalidParams();
        if (total < participants) revert InvalidParams(); // everyone pays at least 1 unit
        if (ttlSeconds == 0 || ttlSeconds > MAX_TTL) revert InvalidParams();

        billId = ++billCount;
        _bills[billId] = Bill({
            merchant: msg.sender,
            terminalId: terminalId,
            total: total,
            paidAmount: 0,
            deadline: uint64(block.timestamp) + ttlSeconds,
            participants: participants,
            joined: 0,
            paidCount: 0,
            status: Status.Open
        });
        if (terminalId != bytes32(0)) activeBillOf[terminalId] = billId;

        emit BillCreated(billId, msg.sender, terminalId, total, participants);
    }

    function join(uint256 billId) external {
        Bill storage b = _open(billId);
        if (_slot[billId][msg.sender] != 0) revert AlreadyJoined();
        _join(billId, b, msg.sender);
    }

    /// @notice Pay your share. Joins you first if you haven't joined yet.
    ///         Requires `usdc.approve(address(this), shareOf(billId, you))` beforehand.
    function payShare(uint256 billId) external nonReentrant {
        Bill storage b = _open(billId);
        if (_slot[billId][msg.sender] == 0) _join(billId, b, msg.sender);
        if (paidBy[billId][msg.sender] != 0) revert AlreadyPaid();

        uint256 amount = _shareAt(b, _slot[billId][msg.sender] - 1);

        // effects
        paidBy[billId][msg.sender] = amount;
        b.paidAmount += amount;
        b.paidCount += 1;
        bool settled = b.paidCount == b.participants;
        if (settled) b.status = Status.Settled;

        // interactions
        usdc.safeTransferFrom(msg.sender, address(this), amount);
        emit SharePaid(billId, msg.sender, amount, b.paidCount);

        if (settled) {
            usdc.safeTransfer(b.merchant, b.total);
            emit BillSettled(billId, b.merchant, b.total);
        }
    }

    /// @notice Return every payment. Anyone may call after the deadline; the merchant may cancel any time.
    function refund(uint256 billId) external nonReentrant {
        Bill storage b = _bills[billId];
        if (b.status != Status.Open) revert NotOpen();
        if (block.timestamp < b.deadline && msg.sender != b.merchant) revert NotExpired();

        b.status = Status.Refunded;
        address[] storage members = _members[billId];
        for (uint256 i; i < members.length; ++i) {
            uint256 amount = paidBy[billId][members[i]];
            if (amount != 0) usdc.safeTransfer(members[i], amount);
        }
        emit BillRefunded(billId);
    }

    // ------------------------------------------------------------------- read

    function getBill(uint256 billId) external view returns (Bill memory) {
        if (_bills[billId].status == Status.None) revert InvalidBill();
        return _bills[billId];
    }

    function getParticipants(uint256 billId)
        external
        view
        returns (address[] memory members, uint256[] memory shares, bool[] memory paid)
    {
        Bill storage b = _bills[billId];
        members = _members[billId];
        shares = new uint256[](members.length);
        paid = new bool[](members.length);
        for (uint256 i; i < members.length; ++i) {
            shares[i] = _shareAt(b, i);
            paid[i] = paidBy[billId][members[i]] != 0;
        }
    }

    /// @notice What `who` owes (or would owe if they joined now). Approve this amount before paying.
    function shareOf(uint256 billId, address who) external view returns (uint256) {
        Bill storage b = _bills[billId];
        if (b.status == Status.None) revert InvalidBill();
        uint256 slot = _slot[billId][who];
        return _shareAt(b, slot == 0 ? b.joined : slot - 1);
    }

    // --------------------------------------------------------------- internal

    function _open(uint256 billId) private view returns (Bill storage b) {
        b = _bills[billId];
        if (b.status != Status.Open) revert NotOpen();
        if (block.timestamp >= b.deadline) revert Expired();
    }

    function _join(uint256 billId, Bill storage b, address who) private {
        if (b.joined >= b.participants) revert BillFull();
        _members[billId].push(who);
        b.joined += 1;
        _slot[billId][who] = b.joined;
        emit ParticipantJoined(billId, who, b.joined);
    }

    /// @dev Equal split; the first person to join absorbs the rounding remainder,
    ///      so every share is known the moment someone joins and the sum is exact.
    function _shareAt(Bill storage b, uint256 index) private view returns (uint256) {
        uint256 base = b.total / b.participants;
        return index == 0 ? base + (b.total % b.participants) : base;
    }
}
