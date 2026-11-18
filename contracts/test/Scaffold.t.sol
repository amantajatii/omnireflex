// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import { Test, Vm } from "forge-std/Test.sol";
import { IPoolManager } from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import { ISystemContract } from "@reactive/src/interfaces/ISystemContract.sol";
import { AbstractReactive } from "@reactive/src/base/AbstractReactive.sol";

import { IReflexExecutor } from "../src/interfaces/IReflexExecutor.sol";
import { NO_LOWER_TICK, TriggerParams } from "../src/interfaces/ReflexTypes.sol";
import { MockSystemContract } from "./mocks/MockSystemContract.sol";

/// @dev Minimal reactive contract used only to prove the Omni test harness works.
contract ProbeReactive is AbstractReactive {
    uint256 public lastTopic1;

    constructor(uint256 chainId_, address origin_, uint256 topic0_) {
        SYSTEM.subscribe(chainId_, origin_, topic0_, REACTIVE_IGNORE, REACTIVE_IGNORE, REACTIVE_IGNORE);
    }

    function react(LogRecord memory log_) external onlySystem {
        lastTopic1 = log_.topic1;
        SYSTEM.requestCallbackV_1_0(
            ISystemContract.CallbackConfiguration_V_1_0({
                chainId: log_.chainId,
                recipient: address(0xBEEF),
                gasLimit: 500_000,
                payload: abi.encodeWithSignature("ping(address)", address(0))
            })
        );
    }
}

/// @dev Emits the executor's OrderCreated exactly as the real executor will.
contract OrderCreatedEmitter {
    function emitCreated(uint64 orderId, TriggerParams calldata trigger, uint64 expiry) external {
        emit IReflexExecutor.OrderCreated(orderId, msg.sender, trigger, expiry);
    }
}

/// @notice Checks the scaffold: dependency wiring, the Omni mock harness, and the
///         event encodings shared between executor, reactive contract and indexer.
contract ScaffoldTest is Test {
    address internal constant SYSTEM_ADDR = 0x8888888888888888888888888888888888888888;
    uint256 internal constant UNICHAIN_SEPOLIA = 1301;

    MockSystemContract internal sys;

    function setUp() public {
        vm.etch(SYSTEM_ADDR, address(new MockSystemContract()).code);
        sys = MockSystemContract(payable(SYSTEM_ADDR));
    }

    function test_swapTopicMatchesV4Signature() public pure {
        assertEq(
            IPoolManager.Swap.selector,
            keccak256("Swap(bytes32,address,int128,int128,uint160,uint128,int24,uint24)")
        );
    }

    function test_reactiveSubscribesThroughSystemContract() public {
        ProbeReactive probe = new ProbeReactive(UNICHAIN_SEPOLIA, address(0xCAFE), 42);
        assertTrue(sys.isSubscribed(address(probe), UNICHAIN_SEPOLIA, address(0xCAFE), 42, _ignore()));
    }

    function test_reactRejectsNonSystemCaller() public {
        ProbeReactive probe = new ProbeReactive(UNICHAIN_SEPOLIA, address(0xCAFE), 42);
        AbstractReactive.LogRecord memory log_;
        vm.expectRevert();
        probe.react(log_);
    }

    function test_reactRequestsCallbackWhenCalledBySystem() public {
        ProbeReactive probe = new ProbeReactive(UNICHAIN_SEPOLIA, address(0xCAFE), 42);
        AbstractReactive.LogRecord memory log_;
        log_.chainId = UNICHAIN_SEPOLIA;
        log_.topic1 = 7;

        vm.prank(SYSTEM_ADDR);
        probe.react(log_);

        assertEq(probe.lastTopic1(), 7);
        assertEq(sys.callbackCount(), 1);
        assertEq(sys.callbackAt(0).recipient, address(0xBEEF));
    }

    function test_orderCreatedDataDecodesAsTriggerAndExpiry() public {
        TriggerParams memory trigger = TriggerParams({
            chainId: UNICHAIN_SEPOLIA,
            poolId: keccak256("pool"),
            inverted: true,
            lowerTick: NO_LOWER_TICK,
            upperTick: 1200,
            trailTicks: 488
        });
        OrderCreatedEmitter emitter = new OrderCreatedEmitter();

        vm.recordLogs();
        emitter.emitCreated(9, trigger, 1_800_000_000);
        Vm.Log[] memory logs = vm.getRecordedLogs();

        assertEq(logs.length, 1);
        assertEq(logs[0].topics[0], IReflexExecutor.OrderCreated.selector);
        assertEq(uint256(logs[0].topics[1]), 9);

        (TriggerParams memory decoded, uint64 expiry) = abi.decode(logs[0].data, (TriggerParams, uint64));
        assertEq(decoded.poolId, trigger.poolId);
        assertEq(decoded.inverted, true);
        assertEq(decoded.lowerTick, NO_LOWER_TICK);
        assertEq(decoded.upperTick, 1200);
        assertEq(decoded.trailTicks, 488);
        assertEq(expiry, 1_800_000_000);
    }

    function _ignore() private pure returns (uint256) {
        return 0xa65f96fc951c35ead38878e0f0b7a3c744a6f5ccc1476b313353ce31712313ad;
    }
}
