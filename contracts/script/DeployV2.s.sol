// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {GroupCheckoutV2} from "../src/GroupCheckoutV2.sol";

/// forge script script/DeployV2.s.sol --rpc-url monad_testnet --account deployer --broadcast
/// Reuses the test USDC already on Monad testnet (override with USDC=0x...).
contract DeployV2 is Script {
    function run() external {
        address usdc = vm.envOr("USDC", address(0xdF6dA3b58f478deF8bDF0D87E27401026b23528a));
        vm.startBroadcast();
        GroupCheckoutV2 checkout = new GroupCheckoutV2(IERC20(usdc));
        vm.stopBroadcast();
        console.log("USDC            ", usdc);
        console.log("GroupCheckoutV2 ", address(checkout));
    }
}
