// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {GroupCheckoutV2 as G} from "../src/GroupCheckoutV2.sol";
import {MockUSDC} from "../src/MockUSDC.sol";

contract GroupCheckoutV2Test is Test {
    MockUSDC usdc;
    G checkout;
    address merchant = makeAddr("merchant");
    address[] people;
    bytes32 table = keccak256("table-12");

    function setUp() public {
        usdc = new MockUSDC();
        checkout = new G(IERC20(address(usdc)));
        for (uint256 i; i < 20; ++i) {
            address p = makeAddr(string.concat("friend-", vm.toString(i)));
            people.push(p);
            usdc.mint(p, 1000e6);
            vm.prank(p);
            usdc.approve(address(checkout), type(uint256).max);
        }
    }

    function _create(uint256 total) internal returns (uint256 id) {
        vm.prank(merchant);
        id = checkout.createBill(table, total, 1 hours);
    }

    function _join(uint256 id, uint256 n) internal {
        for (uint256 i; i < n; ++i) {
            vm.prank(people[i]);
            checkout.join(id);
        }
    }

    function _agree(uint256 id, uint256 n, G.Mode mode) internal {
        vm.prank(people[0]);
        checkout.proposeMode(id, mode);
        for (uint256 i = 1; i < n; ++i) {
            vm.prank(people[i]);
            checkout.acceptMode(id);
        }
    }

    function _payAll(uint256 id, uint256 n) internal {
        for (uint256 i; i < n; ++i) {
            vm.prank(people[i]);
            checkout.payShare(id);
        }
    }

    function test_split_fullFlow() public {
        uint256 id = _create(100); // 34 + 33 + 33
        _join(id, 3);
        _agree(id, 3, G.Mode.Split);
        assertEq(uint8(checkout.getBill(id).status), uint8(G.Status.Paying));
        assertEq(checkout.shareOf(id, people[0]), 34);
        assertEq(checkout.shareOf(id, people[1]), 33);
        _payAll(id, 3);
        assertEq(usdc.balanceOf(merchant), 100);
        assertEq(uint8(checkout.getBill(id).status), uint8(G.Status.Settled));
        assertEq(usdc.balanceOf(address(checkout)), 0);
    }

    function test_chaos_fullFlow_sharesSumAndFloor() public {
        uint256 id = _create(84e6);
        _join(id, 4);
        vm.prevrandao(bytes32(uint256(42)));
        _agree(id, 4, G.Mode.Chaos);
        (address[] memory m, uint256[] memory shares,,) = checkout.getParticipants(id);
        uint256 sum;
        for (uint256 i; i < m.length; ++i) {
            assertGe(shares[i], (84e6 * 300) / 10_000);
            sum += shares[i];
        }
        assertEq(sum, 84e6);
        _payAll(id, 4);
        assertEq(usdc.balanceOf(merchant), 84e6);
    }

    function test_decline_reopensTable() public {
        uint256 id = _create(30_000);
        _join(id, 2);
        vm.prank(people[0]);
        checkout.proposeMode(id, G.Mode.Chaos);

        vm.prank(people[2]);
        vm.expectRevert(G.WrongStatus.selector); // table locked while voting
        checkout.join(id);

        vm.prank(people[1]);
        checkout.declineMode(id);
        G.Bill memory b = checkout.getBill(id);
        assertEq(uint8(b.status), uint8(G.Status.Joining));
        assertEq(uint8(b.mode), uint8(G.Mode.None));

        _join2(id); // a third friend can join again
        vm.prank(people[1]);
        checkout.proposeMode(id, G.Mode.Split);
        vm.prank(people[1]);
        vm.expectRevert(G.AlreadyAccepted.selector);
        checkout.acceptMode(id);
        vm.prank(people[0]);
        checkout.acceptMode(id); // old-round acceptance doesn't count; people[0] must accept again
        assertEq(uint8(checkout.getBill(id).status), uint8(G.Status.Agreeing));
        vm.prank(people[2]);
        checkout.acceptMode(id);
        assertEq(uint8(checkout.getBill(id).status), uint8(G.Status.Paying));
    }

    function _join2(uint256 id) internal {
        vm.prank(people[2]);
        checkout.join(id);
    }

    function test_revert_rules() public {
        uint256 id = _create(30_000);
        vm.prank(people[0]);
        checkout.join(id);

        vm.prank(people[0]);
        vm.expectRevert(G.NotEnoughPeople.selector);
        checkout.proposeMode(id, G.Mode.Split);

        vm.prank(people[1]);
        vm.expectRevert(G.NotMember.selector);
        checkout.proposeMode(id, G.Mode.Split);

        vm.prank(people[0]);
        vm.expectRevert(G.AlreadyJoined.selector);
        checkout.join(id);

        vm.prank(people[0]);
        vm.expectRevert(G.WrongStatus.selector); // can't pay before shares exist
        checkout.payShare(id);

        _join2(id);
        vm.prank(people[1]);
        checkout.join(id);
        vm.prank(people[0]);
        vm.expectRevert(G.InvalidParams.selector);
        checkout.proposeMode(id, G.Mode.None);
    }

    function test_maxParticipants() public {
        uint256 id = _create(1e6);
        _join(id, 20);
        address extra = makeAddr("extra");
        vm.prank(extra);
        vm.expectRevert(G.BillFull.selector);
        checkout.join(id);
        _agree(id, 20, G.Mode.Chaos);
        _payAll(id, 20);
        assertEq(usdc.balanceOf(merchant), 1e6);
    }

    function test_refund_afterDeadline_midPayment() public {
        uint256 id = _create(90_000);
        _join(id, 3);
        _agree(id, 3, G.Mode.Split);
        vm.prank(people[0]);
        checkout.payShare(id);
        vm.expectRevert(G.NotExpired.selector);
        checkout.refund(id);
        vm.warp(block.timestamp + 1 hours);
        checkout.refund(id);
        assertEq(usdc.balanceOf(people[0]), 1000e6);
        assertEq(usdc.balanceOf(address(checkout)), 0);
    }

    function test_merchantCancelsWhileJoining() public {
        uint256 id = _create(90_000);
        _join(id, 2);
        vm.prank(merchant);
        checkout.refund(id);
        assertEq(uint8(checkout.getBill(id).status), uint8(G.Status.Refunded));
    }

    function testFuzz_chaos_alwaysExact(uint256 total, uint8 n, uint256 rand) public {
        n = uint8(bound(n, 2, 20));
        total = bound(total, 100, 1_000e6); // each friend holds 1,000 USDC
        uint256 id = _create(total);
        _join(id, n);
        vm.prevrandao(bytes32(rand));
        _agree(id, n, G.Mode.Chaos);
        (, uint256[] memory shares,,) = checkout.getParticipants(id);
        uint256 sum;
        for (uint256 i; i < n; ++i) {
            assertGe(shares[i], (total * 300) / 10_000);
            sum += shares[i];
        }
        assertEq(sum, total);
        _payAll(id, n);
        assertEq(usdc.balanceOf(merchant), total);
        assertEq(usdc.balanceOf(address(checkout)), 0);
    }

    function testFuzz_split_alwaysExact(uint256 total, uint8 n) public {
        n = uint8(bound(n, 2, 20));
        total = bound(total, 100, 1_000e6); // each friend holds 1,000 USDC
        uint256 id = _create(total);
        _join(id, n);
        _agree(id, n, G.Mode.Split);
        _payAll(id, n);
        assertEq(usdc.balanceOf(merchant), total);
    }
}
