// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {Test, Vm} from "forge-std/Test.sol";
import {IPayable} from "@reactive/src/interfaces/IPayable.sol";
import {AbstractReactive} from "@reactive/src/base/AbstractReactive.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {ReflexExecutor} from "../src/executor/ReflexExecutor.sol";
import {ReflexReactive} from "../src/reactive/ReflexReactive.sol";
import {IReflexExecutor} from "../src/interfaces/IReflexExecutor.sol";
import {IReflexReactive} from "../src/interfaces/IReflexReactive.sol";
import {TriggerParams, NO_UPPER_TICK} from "../src/interfaces/ReflexTypes.sol";
import {ConfigureReactive} from "../script/ConfigureReactive.s.sol";
import {CreateDemoOrder} from "../script/CreateDemoOrder.s.sol";
import {DeployDestination} from "../script/DeployDestination.s.sol";
import {DeploymentRecords} from "../script/lib/DeploymentRecords.sol";
import {MockSystemContract} from "./mocks/MockSystemContract.sol";

contract ConfigurationHarness is ConfigureReactive {
    address public queriedOld;
    uint256 public queriedChain;

    function prepare(ReflexReactive reactive, uint256 chain, address replacement) external returns (uint64) {
        return _replacementLimit(reactive, chain, replacement);
    }

    function applyReplacement(ReflexReactive reactive, uint256 chain, address replacement, uint64 next) external {
        _configureExecutor(reactive, chain, replacement, next);
    }

    function _oldNextOrderId(uint256 chain, address old) internal override returns (uint64) {
        queriedOld = old;
        queriedChain = chain;
        return 4;
    }
}

contract CapacityHarness is CreateDemoOrder {
    function check(uint256 count) external view {
        _requireCapacity(count, 4);
    }
}

contract ReuseHarness is DeployDestination {
    function check(Record calldata r, address reactive) external view {
        _validateReuse(r, reactive);
    }
}

contract ScriptGuardsTest is Test {
    address private constant SYSTEM = 0x8888888888888888888888888888888888888888;
    address private constant OLD = address(0x1111);
    address private constant NEW = address(0x2222);
    bytes32 private constant POOL = keccak256("demo pool");

    function test_replacementRequiresOptInAndDropsOnlyTrackedIds() public {
        vm.etch(SYSTEM, address(new MockSystemContract()).code);
        ReflexReactive reactive = new ReflexReactive();
        reactive.registerExecutor(1301, OLD);
        reactive.registerPool(1301, address(0x3333), POOL);
        _mirror(reactive, 1);
        _mirror(reactive, 3);
        ConfigurationHarness harness = new ConfigurationHarness();
        reactive.transferOwnership(address(harness));
        vm.setEnv("REPLACE_EXECUTOR", "0");
        vm.expectRevert("Executor differs from registration; set REPLACE_EXECUTOR=1 to drop old mirrors and replace");
        harness.prepare(reactive, 1301, NEW);
        vm.setEnv("REPLACE_EXECUTOR", "1");
        uint64 next = harness.prepare(reactive, 1301, NEW);
        assertEq(next, 4);
        assertEq(harness.queriedOld(), OLD);
        assertEq(harness.queriedChain(), 1301);
        vm.recordLogs();
        harness.applyReplacement(reactive, 1301, NEW, next);
        Vm.Log[] memory logs = vm.getRecordedLogs();
        assertEq(logs.length, 3);
        assertEq(logs[0].topics[0], IReflexReactive.OrderClosed.selector);
        assertEq(uint256(logs[0].topics[2]), 1);
        assertEq(logs[1].topics[0], IReflexReactive.OrderClosed.selector);
        assertEq(uint256(logs[1].topics[2]), 3);
        assertEq(logs[2].topics[0], IReflexReactive.ExecutorReplaced.selector);
        assertEq(reactive.activeOrderCount(1301, POOL), 0);
        assertEq(reactive.executors(1301), NEW);
        vm.setEnv("REPLACE_EXECUTOR", "0");
        assertEq(harness.prepare(reactive, 1301, NEW), 0);
        assertEq(harness.queriedOld(), OLD);
    }

    function test_capacityFallbackAndForceOverride() public {
        CapacityHarness harness = new CapacityHarness();
        vm.setEnv("FORCE", "0");
        harness.check(3);
        vm.expectRevert(
            "Trigger pool has >=4 tracked orders (owner-count view unavailable); cancel orders or set FORCE=1"
        );
        harness.check(4);
        vm.setEnv("FORCE", "1");
        harness.check(20);
        vm.setEnv("FORCE", "0");
    }

    function test_reuseRejectsMissingCodeAndWrongCallbackSender() public {
        ReuseHarness harness = new ReuseHarness();
        DeploymentRecords.Record memory r;
        r.executor = address(0x1234);
        vm.expectRevert("Recorded executor has no code; reconcile deployment record");
        harness.check(r, address(0x5555));
        ReflexExecutor executor =
            new ReflexExecutor(IPayable(payable(address(0x4444))), address(0x5555), IPoolManager(address(0x6666)));
        r.executor = address(executor);
        harness.check(r, address(0x5555));
        vm.expectRevert(
            bytes(
                string.concat(
                    "Callback sender mismatch: delete deployments/",
                    vm.toString(block.chainid),
                    ".json and redeploy this destination (recover old orders first)"
                )
            )
        );
        harness.check(r, address(0x7777));
    }

    function _mirror(ReflexReactive reactive, uint64 id) private {
        AbstractReactive.LogRecord memory log_;
        log_.chainId = 1301;
        log_.contractAddress = OLD;
        log_.topic0 = uint256(IReflexExecutor.OrderCreated.selector);
        log_.topic1 = id;
        log_.topic2 = uint256(uint160(address(this)));
        log_.data = abi.encode(TriggerParams(1301, POOL, false, -100, NO_UPPER_TICK, 0), uint64(0));
        vm.prank(SYSTEM);
        reactive.react(log_);
    }
}
