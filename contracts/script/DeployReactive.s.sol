// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {VmSafe} from "forge-std/Vm.sol";
import {console2} from "forge-std/console2.sol";
import {ReflexReactive} from "../src/reactive/ReflexReactive.sol";
import {Addresses} from "./lib/Addresses.sol";
import {DeploymentRecords} from "./lib/DeploymentRecords.sol";

contract DeployReactive is DeploymentRecords {
    /// @notice Deploys and records the Lasna reactive contract; an existing live record is reused.
    function run() external {
        Addresses.requireLasna();
        if (vm.exists(_path(block.chainid))) {
            address existing = _reactive();
            require(existing.code.length != 0, "Recorded reactive has no code; reconcile deployment record");
            console2.log("Reusing reactive", existing);
            return;
        }
        uint256 funding = vm.envOr("REACTIVE_FUNDING", uint256(0.5 ether));
        _start();
        ReflexReactive reactive = new ReflexReactive{value: funding}();
        vm.stopBroadcast();
        if (vm.isContext(VmSafe.ForgeContext.ScriptBroadcast)) {
            vm.serializeAddress("lasna", "system", Addresses.SYSTEM);
            vm.writeJson(vm.serializeAddress("lasna", "reactive", address(reactive)), _path(block.chainid));
        }
        console2.log("Reactive", address(reactive));
    }
}
