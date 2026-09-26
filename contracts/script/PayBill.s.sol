// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {GroupCheckout} from "../src/GroupCheckout.sol";
import {MockUSDC} from "../src/MockUSDC.sol";

/// "Friends simulator": pays the bill that's currently open on a table with throwaway demo
/// wallets (keys derived from labels — TESTNET ONLY). Use it until phones are wired to the chain.
///
/// TERMINAL=table-12 forge script script/PayBill.s.sol --rpc-url monad_testnet --account deployer --broadcast --slow
/// Pay only some shares: add COUNT=1
contract PayBill is Script {
    GroupCheckout constant CHECKOUT = GroupCheckout(0x371150B970A6381985871fc5E0743F0b3a98c5d2);
    MockUSDC constant USDC = MockUSDC(0xdF6dA3b58f478deF8bDF0D87E27401026b23528a);

    function run() external {
        string memory terminal = vm.envOr("TERMINAL", string("table-12"));
        uint256 billId = CHECKOUT.activeBillOf(keccak256(bytes(terminal)));
        require(billId != 0, "no bill on this table");
        GroupCheckout.Bill memory b = CHECKOUT.getBill(billId);
        require(b.status == GroupCheckout.Status.Open, "bill is not open");

        uint256 remaining = b.participants - b.paidCount;
        uint256 count = vm.envOr("COUNT", remaining);
        if (count > remaining) count = remaining;
        console.log("bill", billId, "paying shares:", count);

        uint256 paid;
        for (uint256 i; paid < count && i < 50; ++i) {
            uint256 key = uint256(keccak256(abi.encodePacked("together-demo-friend-", vm.toString(i))));
            address friend = vm.addr(key);
            if (CHECKOUT.paidBy(billId, friend) != 0) continue; // already paid this bill

            uint256 share = CHECKOUT.shareOf(billId, friend);
            vm.startBroadcast(); // the deployer tops the friend up with gas + test USDC
            if (friend.balance < 0.05 ether) payable(friend).transfer(0.1 ether);
            if (USDC.balanceOf(friend) < share) USDC.mint(friend, share > 1e6 ? share : 1e6);
            vm.stopBroadcast();

            vm.startBroadcast(key);
            USDC.approve(address(CHECKOUT), share);
            CHECKOUT.payShare(billId);
            vm.stopBroadcast();
            paid++;
            console.log("paid share", CHECKOUT.getBill(billId).paidCount, "by", friend);
        }
        if (CHECKOUT.getBill(billId).status == GroupCheckout.Status.Settled) console.log("SETTLED");
    }
}
