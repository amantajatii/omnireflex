// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {console2} from "forge-std/console2.sol";
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolId} from "@uniswap/v4-core/src/types/PoolId.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {StateLibrary} from "@uniswap/v4-core/src/libraries/StateLibrary.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {PoolModifyLiquidityTest} from "@uniswap/v4-core/src/test/PoolModifyLiquidityTest.sol";
import {Addresses} from "./lib/Addresses.sol";
import {DemoSetup} from "./lib/DemoSetup.sol";
import {DemoToken} from "./lib/DemoToken.sol";
import {DeploymentRecords} from "./lib/DeploymentRecords.sol";

/// @notice Prepares a destination pool for the price-follower bot: adds a wide liquidity
///         position so the pool can track real ETH/USD, then tops up the bot wallet with
///         demo tokens and gas. Idempotent: re-running only fills what is missing.
contract SetupPriceBot is DeploymentRecords {
    using SafeCast for uint256;
    using SafeCast for int256;
    using StateLibrary for IPoolManager;

    bytes32 internal constant WIDE_SALT = keccak256("omnireflex-wide");
    uint256 internal constant PRICE_LOW = 500;
    uint256 internal constant PRICE_HIGH = 10_000;

    function run() external {
        Addresses.destination(block.chainid);
        Record memory r = _read(block.chainid);
        address bot = vm.envAddress("BOT_ADDRESS");
        require(bot != address(0), "BOT_ADDRESS is zero");
        uint256 wideLiquidity = vm.envOr("WIDE_LIQUIDITY", uint256(10_000e18));
        uint256 botEth = vm.envOr("BOT_RDETH", uint256(200e18));
        uint256 botUsd = vm.envOr("BOT_RDUSD", uint256(600_000e18));
        uint256 botGas = vm.envOr("BOT_GAS", uint256(0.02 ether));

        address operator = _start();
        _addWideLiquidity(r, operator, wideLiquidity);
        _topUp(DemoToken(r.rdETH), bot, botEth);
        _topUp(DemoToken(r.rdUSD), bot, botUsd);
        if (bot.balance < botGas) payable(bot).transfer(botGas - bot.balance);
        vm.stopBroadcast();

        console2.log("bot", bot);
        console2.log("bot rdETH", DemoToken(r.rdETH).balanceOf(bot));
        console2.log("bot rdUSD", DemoToken(r.rdUSD).balanceOf(bot));
        console2.log("bot gas wei", bot.balance);
    }

    function _addWideLiquidity(Record memory r, address operator, uint256 liquidity) internal {
        bool eth0 = Currency.unwrap(r.key.currency0) == r.rdETH;
        (int24 lower, int24 upper) = _wideRange(eth0, r.key.tickSpacing);
        IPoolManager manager = IPoolManager(r.poolManager);
        (uint128 existing,,) =
            manager.getPositionInfo(PoolId.wrap(r.poolId), r.liquidityRouter, lower, upper, WIDE_SALT);
        console2.log("wide tickLower", int256(lower));
        console2.log("wide tickUpper", int256(upper));
        if (existing != 0) {
            console2.log("wide position already present, liquidity", uint256(existing));
            return;
        }
        DemoToken rdETH = DemoToken(r.rdETH);
        DemoToken rdUSD = DemoToken(r.rdUSD);
        DemoSetup.ensureBalance(rdETH, operator, 1000e18);
        DemoSetup.ensureBalance(rdUSD, operator, 3_000_000e18);
        rdETH.approve(r.liquidityRouter, type(uint256).max);
        rdUSD.approve(r.liquidityRouter, type(uint256).max);
        PoolModifyLiquidityTest(r.liquidityRouter).modifyLiquidity(
            r.key,
            IPoolManager.ModifyLiquidityParams({
                tickLower: lower, tickUpper: upper, liquidityDelta: liquidity.toInt256(), salt: WIDE_SALT
            }),
            ""
        );
        console2.log("wide position added, liquidity", liquidity);
    }

    /// @dev Tick range covering rdETH prices PRICE_LOW..PRICE_HIGH rdUSD, aligned outward to spacing.
    function _wideRange(bool eth0, int24 spacing) internal pure returns (int24 lower, int24 upper) {
        int24 a = _tickForPrice(PRICE_LOW, eth0);
        int24 b = _tickForPrice(PRICE_HIGH, eth0);
        (lower, upper) = a < b ? (a, b) : (b, a);
        lower = _floor(lower, spacing);
        upper = -_floor(-upper, spacing);
    }

    /// @dev Both tokens use 18 decimals, so raw price = P when rdETH is currency0, else 1/P.
    function _tickForPrice(uint256 price, bool eth0) internal pure returns (int24) {
        uint160 sqrtPrice = (Math.sqrt(price * 1e36) * (1 << 96) / 1e18).toUint160();
        int24 tick = TickMath.getTickAtSqrtPrice(sqrtPrice);
        return eth0 ? tick : -tick;
    }

    function _floor(int24 tick, int24 spacing) internal pure returns (int24) {
        int24 q = tick / spacing;
        if (tick < 0 && tick % spacing != 0) q -= 1;
        return q * spacing;
    }

    function _topUp(DemoToken token, address to, uint256 target) internal {
        uint256 balance = token.balanceOf(to);
        if (balance < target) token.mint(to, target - balance);
    }
}
