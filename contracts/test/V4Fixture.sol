// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {PoolManager} from "@uniswap/v4-core/src/PoolManager.sol";

/// @dev Artifact boundary for v4's exact 0.8.26 pragma; all manager logic is unchanged.
contract V4Fixture is PoolManager {
    constructor() PoolManager(msg.sender) {}
}
