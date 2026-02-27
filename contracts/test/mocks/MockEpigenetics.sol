// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../../src/interfaces/IEpigenetics.sol";

/**
 * @title MockEpigenetics
 * @notice Mock epigenetics contract for testing
 */
contract MockEpigenetics is IEpigenetics {
    mapping(address => AgentEpigeneticState) public states;
    
    function initializeAgent(address agent, uint256 initialDeposit) external override {
        states[agent] = AgentEpigeneticState({
            povertyStreak: 0,
            lastAutoEpigeneticTime: block.timestamp,
            initialDeposit: initialDeposit,
            currentStrategy: bytes32(0)
        });
        emit AgentInitialized(agent, initialDeposit);
    }
    
    function processStressResponse(address agent, uint256 currentBalance, uint256 metabolicCost) external override returns (bool shouldSuppress) {
        return false; // Never suppress for testing
    }
    
    function applyEpigeneticMark(address agent, EpigeneticMark calldata mark) external override {
        // Mock implementation
    }
    
    function getState(address agent) external view override returns (AgentEpigeneticState memory) {
        return states[agent];
    }
    
    function calculateStressLevel(address agent, uint256 currentBalance) external pure override returns (uint256) {
        return 0;
    }
}
