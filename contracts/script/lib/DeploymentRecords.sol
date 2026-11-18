// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {VmSafe} from "forge-std/Vm.sol";
import {Script} from "forge-std/Script.sol";
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";

/// @dev Shared deployment JSON schema. Paths are relative to the Foundry project, not the shell cwd.
abstract contract DeploymentRecords is Script {
    using SafeCast for uint256;
    using SafeCast for int256;
    using PoolIdLibrary for PoolKey;

    struct Record {
        address rdETH;
        address rdUSD;
        PoolKey key;
        bytes32 poolId;
        address executor;
        address poolManager;
        address swapRouter;
        address liquidityRouter;
        address callbackProxy;
    }

    function _path(uint256 chainId) internal view virtual returns (string memory) {
        return string.concat(vm.projectRoot(), "/deployments/", vm.toString(chainId), ".json");
    }

    function _reactive() internal view returns (address) {
        string memory path = _path(5318007);
        require(vm.exists(path), "Missing deployments/5318007.json; deploy Reactive first");
        address reactive = vm.parseJsonAddress(vm.readFile(path), ".reactive");
        require(reactive != address(0), "Reactive record has zero address");
        return reactive;
    }

    function _read(uint256 chainId) internal view returns (Record memory r) {
        require(vm.exists(_path(chainId)), "Missing destination deployment record");
        string memory json = vm.readFile(_path(chainId));
        require(vm.parseJsonUint(json, ".chainId") == chainId, "Deployment chain mismatch");
        r.rdETH = vm.parseJsonAddress(json, ".rdETH");
        r.rdUSD = vm.parseJsonAddress(json, ".rdUSD");
        r.key = PoolKey({
            currency0: Currency.wrap(vm.parseJsonAddress(json, ".poolKey.currency0")),
            currency1: Currency.wrap(vm.parseJsonAddress(json, ".poolKey.currency1")),
            fee: vm.parseJsonUint(json, ".poolKey.fee").toUint24(),
            tickSpacing: vm.parseJsonInt(json, ".poolKey.tickSpacing").toInt24(),
            hooks: IHooks(vm.parseJsonAddress(json, ".poolKey.hooks"))
        });
        r.poolId = vm.parseJsonBytes32(json, ".poolId");
        require(r.poolId == PoolId.unwrap(r.key.toId()), "Deployment PoolId mismatch");
        r.executor = vm.parseJsonAddress(json, ".executor");
        r.poolManager = vm.parseJsonAddress(json, ".poolManager");
        r.swapRouter = vm.parseJsonAddress(json, ".swapRouter");
        r.liquidityRouter = vm.parseJsonAddress(json, ".liquidityRouter");
        r.callbackProxy = vm.parseJsonAddress(json, ".callbackProxy");
    }

    function _write(uint256 chainId, Record memory r) internal {
        if (!vm.isContext(VmSafe.ForgeContext.ScriptBroadcast)) return;
        vm.writeJson(_recordJson(chainId, r), _path(chainId));
    }

    function _recordJson(uint256 chainId, Record memory r) internal returns (string memory) {
        string memory root = string.concat("destination-", vm.toString(chainId));
        string memory pool = string.concat(root, "-pool");
        vm.serializeAddress(pool, "currency0", Currency.unwrap(r.key.currency0));
        vm.serializeAddress(pool, "currency1", Currency.unwrap(r.key.currency1));
        vm.serializeUint(pool, "fee", r.key.fee);
        vm.serializeInt(pool, "tickSpacing", r.key.tickSpacing);
        string memory poolJson = vm.serializeAddress(pool, "hooks", address(r.key.hooks));
        vm.serializeJson(root, string.concat('{"poolKey":', poolJson, "}"));
        vm.serializeUint(root, "chainId", chainId);
        vm.serializeAddress(root, "rdETH", r.rdETH);
        vm.serializeString(root, "rdETHSymbol", "rdETH");
        vm.serializeAddress(root, "rdUSD", r.rdUSD);
        vm.serializeString(root, "rdUSDSymbol", "rdUSD");
        vm.serializeBytes32(root, "poolId", r.poolId);
        vm.serializeAddress(root, "executor", r.executor);
        vm.serializeAddress(root, "poolManager", r.poolManager);
        vm.serializeAddress(root, "swapRouter", r.swapRouter);
        vm.serializeAddress(root, "liquidityRouter", r.liquidityRouter);
        return vm.serializeAddress(root, "callbackProxy", r.callbackProxy);
    }

    function _start() internal returns (address operator) {
        vm.startBroadcast();
        (, operator,) = vm.readCallers();
    }
}
