// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {GroupCheckoutV2 as G} from "../src/GroupCheckoutV2.sol";
import {MockUSDC} from "../src/MockUSDC.sol";

/// "Fake friends" for demos on GroupCheckoutV2 (keys derived from labels — TESTNET ONLY).
/// The deployer tops them up with MON + test USDC as needed.
///
///   ACTION=join   COUNT=2  — friends join the table's open bill
///   ACTION=accept          — every friend who hasn't accepted the proposed mode accepts
///   ACTION=pay             — every friend who hasn't paid pays their share
///
/// CHECKOUT=0x… TERMINAL=table-12 ACTION=join COUNT=2 \
///   forge script script/Friends.s.sol --rpc-url monad_testnet --account deployer --broadcast --slow
contract Friends is Script {
    MockUSDC constant USDC = MockUSDC(0xdF6dA3b58f478deF8bDF0D87E27401026b23528a);

    function run() external {
        G checkout = G(vm.envAddress("CHECKOUT"));
        string memory terminal = vm.envOr("TERMINAL", string("table-12"));
        string memory action = vm.envOr("ACTION", string("join"));
        uint256 count = vm.envOr("COUNT", uint256(2));

        uint256 billId = checkout.activeBillOf(keccak256(bytes(terminal)));
        require(billId != 0, "no bill on this table");
        console.log("bill", billId, action);

        bytes32 a = keccak256(bytes(action));
        if (a == keccak256("join")) {
            for (uint256 i; i < count; ++i) {
                (uint256 key, address friend) = _friend(i);
                _fund(friend, 0);
                vm.startBroadcast(key);
                checkout.join(billId);
                vm.stopBroadcast();
                console.log("joined", friend);
            }
        } else if (a == keccak256("accept")) {
            _acceptAll(checkout, billId);
        } else if (a == keccak256("pay")) {
            _payAll(checkout, billId);
        }
    }

    function _acceptAll(G checkout, uint256 billId) internal {
        (address[] memory members,, bool[] memory accepted,) = checkout.getParticipants(billId);
        for (uint256 i; i < 50; ++i) {
            (uint256 key, address friend) = _friend(i);
            (bool found, uint256 idx) = _indexOf(members, friend);
            if (!found || accepted[idx]) continue;
            vm.startBroadcast(key);
            checkout.acceptMode(billId);
            vm.stopBroadcast();
            console.log("accepted", friend);
        }
    }

    function _payAll(G checkout, uint256 billId) internal {
        (address[] memory members, uint256[] memory shares,, bool[] memory paid) = checkout.getParticipants(billId);
        for (uint256 i; i < 50; ++i) {
            (uint256 key, address friend) = _friend(i);
            (bool found, uint256 idx) = _indexOf(members, friend);
            if (!found || paid[idx]) continue;
            _payOne(checkout, billId, key, friend, shares[idx]);
        }
    }

    function _payOne(G checkout, uint256 billId, uint256 key, address friend, uint256 share) internal {
        _fund(friend, share);
        vm.startBroadcast(key);
        USDC.approve(address(checkout), share);
        checkout.payShare(billId);
        vm.stopBroadcast();
        console.log("paid", share, friend);
    }

    function _friend(uint256 i) internal pure returns (uint256 key, address addr) {
        key = uint256(keccak256(abi.encodePacked("together-demo-friend-", vm.toString(i))));
        addr = vm.addr(key);
    }

    function _fund(address friend, uint256 usdcNeeded) internal {
        vm.startBroadcast();
        if (friend.balance < 0.05 ether) payable(friend).transfer(0.1 ether);
        if (USDC.balanceOf(friend) < usdcNeeded) USDC.mint(friend, usdcNeeded > 1e6 ? usdcNeeded : 1e6);
        vm.stopBroadcast();
    }

    function _indexOf(address[] memory list, address who) internal pure returns (bool, uint256) {
        for (uint256 i; i < list.length; ++i) if (list[i] == who) return (true, i);
        return (false, 0);
    }
}
