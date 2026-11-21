// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {Test} from "forge-std/Test.sol";
import {ReflexFaucet} from "../src/demo/ReflexFaucet.sol";
import {DeployFaucet} from "../script/DeployFaucet.s.sol";
import {DeploymentRecords} from "../script/lib/DeploymentRecords.sol";
import {DemoToken} from "../script/lib/DemoToken.sol";
import {Addresses} from "../script/lib/Addresses.sol";

contract FaucetDeploymentHarness is DeployFaucet {
    string private recordPath;

    constructor(string memory name) {
        recordPath = string.concat(vm.projectRoot(), "/deployments/faucet-", name, ".test.json");
    }

    function check(ReflexFaucet faucet, Record calldata r) external view {
        _validateReuse(faucet, r);
    }

    function recordJson(uint256 chain, address faucet) external returns (string memory) {
        return _faucetJson(chain, faucet);
    }

    function writeRecord(uint256 chain, address faucet) external {
        _writeFaucet(chain, faucet);
    }

    function _path(uint256) internal view override returns (string memory) {
        return recordPath;
    }
}

contract DeployFaucetTest is Test {
    FaucetDeploymentHarness private harness;
    DemoToken private eth;
    DemoToken private usd;
    string private path;

    function setUp() public {
        vm.chainId(1301);
        harness = new FaucetDeploymentHarness("missing");
        eth = new DemoToken("Reflex Demo ETH", "rdETH", tx.origin);
        usd = new DemoToken("Reflex Demo USD", "rdUSD", tx.origin);
        path = string.concat(vm.projectRoot(), "/deployments/faucet-missing.test.json");
        require(!vm.exists(path), "Test record path already exists");
    }

    function test_recordPreservesEveryExistingFieldAndUnknownNestedData() public {
        _fixture();
        string memory beforeJson = vm.readFile(path);
        string memory json = harness.recordJson(1301, address(0xFA));
        vm.writeJson(json, path);
        string memory written = vm.readFile(path);
        vm.removeFile(path);
        string[] memory keys = vm.parseJsonKeys(beforeJson, ".");
        for (uint256 i; i < keys.length; ++i) {
            string memory key = string.concat(".", keys[i]);
            assertEq(vm.parseJson(written, key), vm.parseJson(beforeJson, key));
        }
        assertEq(vm.parseJsonAddress(written, ".faucet"), address(0xFA));
        assertEq(vm.parseJsonKeys(written, ".").length, keys.length + 1);
    }

    function test_recordUpdatesExistingFaucetWithoutDroppingOtherFields() public {
        _fixture();
        vm.writeJson(harness.recordJson(1301, address(0xFA)), path);
        string memory first = vm.readFile(path);
        string memory second = harness.recordJson(1301, address(0xFB));
        vm.removeFile(path);
        assertEq(vm.parseJsonAddress(second, ".faucet"), address(0xFB));
        assertEq(vm.parseJsonKeys(first, ".").length, vm.parseJsonKeys(second, ".").length);
        assertEq(vm.parseJson(first, ".extra"), vm.parseJson(second, ".extra"));
    }

    function test_simulationDoesNotWriteRecord() public {
        _fixture();
        string memory beforeJson = vm.readFile(path);
        harness.writeRecord(1301, address(0xFA));
        string memory afterJson = vm.readFile(path);
        vm.removeFile(path);
        assertEq(afterJson, beforeJson);
    }

    function test_deployFundsWithOperatorAndLeavesRecordUnchanged() public {
        _fixture();
        string memory beforeJson = vm.readFile(path);
        uint64 nonce = vm.getNonce(tx.origin);
        address predicted = vm.computeCreateAddress(tx.origin, nonce);
        harness.run();
        string memory afterJson = vm.readFile(path);
        vm.removeFile(path);
        ReflexFaucet faucet = ReflexFaucet(predicted);
        assertEq(faucet.owner(), tx.origin);
        assertEq(address(faucet.rdETH()), address(eth));
        assertEq(address(faucet.rdUSD()), address(usd));
        assertEq(faucet.ethDrip(), 5e18);
        assertEq(faucet.usdDrip(), 15_000e18);
        assertEq(faucet.cooldown(), 1 hours);
        _assertFunding(predicted);
        assertEq(afterJson, beforeJson);
    }

    function test_reuseTopsUpOnlyShortfallWithoutRedeployment() public {
        _fixture();
        ReflexFaucet faucet = new ReflexFaucet(eth, usd, 5e18, 15_000e18, 1 hours);
        vm.prank(tx.origin);
        eth.mint(address(faucet), 10e18);
        vm.writeJson(harness.recordJson(1301, address(faucet)), path);
        uint64 nonce = vm.getNonce(tx.origin);
        harness.run();
        _assertFunding(address(faucet));
        assertEq(vm.getNonce(tx.origin), nonce + 2);
        uint256 ethSupply = eth.totalSupply();
        uint256 usdSupply = usd.totalSupply();
        harness.run();
        vm.removeFile(path);
        assertEq(eth.totalSupply(), ethSupply);
        assertEq(usd.totalSupply(), usdSupply);
    }

    function test_deployOnBaseSepolia() public {
        vm.chainId(84532);
        _fixture();
        address predicted = vm.computeCreateAddress(tx.origin, vm.getNonce(tx.origin));
        harness.run();
        vm.removeFile(path);
        _assertFunding(predicted);
        assertEq(ReflexFaucet(predicted).owner(), tx.origin);
    }

    function test_reuseRejectsMissingCodeAndWrongTokens() public {
        DeploymentRecords.Record memory r;
        r.rdETH = address(eth);
        r.rdUSD = address(usd);
        vm.expectRevert("Recorded faucet has no code; reconcile deployment record");
        harness.check(ReflexFaucet(address(0xFA)), r);
        ReflexFaucet faucet = new ReflexFaucet(eth, usd, 5e18, 15_000e18, 1 hours);
        harness.check(faucet, r);
        r.rdETH = address(usd);
        vm.expectRevert("Recorded faucet token mismatch; reconcile deployment record");
        harness.check(faucet, r);
        r.rdETH = address(eth);
        r.rdUSD = address(eth);
        vm.expectRevert("Recorded faucet token mismatch; reconcile deployment record");
        harness.check(faucet, r);
    }

    function test_rejectsUnsupportedChain() public {
        vm.chainId(5318007);
        vm.expectRevert(abi.encodeWithSelector(Addresses.UnsupportedChain.selector, uint256(5318007)));
        harness.run();
    }

    function test_rejectsMissingRecord() public {
        vm.expectRevert("Missing destination deployment record");
        harness.run();
    }

    function test_rejectsWrongTokenOwner() public {
        _fixture();
        vm.prank(tx.origin);
        usd.transferOwnership(address(0xBAD));
        vm.expectRevert("Operator must own both demo tokens");
        harness.run();
        vm.stopBroadcast();
        vm.removeFile(path);
    }

    function _fixture() private {
        harness = new FaucetDeploymentHarness(vm.toString(bytes32(msg.sig)));
        path = string.concat(vm.projectRoot(), "/deployments/faucet-", vm.toString(bytes32(msg.sig)), ".test.json");
        require(!vm.exists(path), "Test record path already exists");
        string memory json =
            vm.readFile(string.concat(vm.projectRoot(), "/deployments/", vm.toString(block.chainid), ".json"));
        // The live record already carries `faucet`; rename it so the fixture models a pre-faucet deployment.
        json = vm.replace(json, '"faucet"', '"liveFaucet"');
        vm.serializeJson("faucet-fixture", json);
        vm.serializeAddress("faucet-fixture", "rdETH", address(eth));
        vm.serializeAddress("faucet-fixture", "rdUSD", address(usd));
        json = vm.serializeString("faucet-fixture", "operatorNote", "preserve me");
        vm.writeJson(json, path);
        vm.writeJson('{"nested":[1,true,"kept"],"nullable":null}', path, ".extra");
    }

    function _assertFunding(address faucet) private view {
        assertEq(eth.balanceOf(faucet), 50_000e18);
        assertEq(usd.balanceOf(faucet), 150_000_000e18);
        assertEq(eth.owner(), tx.origin);
        assertEq(usd.owner(), tx.origin);
    }
}
