// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/Registry.sol";
import "../src/PythiaVaultFactory.sol";
import "../src/SlashingArbiter.sol";
import "../src/MockPredictionMarket.sol";
import "../src/MockUSDC.sol";

contract Deploy is Script {
    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_PK");
        address deployer = vm.addr(pk);
        address usdc = vm.envOr("NEXT_PUBLIC_USDC_CONTRACT_ADDRESS", address(0));
        address automation = vm.envOr("AUTOMATION_WALLET", deployer);
        address traceValidator = vm.envOr("TRACE_VALIDATOR_WALLET", deployer);

        vm.startBroadcast(pk);

        if (usdc == address(0)) {
            MockUSDC mock = new MockUSDC();
            usdc = address(mock);
        }

        // 1. Registry first (caller is bootstrap arbiter via placeholder).
        Registry registry = new Registry(deployer);
        // 2. Real SlashingArbiter that knows the registry.
        SlashingArbiter arbiter = new SlashingArbiter(address(registry), automation, traceValidator);
        // 3. Rewire registry to the real arbiter, then lock.
        registry.setArbiter(address(arbiter));
        registry.lockArbiter();

        MockPredictionMarket market = new MockPredictionMarket(usdc);
        PythiaVaultFactory factory = new PythiaVaultFactory(
            address(registry),
            usdc,
            address(arbiter),
            address(market)
        );

        vm.stopBroadcast();

        console2.log("USDC:", usdc);
        console2.log("Registry:", address(registry));
        console2.log("SlashingArbiter:", address(arbiter));
        console2.log("MockPredictionMarket:", address(market));
        console2.log("PythiaVaultFactory:", address(factory));

        // Persist to broadcast/ — caller can grep for these.
        string memory out = string.concat(
            "USDC=", vm.toString(usdc), "\n",
            "REGISTRY=", vm.toString(address(registry)), "\n",
            "ARBITER=", vm.toString(address(arbiter)), "\n",
            "MARKET=", vm.toString(address(market)), "\n",
            "FACTORY=", vm.toString(address(factory)), "\n"
        );
        vm.writeFile("./broadcast/deployed.env", out);
    }
}
