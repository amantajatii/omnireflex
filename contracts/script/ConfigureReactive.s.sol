// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {console2} from "forge-std/console2.sol";
import {ReflexReactive} from "../src/reactive/ReflexReactive.sol";
import {ReflexExecutor} from "../src/executor/ReflexExecutor.sol";
import {Addresses} from "./lib/Addresses.sol";
import {DeploymentRecords} from "./lib/DeploymentRecords.sol";

contract ConfigureReactive is DeploymentRecords {
    /// @notice Registers recorded destinations; replacing one requires REPLACE_EXECUTOR=1 and drops its old mirrors.
    function run() external {
        Addresses.requireLasna();
        ReflexReactive reactive = ReflexReactive(payable(_reactive()));
        _configure(reactive, 1301);
        _configure(reactive, 84532);
    }

    function _configure(ReflexReactive reactive, uint256 chainId) private {
        if (!vm.exists(_path(chainId))) return;
        Record memory r = _read(chainId);
        uint64 next = _replacementLimit(reactive, chainId, r.executor);
        address manager = reactive.pools(keccak256(abi.encode(chainId, r.poolId)));
        require(manager == address(0) || manager == r.poolManager, "Registered pool manager differs from record");
        _start();
        _configureExecutor(reactive, chainId, r.executor, next);
        if (manager == address(0)) reactive.registerPool(chainId, r.poolManager, r.poolId);
        vm.stopBroadcast();
    }

    function _replacementLimit(ReflexReactive reactive, uint256 chainId, address replacement)
        internal
        returns (uint64)
    {
        address old = reactive.executors(chainId);
        if (old == address(0) || old == replacement) return 0;
        require(
            vm.envOr("REPLACE_EXECUTOR", uint256(0)) == 1,
            "Executor differs from registration; set REPLACE_EXECUTOR=1 to drop old mirrors and replace"
        );
        return _oldNextOrderId(chainId, old);
    }

    function _oldNextOrderId(uint256 chainId, address old) internal virtual returns (uint64 next) {
        uint256 lasna = vm.activeFork();
        string memory alias_ = chainId == 1301 ? "unichain_sepolia" : "base_sepolia";
        vm.createSelectFork(alias_);
        next = ReflexExecutor(payable(old)).nextOrderId();
        vm.selectFork(lasna);
    }

    function _configureExecutor(ReflexReactive reactive, uint256 chainId, address replacement, uint64 next) internal {
        address old = reactive.executors(chainId);
        if (old == address(0)) {
            reactive.registerExecutor(chainId, replacement);
        } else if (old != replacement) {
            require(next != 0, "Missing old executor order-id limit");
            for (uint64 id = 1; id < next; ++id) {
                if (reactive.getOrder(chainId, id).status == ReflexReactive.Status.None) continue;
                reactive.dropOrder(chainId, id);
                console2.log("Dropped old executor mirror: chain", chainId);
                console2.log("orderId", uint256(id));
            }
            reactive.replaceExecutor(chainId, replacement);
        }
    }
}
