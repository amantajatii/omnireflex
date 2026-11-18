// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

/// @notice Fixed testnet infrastructure verified for Reflex's demo.
library Addresses {
    error UnsupportedChain(uint256 chainId);
    uint256 internal constant LASNA = 5318007;
    address internal constant SYSTEM = 0x8888888888888888888888888888888888888888;

    struct Destination {
        address callbackProxy;
        address poolManager;
        address swapRouter;
        address liquidityRouter;
    }

    function destination(uint256 chainId) internal pure returns (Destination memory) {
        if (chainId == 1301) {
            return Destination({
                callbackProxy: 0x775c9B990ADe401060B78D0e98684eEf8d2466C1,
                poolManager: 0x00B036B58a818B1BC34d502D3fE730Db729e62AC,
                swapRouter: 0x9140a78c1A137c7fF1c151EC8231272aF78a99A4,
                liquidityRouter: 0x5fa728C0A5cfd51BEe4B060773f50554c0C8A7AB
            });
        }
        if (chainId == 84532) {
            return Destination({
                callbackProxy: 0x476F44b11F5C942c58f4c8E3d0300E5710743585,
                poolManager: 0x05E73354cFDd6745C338b50BcFDfA3Aa6fA03408,
                swapRouter: 0x8B5bcC363ddE2614281aD875bad385E0A785D3B9,
                liquidityRouter: 0x37429cD17Cb1454C34E7F50b09725202Fd533039
            });
        }
        revert UnsupportedChain(chainId);
    }

    function otherDestination(uint256 chainId) internal pure returns (uint256) {
        if (chainId == 1301) return 84532;
        if (chainId == 84532) return 1301;
        revert UnsupportedChain(chainId);
    }

    function requireLasna() internal view {
        if (block.chainid != LASNA) revert UnsupportedChain(block.chainid);
    }
}
