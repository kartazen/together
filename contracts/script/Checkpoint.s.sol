// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {GroupCheckout} from "../src/GroupCheckout.sol";
import {MockUSDC} from "../src/MockUSDC.sol";

/// Checkpoint 1 on the real chain: the deployer is the restaurant; three throwaway
/// wallets (keys derived from labels — TESTNET ONLY) each pay $0.01.
///
/// forge script script/Checkpoint.s.sol --rpc-url monad_testnet --account deployer --broadcast --slow
contract Checkpoint is Script {
    GroupCheckout constant CHECKOUT = GroupCheckout(0x371150B970A6381985871fc5E0743F0b3a98c5d2);
    MockUSDC constant USDC = MockUSDC(0xdF6dA3b58f478deF8bDF0D87E27401026b23528a);

    function run() external {
        string[3] memory names = ["together-demo-alice", "together-demo-bob", "together-demo-charlie"];
        uint256[3] memory keys;
        for (uint256 i; i < 3; ++i) keys[i] = uint256(keccak256(bytes(names[i])));

        bytes32 terminal = keccak256("table-12");

        // Restaurant: fund the friends with gas + test USDC, then open the bill.
        vm.startBroadcast();
        for (uint256 i; i < 3; ++i) {
            address friend = vm.addr(keys[i]);
            if (friend.balance < 0.05 ether) payable(friend).transfer(0.1 ether);
            USDC.mint(friend, 1e6); // 1 USDC
        }
        uint256 billId = CHECKOUT.createBill(terminal, 30_000, 3, 1 hours); // $0.03, 3 people
        vm.stopBroadcast();
        console.log("bill id", billId);

        // The merchant is whoever signed createBill (your --account), read back from the chain.
        address merchant = CHECKOUT.getBill(billId).merchant;
        uint256 merchantBefore = USDC.balanceOf(merchant);

        // Friends: approve + pay their share.
        for (uint256 i; i < 3; ++i) {
            vm.startBroadcast(keys[i]);
            USDC.approve(address(CHECKOUT), CHECKOUT.shareOf(billId, vm.addr(keys[i])));
            CHECKOUT.payShare(billId);
            vm.stopBroadcast();
            console.log("paid", i + 1, "of 3 by", vm.addr(keys[i]));
        }

        GroupCheckout.Bill memory b = CHECKOUT.getBill(billId);
        require(b.status == GroupCheckout.Status.Settled, "not settled");
        require(USDC.balanceOf(merchant) - merchantBefore == 30_000, "merchant not paid");
        console.log("SETTLED: merchant received 0.03 USDC");
    }
}
