// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import {console2} from "forge-std/console2.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolSwapTest} from "@uniswap/v4-core/src/test/PoolSwapTest.sol";
import {Addresses} from "./lib/Addresses.sol";
import {DemoSetup} from "./lib/DemoSetup.sol";
import {DeploymentRecords} from "./lib/DeploymentRecords.sol";

contract MoveMarket is DeploymentRecords {
    using SafeCast for uint256;
    using SafeCast for int256;

    /// @notice Moves rdETH's rdUSD price through the demo router, minting only a missing input balance.
    function run() external {
        Addresses.destination(block.chainid);
        Record memory r = _read(block.chainid);
        bytes32 direction = keccak256(bytes(vm.envOr("DIRECTION", string("down"))));
        require(direction == keccak256("down") || direction == keccak256("up"), "DIRECTION must be down or up");
        bool down = direction == keccak256("down");
        uint128 amount = vm.envOr("AMOUNT", down ? uint256(2e18) : uint256(6000e18)).toUint128();
        address operator = _start();
        (int24 beforeTick, int24 afterTick) = DemoSetup.moveMarket(
            IPoolManager(r.poolManager), PoolSwapTest(r.swapRouter), r.key, r.rdETH, operator, down, amount
        );
        vm.stopBroadcast();
        console2.log("tick before", int256(beforeTick));
        console2.log("tick after", int256(afterTick));
        console2.log("input base units", uint256(amount));
    }
}
