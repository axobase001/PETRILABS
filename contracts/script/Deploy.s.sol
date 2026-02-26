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
        

        // Deploy factory
        PetriFactory factory = new PetriFactory(usdc, address(agentImplementation));
        

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
        

        // Deploy agent implementation
        PetriAgent agentImplementation = new PetriAgent();
        

        // Deploy factory
        PetriFactory factory = new PetriFactory(address(usdc), address(agentImplementation));
        

        vm.stopBroadcast();
    }
}

import "../test/mocks/MockUSDC.sol";
