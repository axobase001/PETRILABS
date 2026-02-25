// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/PetriAgent.sol";
import "../src/PetriFactory.sol";

/**
 * @title Deploy
 * @notice Deployment script for PetriLabs contracts
 */
contract Deploy is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address usdc = vm.envAddress("USDC_ADDRESS");
        
        vm.startBroadcast(deployerPrivateKey);

        // Deploy agent implementation
        PetriAgent agentImplementation = new PetriAgent();
        console.log("PetriAgent Implementation deployed at:", address(agentImplementation));

        // Deploy factory
        PetriFactory factory = new PetriFactory(usdc, address(agentImplementation));
        console.log("PetriFactory deployed at:", address(factory));

        vm.stopBroadcast();
    }
}

/**
 * @title DeployTestnet
 * @notice Deployment script for testnet with mock USDC
 */
contract DeployTestnet is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        
        vm.startBroadcast(deployerPrivateKey);

        // Deploy mock USDC
        MockUSDC usdc = new MockUSDC();
        console.log("MockUSDC deployed at:", address(usdc));

        // Deploy agent implementation
        PetriAgent agentImplementation = new PetriAgent();
        console.log("PetriAgent Implementation deployed at:", address(agentImplementation));

        // Deploy factory
        PetriFactory factory = new PetriFactory(address(usdc), address(agentImplementation));
        console.log("PetriFactory deployed at:", address(factory));

        vm.stopBroadcast();
    }
}

import "../test/mocks/MockUSDC.sol";
