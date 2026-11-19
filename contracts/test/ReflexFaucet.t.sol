// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {Test} from "forge-std/Test.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReflexFaucet} from "../src/demo/ReflexFaucet.sol";
import {DemoToken} from "../script/lib/DemoToken.sol";

contract ReflexFaucetTest is Test {
    DemoToken private eth;
    DemoToken private usd;
    ReflexFaucet private faucet;
    address private constant USER = address(0xA11CE);

    function setUp() public {
        vm.warp(1 days);
        eth = new DemoToken("Reflex Demo ETH", "rdETH", address(this));
        usd = new DemoToken("Reflex Demo USD", "rdUSD", address(this));
        faucet = new ReflexFaucet(eth, usd, 5e18, 15_000e18, 1 hours);
        eth.mint(address(faucet), 10e18);
        usd.mint(address(faucet), 30_000e18);
    }

    function test_claimTransfersBothDripsAndEmits() public {
        assertEq(faucet.owner(), address(this));
        assertEq(address(faucet.rdETH()), address(eth));
        assertEq(address(faucet.rdUSD()), address(usd));
        assertEq(faucet.ethDrip(), 5e18);
        assertEq(faucet.usdDrip(), 15_000e18);
        assertEq(faucet.cooldown(), 1 hours);
        vm.expectEmit(true, false, false, true, address(faucet));
        emit ReflexFaucet.Claimed(USER, 5e18, 15_000e18);
        vm.prank(USER);
        faucet.claim();
        assertEq(eth.balanceOf(USER), 5e18);
        assertEq(usd.balanceOf(USER), 15_000e18);
        assertEq(faucet.lastClaim(USER), block.timestamp);
        assertEq(faucet.nextClaimAt(USER), block.timestamp + 1 hours);
    }

    function test_cooldownRejectsUntilExactBoundary() public {
        vm.prank(USER);
        faucet.claim();
        uint256 readyAt = faucet.nextClaimAt(USER);
        vm.warp(readyAt - 1);
        vm.prank(USER);
        vm.expectRevert(abi.encodeWithSelector(ReflexFaucet.CooldownActive.selector, readyAt));
        faucet.claim();
        vm.warp(readyAt);
        vm.prank(USER);
        faucet.claim();
        assertEq(eth.balanceOf(USER), 10e18);
        assertEq(usd.balanceOf(USER), 30_000e18);
    }

    function test_cooldownIsPerAddress() public {
        vm.prank(USER);
        faucet.claim();
        address other = address(0xB0B);
        vm.prank(other);
        faucet.claim();
        assertEq(eth.balanceOf(other), 5e18);
        assertEq(usd.balanceOf(other), 15_000e18);
    }

    function test_emptyEthDoesNotTransferOrConsumeCooldown() public {
        faucet.withdraw(eth, address(this), 10e18);
        _expectEmpty();
    }

    function test_shortUsdDoesNotTransferOrConsumeCooldown() public {
        faucet.withdraw(usd, address(this), 15_000e18 + 1);
        _expectEmpty();
    }

    function test_failedSecondTransferRollsBackFirstTransferAndCooldown() public {
        vm.mockCall(address(usd), abi.encodeCall(IERC20.transfer, (USER, 15_000e18)), abi.encode(false));
        vm.prank(USER);
        vm.expectRevert(abi.encodeWithSelector(SafeERC20.SafeERC20FailedOperation.selector, address(usd)));
        faucet.claim();
        assertEq(eth.balanceOf(USER), 0);
        assertEq(usd.balanceOf(USER), 0);
        assertEq(faucet.lastClaim(USER), 0);
    }

    function test_ownerCanSetDripsCooldownAndWithdraw() public {
        faucet.setDrips(1e18, 3000e18);
        faucet.setCooldown(2 hours);
        assertEq(faucet.ethDrip(), 1e18);
        assertEq(faucet.usdDrip(), 3000e18);
        assertEq(faucet.cooldown(), 2 hours);
        vm.prank(USER);
        faucet.claim();
        assertEq(eth.balanceOf(USER), 1e18);
        assertEq(usd.balanceOf(USER), 3000e18);
        assertEq(faucet.nextClaimAt(USER), block.timestamp + 2 hours);
        faucet.withdraw(eth, USER, 2e18);
        assertEq(eth.balanceOf(USER), 3e18);
    }

    function test_nonOwnerCannotSetDrips() public {
        vm.prank(USER);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, USER));
        faucet.setDrips(1, 2);
    }

    function test_nonOwnerCannotSetCooldown() public {
        vm.prank(USER);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, USER));
        faucet.setCooldown(0);
    }

    function test_nonOwnerCannotWithdraw() public {
        vm.prank(USER);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, USER));
        faucet.withdraw(eth, USER, 1);
    }

    function _expectEmpty() private {
        vm.prank(USER);
        vm.expectRevert(ReflexFaucet.FaucetEmpty.selector);
        faucet.claim();
        assertEq(eth.balanceOf(USER), 0);
        assertEq(usd.balanceOf(USER), 0);
        assertEq(faucet.lastClaim(USER), 0);
    }
}
