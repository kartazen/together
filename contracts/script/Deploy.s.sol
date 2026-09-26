// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {GroupCheckout} from "../src/GroupCheckout.sol";
import {MockUSDC} from "../src/MockUSDC.sol";

/// forge script script/Deploy.s.sol --rpc-url monad_testnet --broadcast
/// Set USDC=0x... to reuse an existing token instead of deploying MockUSDC.
contract Deploy is Script {
    function run() external {
        address usdc = vm.envOr("USDC", address(0));
        vm.startBroadcast();
        if (usdc == address(0)) usdc = address(new MockUSDC());
        GroupCheckout checkout = new GroupCheckout(IERC20(usdc));
        vm.stopBroadcast();

        console.log("USDC          ", usdc);
        console.log("GroupCheckout ", address(checkout));
    }
}
