// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {GroupCheckout} from "../src/GroupCheckout.sol";
import {MockUSDC} from "../src/MockUSDC.sol";

contract GroupCheckoutTest is Test {
    MockUSDC usdc;
    GroupCheckout checkout;

    address merchant = makeAddr("merchant");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    address charlie = makeAddr("charlie");
    address dave = makeAddr("dave");
    bytes32 table12 = keccak256("table-12");

    function setUp() public {
        usdc = new MockUSDC();
        checkout = new GroupCheckout(IERC20(address(usdc)));
        address[4] memory people = [alice, bob, charlie, dave];
        for (uint256 i; i < people.length; ++i) {
            usdc.mint(people[i], 100e6);
            vm.prank(people[i]);
            usdc.approve(address(checkout), type(uint256).max);
        }
    }

    function _create(uint256 total, uint8 n) internal returns (uint256 id) {
        vm.prank(merchant);
        id = checkout.createBill(table12, total, n, 1 hours);
    }

    function _pay(address who, uint256 id) internal {
        vm.prank(who);
        checkout.payShare(id);
    }

    /// The checkpoint-1 demo: $0.03, 3 people, $0.01 each.
    function test_checkpointDemo() public {
        uint256 id = _create(30_000, 3);
        assertEq(checkout.activeBillOf(table12), id);

        _pay(alice, id);
        _pay(bob, id);
        assertEq(uint8(checkout.getBill(id).status), uint8(GroupCheckout.Status.Open));
        assertEq(usdc.balanceOf(merchant), 0);

        vm.expectEmit(true, true, false, true);
        emit GroupCheckout.BillSettled(id, merchant, 30_000);
        _pay(charlie, id);

        GroupCheckout.Bill memory b = checkout.getBill(id);
        assertEq(uint8(b.status), uint8(GroupCheckout.Status.Settled));
        assertEq(b.paidCount, 3);
        assertEq(usdc.balanceOf(merchant), 30_000);
        assertEq(usdc.balanceOf(address(checkout)), 0);
        assertEq(usdc.balanceOf(alice), 100e6 - 10_000);
    }

    function test_remainderGoesToFirstJoiner_sumIsExact() public {
        uint256 id = _create(100, 3); // 34 + 33 + 33
        assertEq(checkout.shareOf(id, alice), 34);
        _pay(alice, id);
        assertEq(checkout.shareOf(id, bob), 33);
        _pay(bob, id);
        _pay(charlie, id);
        assertEq(usdc.balanceOf(merchant), 100);
    }

    function test_joinThenPay_sharesMatchParticipantsView() public {
        uint256 id = _create(90_000, 3);
        vm.prank(bob);
        checkout.join(id);
        _pay(alice, id);
        (address[] memory members, uint256[] memory shares, bool[] memory paid) = checkout.getParticipants(id);
        assertEq(members[0], bob);
        assertEq(shares[0] + shares[1], 60_000);
        assertFalse(paid[0]);
        assertTrue(paid[1]);
    }

    function test_revert_doublePay() public {
        uint256 id = _create(30_000, 3);
        _pay(alice, id);
        vm.expectRevert(GroupCheckout.AlreadyPaid.selector);
        _pay(alice, id);
    }

    function test_revert_fourthPerson() public {
        uint256 id = _create(30_000, 3);
        _pay(alice, id);
        _pay(bob, id);
        vm.prank(charlie);
        checkout.join(id);
        vm.expectRevert(GroupCheckout.BillFull.selector);
        _pay(dave, id);
    }

    function test_revert_payAfterSettle() public {
        uint256 id = _create(20_000, 2);
        _pay(alice, id);
        _pay(bob, id);
        vm.expectRevert(GroupCheckout.NotOpen.selector);
        _pay(charlie, id);
    }

    function test_refund_onlyAfterDeadline_returnsExactly() public {
        uint256 id = _create(30_000, 3);
        _pay(alice, id);
        _pay(bob, id);

        vm.prank(dave);
        vm.expectRevert(GroupCheckout.NotExpired.selector);
        checkout.refund(id);

        vm.warp(block.timestamp + 1 hours);
        vm.expectRevert(GroupCheckout.Expired.selector);
        _pay(charlie, id);

        vm.prank(dave);
        checkout.refund(id);
        assertEq(usdc.balanceOf(alice), 100e6);
        assertEq(usdc.balanceOf(bob), 100e6);
        assertEq(usdc.balanceOf(address(checkout)), 0);
        assertEq(uint8(checkout.getBill(id).status), uint8(GroupCheckout.Status.Refunded));
    }

    function test_merchantCanCancelEarly() public {
        uint256 id = _create(30_000, 3);
        _pay(alice, id);
        vm.prank(merchant);
        checkout.refund(id);
        assertEq(usdc.balanceOf(alice), 100e6);
    }

    function test_revert_badParams() public {
        vm.startPrank(merchant);
        vm.expectRevert(GroupCheckout.InvalidParams.selector);
        checkout.createBill(table12, 30_000, 1, 1 hours);
        vm.expectRevert(GroupCheckout.InvalidParams.selector);
        checkout.createBill(table12, 2, 3, 1 hours);
        vm.expectRevert(GroupCheckout.InvalidParams.selector);
        checkout.createBill(table12, 30_000, 3, 0);
        vm.stopPrank();
    }

    function testFuzz_equalSplitAlwaysExact(uint256 total, uint8 n) public {
        n = uint8(bound(n, 2, 4));
        total = bound(total, n, 100e6);
        uint256 id = _create(total, n);
        address[4] memory people = [alice, bob, charlie, dave];
        for (uint256 i; i < n; ++i) _pay(people[i], id);
        assertEq(usdc.balanceOf(merchant), total);
        assertEq(usdc.balanceOf(address(checkout)), 0);
    }
}
