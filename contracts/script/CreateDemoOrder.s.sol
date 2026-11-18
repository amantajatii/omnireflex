// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import {console2} from "forge-std/console2.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {StateLibrary} from "@uniswap/v4-core/src/libraries/StateLibrary.sol";
import {PoolId} from "@uniswap/v4-core/src/types/PoolId.sol";
import {ReflexReactive} from "../src/reactive/ReflexReactive.sol";
import {ReflexExecutor} from "../src/executor/ReflexExecutor.sol";
import {OrderParams} from "../src/interfaces/ReflexTypes.sol";
import {Addresses} from "./lib/Addresses.sol";
import {DemoToken} from "./lib/DemoToken.sol";
import {DemoSetup} from "./lib/DemoSetup.sol";
import {DeploymentRecords} from "./lib/DeploymentRecords.sol";

contract CreateDemoOrder is DeploymentRecords {
    using SafeCast for uint256;
    using SafeCast for int256;
    using StateLibrary for IPoolManager;

    /// @notice Creates an rdETH sell order. Remote trigger ticks must be supplied from that chain's status output.
    function run() external {
        Addresses.destination(block.chainid);
        Record memory local = _read(block.chainid);
        uint256 triggerChain = vm.envOr("TRIGGER_CHAIN", block.chainid);
        Addresses.destination(triggerChain);
        Record memory trigger = _read(triggerChain);
        (, int24 triggerTick,,) = triggerChain == block.chainid
            ? IPoolManager(trigger.poolManager).getSlot0(PoolId.wrap(trigger.poolId))
            : (uint160(0), vm.envInt("TRIGGER_TICK").toInt24(), uint24(0), uint24(0));
        (uint160 price,,,) = IPoolManager(local.poolManager).getSlot0(PoolId.wrap(local.poolId));
        uint256 ttl = vm.envOr("ORDER_TTL", uint256(1 days));
        require(ttl != 0, "ORDER_TTL must be positive seconds");
        OrderParams memory p = DemoSetup.buildOrder(
            local.key,
            local.rdETH,
            price,
            DemoSetup.TriggerMarket({chainId: triggerChain, key: trigger.key, rdETH: trigger.rdETH, tick: triggerTick}),
            DemoSetup.OrderConfig({
                kind: DemoSetup.kind(vm.envOr("ORDER_KIND", string("stop"))),
                amountIn: vm.envOr("AMOUNT_IN", uint256(1e18)).toUint128(),
                distance: vm.envOr("DISTANCE_TICKS", uint256(200)).toUint24(),
                slippageBps: vm.envOr("SLIPPAGE_BPS", uint256(500)),
                expiry: (block.timestamp + ttl).toUint64()
            })
        );
        ReflexExecutor executor = ReflexExecutor(payable(local.executor));
        uint256 fee = executor.executionFee();
        _checkCapacity(triggerChain, trigger.poolId);
        address operator = _start();
        DemoSetup.ensureBalance(DemoToken(local.rdETH), operator, p.amountIn);
        DemoToken(local.rdETH).approve(local.executor, p.amountIn);
        uint64 id = executor.createOrder{value: fee}(p);
        vm.stopBroadcast();
        console2.log("orderId", id);
        console2.log("amountIn rdETH base units", p.amountIn);
        console2.log("minAmountOut rdUSD base units", p.minAmountOut);
        console2.log("trigger chain", p.trigger.chainId);
        console2.log("inverted", p.trigger.inverted);
        console2.log("lower normalised tick", int256(p.trigger.lowerTick));
        console2.log("upper normalised tick", int256(p.trigger.upperTick));
        console2.log("trail ticks", uint256(p.trigger.trailTicks));
        console2.log("expiry", uint256(p.expiry));
        console2.log("executionFee wei", fee);
    }

    function _checkCapacity(uint256 triggerChain, bytes32 poolId) internal {
        address reactive = _reactive();
        uint256 destination = vm.activeFork();
        vm.createSelectFork("lasna");
        uint256 count = ReflexReactive(payable(reactive)).activeOrderCount(triggerChain, poolId);
        uint256 cap = ReflexReactive(payable(reactive)).MAX_ORDERS_PER_OWNER_PER_POOL();
        vm.selectFork(destination);
        console2.log("Trigger pool tracked orders (conservative owner-cap fallback)", count);
        _requireCapacity(count, cap);
    }

    function _requireCapacity(uint256 count, uint256 cap) internal view {
        require(
            count < cap || vm.envOr("FORCE", uint256(0)) == 1,
            "Trigger pool has >=4 tracked orders (owner-count view unavailable); cancel orders or set FORCE=1"
        );
    }
}
