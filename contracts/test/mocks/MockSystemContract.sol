// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import { ISystemContract } from "@reactive/src/interfaces/ISystemContract.sol";

/// @notice Stand-in for the Reactive Omni system contract at 0x8888…8888.
/// @dev Etch it at that address in tests. It records subscriptions and callback requests
///      so tests can assert on them; it does not deliver logs (tests call `react()` with
///      `vm.prank(SYSTEM)` instead). Reactive-Network/reactive-test-lib targets the legacy
///      0x…fffFfF address and `emit Callback`, so it does not fit Omni contracts.
contract MockSystemContract is ISystemContract {
    struct Subscription {
        address subscriber;
        uint256 chainId;
        address contractAddr;
        uint256 topic0;
        uint256 topic1;
        uint256 topic2;
        uint256 topic3;
        bool active;
    }

    Subscription[] internal _subscriptions;
    CallbackConfiguration_V_1_0[] internal _callbacks;
    mapping(address => uint256) public debts;

    event CallbackRequest(
        uint256 indexed chainId,
        address indexed sender,
        address indexed recipient,
        CallbackVersion version,
        bytes configuration
    );

    receive() external payable { }

    function subscribe(uint256 chainId_, address contract_, uint256 topic0_, uint256 topic1_, uint256 topic2_, uint256 topic3_)
        external
    {
        _subscriptions.push(
            Subscription({
                subscriber: msg.sender,
                chainId: chainId_,
                contractAddr: contract_,
                topic0: topic0_,
                topic1: topic1_,
                topic2: topic2_,
                topic3: topic3_,
                active: true
            })
        );
    }

    function unsubscribe(uint256 chainId_, address contract_, uint256 topic0_, uint256 topic1_, uint256 topic2_, uint256 topic3_)
        external
    {
        bytes32 target = keccak256(abi.encode(msg.sender, chainId_, contract_, topic0_, topic1_, topic2_, topic3_));
        for (uint256 i; i < _subscriptions.length; ++i) {
            Subscription storage s = _subscriptions[i];
            if (s.active && keccak256(abi.encode(s.subscriber, s.chainId, s.contractAddr, s.topic0, s.topic1, s.topic2, s.topic3)) == target) {
                s.active = false;
            }
        }
    }

    function requestCallback(CallbackVersion version_, bytes memory config_) public {
        CallbackConfiguration_V_1_0 memory config = abi.decode(config_, (CallbackConfiguration_V_1_0));
        _callbacks.push(config);
        emit CallbackRequest(config.chainId, msg.sender, config.recipient, version_, config_);
    }

    function requestCallbackV_1_0(CallbackConfiguration_V_1_0 memory config_) external { // forge-lint: disable-line(mixed-case-function)
        requestCallback(CallbackVersion.V_1_0, abi.encode(config_));
    }

    function debt(address contract_) external view returns (uint256) {
        return debts[contract_];
    }

    // ---- test helpers -------------------------------------------------------------

    function isSubscribed(address subscriber, uint256 chainId_, address contract_, uint256 topic0_, uint256 topic1_)
        external
        view
        returns (bool)
    {
        for (uint256 i; i < _subscriptions.length; ++i) {
            Subscription storage s = _subscriptions[i];
            if (
                s.active && s.subscriber == subscriber && s.chainId == chainId_ && s.contractAddr == contract_
                    && s.topic0 == topic0_ && s.topic1 == topic1_
            ) {
                return true;
            }
        }
        return false;
    }

    function callbackCount() external view returns (uint256) {
        return _callbacks.length;
    }

    function callbackAt(uint256 index) external view returns (CallbackConfiguration_V_1_0 memory) {
        return _callbacks[index];
    }
}
