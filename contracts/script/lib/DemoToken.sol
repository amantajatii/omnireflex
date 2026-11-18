// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @notice Owner-minted, 18-decimal tokens for reproducible testnet pools.
contract DemoToken is ERC20, Ownable {
    constructor(string memory name_, string memory symbol_, address owner_) ERC20(name_, symbol_) Ownable(owner_) {}

    /// @notice Mints demo balances; restricted to the deployment operator.
    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }
}
