// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Testnet-only USDC stand-in: 6 decimals and a public faucet.
contract MockUSDC is ERC20 {
    uint256 public constant FAUCET_LIMIT = 1_000e6;

    constructor() ERC20("Test USD Coin", "USDC") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    /// @notice Anyone can mint up to 1,000 test USDC per call.
    function mint(address to, uint256 amount) external {
        require(amount <= FAUCET_LIMIT, "faucet limit");
        _mint(to, amount);
    }
}
