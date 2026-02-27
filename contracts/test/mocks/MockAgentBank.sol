// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../../src/interfaces/IAgentBank.sol";

/**
 * @title MockAgentBank
 * @notice Mock agent bank for testing
 */
contract MockAgentBank is IAgentBank {
    mapping(address => mapping(uint256 => address)) public chainBalances;
    mapping(address => uint256) public totalBalances;
    
    function registerChain(uint256 chainId, address usdcAddress) external override {
        // Mock implementation
    }
    
    function getChainUSDC(uint256 chainId) external view override returns (address) {
        return address(0x123); // Mock address
    }
    
    function updateCrossChainBalance(address agent, uint256 chainId, uint256 balance) external override {
        totalBalances[agent] = balance;
    }
    
    function getTotalCrossChainBalance(address agent) external view override returns (uint256) {
        return totalBalances[agent];
    }
    
    function sweepOnDeath(address agent, address recipient) external override returns (uint256) {
        uint256 balance = totalBalances[agent];
        totalBalances[agent] = 0;
        return balance;
    }
    
    function depositToChain(uint256 chainId, uint256 amount) external override {
        // Mock implementation
    }
    
    function withdrawFromChain(uint256 chainId, uint256 amount) external override {
        // Mock implementation
    }
    
    function getCrossChainBalance(address agent, uint256 chainId) external view override returns (uint256) {
        return 0;
    }
}
