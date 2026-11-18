// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {Vm} from "forge-std/Vm.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {IReflexExecutor} from "../src/interfaces/IReflexExecutor.sol";
import {Test} from "forge-std/Test.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolModifyLiquidityTest} from "@uniswap/v4-core/src/test/PoolModifyLiquidityTest.sol";
import {PoolSwapTest} from "@uniswap/v4-core/src/test/PoolSwapTest.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {StateLibrary} from "@uniswap/v4-core/src/libraries/StateLibrary.sol";
import {ReflexExecutor} from "../src/executor/ReflexExecutor.sol";
import {
    OrderParams,
    OrderStatus,
    ExecutionTrace,
    NO_LOWER_TICK,
    NO_UPPER_TICK
} from "../src/interfaces/ReflexTypes.sol";
import {DemoToken} from "../script/lib/DemoToken.sol";
import {DemoSetup} from "../script/lib/DemoSetup.sol";
import {DeploymentRecords} from "../script/lib/DeploymentRecords.sol";
import {Addresses} from "../script/lib/Addresses.sol";

contract DemoSetupTest is Test, DeploymentRecords {
    using PoolIdLibrary for PoolKey;
    using StateLibrary for IPoolManager;
    uint256 private constant FEE = 0.0002 ether;
    IPoolManager private manager;
    PoolSwapTest private swapRouter;
    PoolModifyLiquidityTest private liquidityRouter;

    struct Demo {
        DemoToken eth;
        DemoToken usd;
        PoolKey key;
        ReflexExecutor executor;
    }

    function setUp() public {
        for (uint256 chain = 999999001; chain <= 999999002; ++chain) {
            if (vm.exists(_path(chain))) vm.removeFile(_path(chain));
        }
        // PoolManager pins 0.8.26; use its separately compiled artifact, as in the existing v4 fixtures.
        manager = IPoolManager(deployCode("V4Fixture.sol:V4Fixture"));
        swapRouter = new PoolSwapTest(manager);
        liquidityRouter = new PoolModifyLiquidityTest(manager);
        vm.deal(address(this), 1 ether);
    }

    function test_stopAndTrailEthCurrency0() public {
        _ordersAndPool(true);
    }

    function test_stopAndTrailEthCurrency1() public {
        _ordersAndPool(false);
    }

    function test_marketMovesEthCurrency0() public {
        _moves(true);
    }

    function test_marketMovesEthCurrency1() public {
        _moves(false);
    }

    function test_takeAndBracketBounds() public {
        Demo memory d = _demo(true);
        (uint160 price, int24 tick,,) = manager.getSlot0(d.key.toId());
        DemoSetup.TriggerMarket memory market = DemoSetup.TriggerMarket(block.chainid, d.key, address(d.eth), tick);
        DemoSetup.OrderConfig memory c = _config(DemoSetup.Kind.Take);
        OrderParams memory take = DemoSetup.buildOrder(d.key, address(d.eth), price, market, c);
        assertEq(take.trigger.lowerTick, NO_LOWER_TICK);
        assertEq(take.trigger.upperTick, tick + 200);
        c.kind = DemoSetup.Kind.Bracket;
        OrderParams memory bracket = DemoSetup.buildOrder(d.key, address(d.eth), price, market, c);
        assertEq(bracket.trigger.lowerTick, tick - 200);
        assertEq(bracket.trigger.upperTick, tick + 200);
    }

    function test_crossChainTriggerUsesRemoteBoundQuote() public {
        Demo memory local = _demo(true);
        Demo memory remote = _demo(false);
        local.executor.allowTriggerPool(84532, PoolId.unwrap(remote.key.toId()));
        (uint160 localPrice,,,) = manager.getSlot0(local.key.toId());
        (, int24 remoteTick,,) = manager.getSlot0(remote.key.toId());
        OrderParams memory p = DemoSetup.buildOrder(
            local.key,
            address(local.eth),
            localPrice,
            DemoSetup.TriggerMarket(84532, remote.key, address(remote.eth), remoteTick),
            _config(DemoSetup.Kind.Stop)
        );
        assertTrue(p.zeroForOne);
        assertTrue(p.trigger.inverted);
        assertEq(p.trigger.lowerTick, -int256(remoteTick) - 200);
        assertEq(p.trigger.chainId, 84532);
        uint256 expected = DemoSetup.quote(TickMath.getSqrtPriceAtTick(remoteTick + 200), false, 1e18) * 9500 / 10000;
        assertEq(p.minAmountOut, expected);
        local.eth.approve(address(local.executor), p.amountIn);
        uint64 id = local.executor.createOrder{value: FEE}(p);
        assertEq(uint256(local.executor.getOrder(id).status), uint256(OrderStatus.Open));
    }

    function test_setupIsIdempotentForAnExistingLiquidPool() public {
        Demo memory d = _demo(true);
        uint256 balance = d.eth.balanceOf(address(this));
        uint128 liquidity = manager.getLiquidity(d.key.toId());
        PoolKey memory repeated = DemoSetup.setupPool(manager, liquidityRouter, d.eth, d.usd, address(this));
        assertEq(PoolId.unwrap(repeated.toId()), PoolId.unwrap(d.key.toId()));
        assertEq(manager.getLiquidity(d.key.toId()), liquidity);
        assertEq(d.eth.balanceOf(address(this)), balance);
    }

    function test_demoTokenMintOwnerOnly() public {
        (DemoToken eth, DemoToken usd) = DemoSetup.deployTokens(address(this));
        assertEq(eth.owner(), address(this));
        assertEq(eth.decimals(), 18);
        assertEq(eth.symbol(), "rdETH");
        assertEq(usd.symbol(), "rdUSD");
        vm.prank(address(0xBAD));
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, address(0xBAD)));
        eth.mint(address(0xBAD), 1e18);
    }

    function test_recordRoundTrip() public {
        // Never overwrite a real deployment record; remove this test-only record before returning.
        uint256 chain = 999999001;
        require(!vm.exists(_path(chain)), "Test record path already exists");
        Demo memory d = _demo(true);
        Record memory r = Record({
            rdETH: address(d.eth),
            rdUSD: address(d.usd),
            key: d.key,
            poolId: PoolId.unwrap(d.key.toId()),
            executor: address(d.executor),
            poolManager: address(manager),
            swapRouter: address(swapRouter),
            liquidityRouter: address(liquidityRouter),
            callbackProxy: makeAddr("proxy")
        });
        vm.writeJson(_recordJson(chain, r), _path(chain));
        // Catch decode failures too, and delete before assertions so every failure path cleans up.
        try this.readTestRecord(chain) returns (Record memory decoded, string memory json) {
            vm.removeFile(_path(chain));
            assertEq(keccak256(abi.encode(decoded)), keccak256(abi.encode(r)));
            assertEq(vm.parseJsonString(json, ".rdETHSymbol"), "rdETH");
            assertEq(vm.parseJsonString(json, ".rdUSDSymbol"), "rdUSD");
        } catch (bytes memory reason) {
            vm.removeFile(_path(chain));
            assembly ("memory-safe") { revert(add(reason, 32), mload(reason)) }
        }
    }

    function readTestRecord(uint256 chain) external view returns (Record memory, string memory) {
        return (_read(chain), vm.readFile(_path(chain)));
    }

    function _path(uint256 chain) internal view override returns (string memory) {
        if (chain == 999999001) return string.concat(vm.projectRoot(), "/deployments/demo-setup.test.json");
        if (chain == 999999002) return string.concat(vm.projectRoot(), "/deployments/demo-simulation.test.json");
        return super._path(chain);
    }

    function test_simulationDoesNotWriteDeploymentRecord() public {
        Record memory r;
        _write(999999002, r);
        assertFalse(vm.exists(_path(999999002)));
    }

    function test_defaultStopExecutesEthCurrency0() public {
        _defaultFlow(true, 1);
    }

    function test_defaultStopExecutesEthCurrency1() public {
        _defaultFlow(false, 1);
    }

    function test_twoDefaultStopsExecuteEthCurrency0() public {
        _defaultFlow(true, 2);
    }

    function test_twoDefaultStopsExecuteEthCurrency1() public {
        _defaultFlow(false, 2);
    }

    function test_reconcileMissingExecutorConfiguration() public {
        Demo memory d = _demo(true);
        d.executor.disallowExecutionPool(d.key.toId());
        d.executor.disallowTriggerPool(block.chainid, PoolId.unwrap(d.key.toId()));
        d.executor.setExecutionFee(0);
        DemoSetup.configureExecutor(d.executor, d.key, uint128(0.01e18), FEE);
        (bool allowed, uint128 minimum) = d.executor.executionPools(d.key.toId());
        assertTrue(allowed);
        assertEq(minimum, 0.01e18);
        assertTrue(d.executor.triggerPools(block.chainid, PoolId.unwrap(d.key.toId())));
        assertEq(d.executor.executionFee(), FEE);
        vm.recordLogs();
        DemoSetup.configureExecutor(d.executor, d.key, uint128(0.01e18), FEE);
        assertEq(vm.getRecordedLogs().length, 0);
    }

    function _defaultFlow(bool eth0, uint64 count) private {
        Demo memory d = _demo(eth0);
        (uint160 price, int24 tick,,) = manager.getSlot0(d.key.toId());
        OrderParams memory p = DemoSetup.buildOrder(
            d.key,
            address(d.eth),
            price,
            DemoSetup.TriggerMarket(block.chainid, d.key, address(d.eth), tick),
            _config(DemoSetup.Kind.Stop)
        );
        d.eth.approve(address(d.executor), type(uint256).max);
        for (uint64 i = 1; i <= count; ++i) {
            assertEq(d.executor.createOrder{value: FEE}(p), i);
        }
        vm.recordLogs();
        DemoSetup.moveMarket(manager, swapRouter, d.key, address(d.eth), address(this), true, 2e18);
        ExecutionTrace memory trace = _swapTrace(vm.getRecordedLogs());
        assertLe(eth0 ? int256(trace.tick) : -int256(trace.tick), p.trigger.lowerTick);
        for (uint64 i = 1; i <= count; ++i) {
            uint256 beforeBalance = d.usd.balanceOf(address(this));
            vm.recordLogs();
            address proxy = makeAddr("proxy");
            address reactive = makeAddr("reactive");
            vm.prank(proxy);
            d.executor.execute(reactive, i, trace);
            Vm.Log[] memory logs = vm.getRecordedLogs();
            bool executed;
            for (uint256 j; j < logs.length; ++j) {
                assertTrue(logs[j].topics[0] != IReflexExecutor.OrderExecutionFailed.selector);
                if (logs[j].topics[0] == IReflexExecutor.OrderExecuted.selector) executed = true;
            }
            assertTrue(executed);
            assertEq(uint256(d.executor.getOrder(i).status), uint256(OrderStatus.Executed));
            assertGe(d.usd.balanceOf(address(this)) - beforeBalance, p.minAmountOut);
        }
        assertEq(d.executor.reservedFees(), 0);
        assertEq(d.eth.balanceOf(address(d.executor)), 0);
    }

    function _swapTrace(Vm.Log[] memory logs) private view returns (ExecutionTrace memory) {
        for (uint256 i; i < logs.length; ++i) {
            if (logs[i].emitter != address(manager) || logs[i].topics[0] != IPoolManager.Swap.selector) continue;
            (,,,, int24 tick,) = abi.decode(logs[i].data, (int128, int128, uint160, uint128, int24, uint24));
            return ExecutionTrace(block.chainid, block.number, uint256(keccak256(logs[i].data)), i, tick);
        }
        revert("Missing Swap event");
    }

    function test_fixedAddressesAndUnsupportedChain() public {
        assertEq(Addresses.destination(1301).poolManager, 0x00B036B58a818B1BC34d502D3fE730Db729e62AC);
        assertEq(Addresses.destination(84532).callbackProxy, 0x476F44b11F5C942c58f4c8E3d0300E5710743585);
        vm.expectRevert(abi.encodeWithSelector(Addresses.UnsupportedChain.selector, uint256(1)));
        this.lookup(1);
    }

    function lookup(uint256 chain) external pure returns (Addresses.Destination memory) {
        return Addresses.destination(chain);
    }

    function _ordersAndPool(bool eth0) private {
        Demo memory d = _demo(eth0);
        (uint160 price, int24 tick,,) = manager.getSlot0(d.key.toId());
        assertEq(tick, DemoSetup.initialTick(eth0));
        assertEq(tick % 60, 0);
        assertGt(manager.getLiquidity(d.key.toId()), 0);
        assertApproxEqRel(DemoSetup.quote(price, eth0, 1e18), 3000e18, 0.01e18);
        (bool allowed, uint128 minimum) = d.executor.executionPools(d.key.toId());
        assertTrue(allowed);
        assertEq(minimum, 0.01e18);
        assertEq(d.executor.executionFee(), FEE);
        assertEq(d.executor.owner(), address(this));
        assertTrue(d.executor.triggerPools(block.chainid, PoolId.unwrap(d.key.toId())));
        assertEq(address(d.executor).balance, 0.02 ether);
        d.eth.approve(address(d.executor), type(uint256).max);
        DemoSetup.TriggerMarket memory market = DemoSetup.TriggerMarket(block.chainid, d.key, address(d.eth), tick);
        OrderParams memory p = DemoSetup.buildOrder(d.key, address(d.eth), price, market, _config(DemoSetup.Kind.Stop));
        assertEq(p.zeroForOne, eth0);
        assertEq(p.trigger.inverted, !eth0);
        int256 normalised = eth0 ? int256(tick) : -int256(tick);
        assertEq(p.trigger.lowerTick, normalised - 200);
        assertEq(p.trigger.upperTick, NO_UPPER_TICK);
        assertEq(p.trigger.trailTicks, 0);
        assertEq(d.executor.createOrder{value: FEE}(p), 1);
        p = DemoSetup.buildOrder(d.key, address(d.eth), price, market, _config(DemoSetup.Kind.Trail));
        assertEq(p.trigger.inverted, !eth0);
        assertEq(p.trigger.lowerTick, NO_LOWER_TICK);
        assertEq(p.trigger.upperTick, NO_UPPER_TICK);
        assertEq(p.trigger.trailTicks, 200);
        assertEq(d.executor.createOrder{value: FEE}(p), 2);
        assertEq(d.executor.reservedFees(), 2 * FEE);
        assertEq(d.eth.balanceOf(address(d.executor)), 2e18);
    }

    function _moves(bool eth0) private {
        Demo memory d = _demo(eth0);
        (int24 beforeDown, int24 afterDown) =
            DemoSetup.moveMarket(manager, swapRouter, d.key, address(d.eth), address(this), true, 2e18);
        int256 down = eth0 ? int256(beforeDown) - afterDown : int256(afterDown) - beforeDown;
        assertGt(down, 100);
        assertLt(down, 300);
        (int24 beforeUp, int24 afterUp) =
            DemoSetup.moveMarket(manager, swapRouter, d.key, address(d.eth), address(this), false, 6000e18);
        int256 up = eth0 ? int256(afterUp) - beforeUp : int256(beforeUp) - afterUp;
        assertGt(up, 100);
        assertLt(up, 300);
    }

    function _config(DemoSetup.Kind kind_) private view returns (DemoSetup.OrderConfig memory) {
        return DemoSetup.OrderConfig({
            kind: kind_, amountIn: 1e18, distance: 200, slippageBps: 500, expiry: uint64(block.timestamp + 1 days)
        });
    }

    function _demo(bool eth0) private returns (Demo memory d) {
        (d.eth, d.usd) = _tokens(eth0);
        d.key = DemoSetup.setupPool(manager, liquidityRouter, d.eth, d.usd, address(this));
        d.executor = DemoSetup.deployExecutor(
            makeAddr("proxy"), makeAddr("reactive"), manager, d.key, uint128(0.01e18), FEE, 0.02 ether
        );
    }

    function _tokens(bool eth0) private returns (DemoToken eth, DemoToken usd) {
        bytes memory ethCode =
            abi.encodePacked(type(DemoToken).creationCode, abi.encode("Reflex Demo ETH", "rdETH", address(this)));
        bytes memory usdCode =
            abi.encodePacked(type(DemoToken).creationCode, abi.encode("Reflex Demo USD", "rdUSD", address(this)));
        for (uint256 i; i < 1000; ++i) {
            bytes32 salt = bytes32(i);
            address a = vm.computeCreate2Address(salt, keccak256(ethCode), address(this));
            address b = vm.computeCreate2Address(salt, keccak256(usdCode), address(this));
            if ((a < b) != eth0 || a.code.length != 0 || b.code.length != 0) continue;
            eth = new DemoToken{salt: salt}("Reflex Demo ETH", "rdETH", address(this));
            usd = new DemoToken{salt: salt}("Reflex Demo USD", "rdUSD", address(this));
            return (eth, usd);
        }
        revert("Could not find token salts for requested ordering");
    }
}
