// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract ReflexFaucet is Ownable {
    using SafeERC20 for IERC20;

    error CooldownActive(uint256 readyAt);
    error FaucetEmpty();

    event Claimed(address indexed to, uint256 rdETH, uint256 rdUSD);

    IERC20 public immutable rdETH;
    IERC20 public immutable rdUSD;
    uint256 public ethDrip;
    uint256 public usdDrip;
    uint256 public cooldown;
    mapping(address => uint256) public lastClaim;

    constructor(IERC20 rdETH_, IERC20 rdUSD_, uint256 ethDrip_, uint256 usdDrip_, uint256 cooldown_)
        Ownable(msg.sender)
    {
        rdETH = rdETH_;
        rdUSD = rdUSD_;
        ethDrip = ethDrip_;
        usdDrip = usdDrip_;
        cooldown = cooldown_;
    }

    function claim() external {
        uint256 readyAt = nextClaimAt(msg.sender);
        if (block.timestamp < readyAt) revert CooldownActive(readyAt);
        if (rdETH.balanceOf(address(this)) < ethDrip || rdUSD.balanceOf(address(this)) < usdDrip) {
            revert FaucetEmpty();
        }
        lastClaim[msg.sender] = block.timestamp;
        rdETH.safeTransfer(msg.sender, ethDrip);
        rdUSD.safeTransfer(msg.sender, usdDrip);
        emit Claimed(msg.sender, ethDrip, usdDrip);
    }

    function nextClaimAt(address account) public view returns (uint256) {
        return lastClaim[account] + cooldown;
    }

    function setDrips(uint256 ethDrip_, uint256 usdDrip_) external onlyOwner {
        ethDrip = ethDrip_;
        usdDrip = usdDrip_;
    }

    function setCooldown(uint256 cooldown_) external onlyOwner {
        cooldown = cooldown_;
    }

    function withdraw(IERC20 token, address to, uint256 amount) external onlyOwner {
        token.safeTransfer(to, amount);
    }
}
