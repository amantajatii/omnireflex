// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {VmSafe} from "forge-std/Vm.sol";
import {console2} from "forge-std/console2.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ReflexFaucet} from "../src/demo/ReflexFaucet.sol";
import {Addresses} from "./lib/Addresses.sol";
import {DemoToken} from "./lib/DemoToken.sol";
import {DeploymentRecords} from "./lib/DeploymentRecords.sol";

contract DeployFaucet is DeploymentRecords {
    function run() external {
        Addresses.destination(block.chainid);
        Record memory r = _read(block.chainid);
        require(r.rdETH.code.length != 0 && r.rdUSD.code.length != 0, "Recorded demo tokens have no code");
        string memory json = vm.readFile(_path(block.chainid));
        ReflexFaucet faucet;
        if (vm.keyExistsJson(json, ".faucet")) {
            faucet = ReflexFaucet(vm.parseJsonAddress(json, ".faucet"));
            _validateReuse(faucet, r);
        }
        address operator = _start();
        require(
            DemoToken(r.rdETH).owner() == operator && DemoToken(r.rdUSD).owner() == operator,
            "Operator must own both demo tokens"
        );
        if (address(faucet) == address(0)) {
            faucet = new ReflexFaucet(IERC20(r.rdETH), IERC20(r.rdUSD), 5e18, 15_000e18, 1 hours);
        }
        uint256 ethBalance = IERC20(r.rdETH).balanceOf(address(faucet));
        uint256 usdBalance = IERC20(r.rdUSD).balanceOf(address(faucet));
        if (ethBalance < 50_000e18) DemoToken(r.rdETH).mint(address(faucet), 50_000e18 - ethBalance);
        if (usdBalance < 150_000_000e18) DemoToken(r.rdUSD).mint(address(faucet), 150_000_000e18 - usdBalance);
        vm.stopBroadcast();
        _writeFaucet(block.chainid, address(faucet));
        console2.log("Faucet", address(faucet));
    }

    function _validateReuse(ReflexFaucet faucet, Record memory r) internal view {
        require(address(faucet).code.length != 0, "Recorded faucet has no code; reconcile deployment record");
        require(
            address(faucet.rdETH()) == r.rdETH && address(faucet.rdUSD()) == r.rdUSD,
            "Recorded faucet token mismatch; reconcile deployment record"
        );
    }

    function _writeFaucet(uint256 chainId, address faucet) internal {
        if (!vm.isContext(VmSafe.ForgeContext.ScriptBroadcast)) return;
        vm.writeJson(_faucetJson(chainId, faucet), _path(chainId));
    }

    function _faucetJson(uint256 chainId, address faucet) internal returns (string memory) {
        string memory root = string.concat("faucet-", vm.toString(chainId));
        vm.serializeJson(root, vm.readFile(_path(chainId)));
        return vm.serializeAddress(root, "faucet", faucet);
    }
}
