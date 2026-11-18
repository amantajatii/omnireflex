// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {ReflexExecutor} from "../src/executor/ReflexExecutor.sol";
import {Addresses} from "./lib/Addresses.sol";
import {DeploymentRecords} from "./lib/DeploymentRecords.sol";

contract ConfigureCrossChain is DeploymentRecords {
    /// @notice Allows the other recorded destination's pool to trigger local orders.
    function run() external {
        uint256 other = Addresses.otherDestination(block.chainid);
        if (!vm.exists(_path(other))) return;
        Record memory local = _read(block.chainid);
        Record memory remote = _read(other);
        ReflexExecutor executor = ReflexExecutor(payable(local.executor));
        if (executor.triggerPools(other, remote.poolId)) return;
        _start();
        executor.allowTriggerPool(other, remote.poolId);
        vm.stopBroadcast();
    }
}
