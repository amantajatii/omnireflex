// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import {console2} from "forge-std/console2.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolModifyLiquidityTest} from "@uniswap/v4-core/src/test/PoolModifyLiquidityTest.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {ReflexExecutor} from "../src/executor/ReflexExecutor.sol";
import {Addresses} from "./lib/Addresses.sol";
import {DemoToken} from "./lib/DemoToken.sol";
import {DemoSetup} from "./lib/DemoSetup.sol";
import {DeploymentRecords} from "./lib/DeploymentRecords.sol";

contract DeployDestination is DeploymentRecords {
    using SafeCast for uint256;
    using SafeCast for int256;
    using PoolIdLibrary for *;

    /// @notice Deploys the owned demo currencies, liquid v4 pool and configured executor on a supported destination.
    function run() external {
        Addresses.Destination memory a = Addresses.destination(block.chainid);
        address reactive = _reactive();
        uint128 minimum = vm.envOr("MIN_AMOUNT_IN", uint256(0.01e18)).toUint128();
        uint256 fee = vm.envOr("EXECUTION_FEE", uint256(0.0002 ether));
        if (vm.exists(_path(block.chainid))) {
            Record memory existing = _read(block.chainid);
            _validateReuse(existing, reactive);
            _start();
            DemoSetup.configureExecutor(ReflexExecutor(payable(existing.executor)), existing.key, minimum, fee);
            vm.stopBroadcast();
            console2.log("Reusing executor", existing.executor);
            return;
        }
        uint256 funding = vm.envOr("EXECUTOR_FUNDING", uint256(0.02 ether));
        address operator = _start();
        (DemoToken rdETH, DemoToken rdUSD) = DemoSetup.deployTokens(operator);
        Record memory r;
        r.rdETH = address(rdETH);
        r.rdUSD = address(rdUSD);
        r.key = DemoSetup.setupPool(
            IPoolManager(a.poolManager), PoolModifyLiquidityTest(a.liquidityRouter), rdETH, rdUSD, operator
        );
        ReflexExecutor executor = DemoSetup.deployExecutor(
            a.callbackProxy, reactive, IPoolManager(a.poolManager), r.key, minimum, fee, funding
        );
        vm.stopBroadcast();
        r.poolId = PoolId.unwrap(r.key.toId());
        r.executor = address(executor);
        r.poolManager = a.poolManager;
        r.swapRouter = a.swapRouter;
        r.liquidityRouter = a.liquidityRouter;
        r.callbackProxy = a.callbackProxy;
        _write(block.chainid, r);
        console2.log("Executor", r.executor);
        console2.log("rdETH", r.rdETH);
        console2.log("rdUSD", r.rdUSD);
        console2.logBytes32(r.poolId);
    }

    function _validateReuse(Record memory r, address reactive) internal view {
        require(r.executor.code.length != 0, "Recorded executor has no code; reconcile deployment record");
        require(
            ReflexExecutor(payable(r.executor))._CALLBACK_SENDER() == reactive,
            string.concat(
                "Callback sender mismatch: delete deployments/",
                vm.toString(block.chainid),
                ".json and redeploy this destination (recover old orders first)"
            )
        );
    }
}
