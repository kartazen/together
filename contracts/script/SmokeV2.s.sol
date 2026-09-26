// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {GroupCheckoutV2 as G} from "../src/GroupCheckoutV2.sol";
import {MockUSDC} from "../src/MockUSDC.sol";

/// One real CHAOS round on Monad testnet with the three throwaway demo wallets from Checkpoint.s.sol
/// (keys derived from labels — TESTNET ONLY): charlie = restaurant, alice + bob = guests.
///
/// CHECKOUT=0x… forge script script/SmokeV2.s.sol --rpc-url monad_testnet --broadcast --slow \
///   --with-gas-price 110gwei --priority-gas-price 2gwei
contract SmokeV2 is Script {
    MockUSDC constant USDC = MockUSDC(0xdF6dA3b58f478deF8bDF0D87E27401026b23528a);

    function run() external {
        G c = G(vm.envAddress("CHECKOUT"));
        uint256 restaurant = uint256(keccak256("together-demo-charlie"));
        uint256 alice = uint256(keccak256("together-demo-alice"));
        uint256 bob = uint256(keccak256("together-demo-bob"));
        uint256 total = 30_000; // $0.03

        vm.startBroadcast(restaurant);
        uint256 id = c.createBill(keccak256("smoke-test"), total, 1 hours);
        payable(vm.addr(bob)).transfer(0.03 ether); // bob does the most transactions
        vm.stopBroadcast();

        _as(alice, abi.encodeCall(G.join, (id)), address(c));
        _as(bob, abi.encodeCall(G.join, (id)), address(c));
        _as(alice, abi.encodeCall(G.proposeMode, (id, G.Mode.Chaos)), address(c));
        _as(bob, abi.encodeCall(G.acceptMode, (id)), address(c)); // last accept → shares assigned on-chain

        // Shares are only final on-chain, so approve the whole bill rather than a simulated share.
        _as(alice, abi.encodeCall(USDC.approve, (address(c), total)), address(USDC));
        _as(alice, abi.encodeCall(G.payShare, (id)), address(c));
        _as(bob, abi.encodeCall(USDC.approve, (address(c), total)), address(USDC));
        _as(bob, abi.encodeCall(G.payShare, (id)), address(c));

        console.log("bill", id);
    }

    function _as(uint256 key, bytes memory data, address to) internal {
        vm.startBroadcast(key);
        (bool ok, bytes memory ret) = to.call(data);
        vm.stopBroadcast();
        if (!ok) {
            assembly {
                revert(add(ret, 32), mload(ret))
            }
        }
    }
}
