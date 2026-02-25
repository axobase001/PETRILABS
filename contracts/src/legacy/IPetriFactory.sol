// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./IPetriAgent.sol";

/**
 * @title IPetriFactory
 * @notice Factory interface for creating new PetriAgent instances
 */
interface IPetriFactory {
    // ============ Errors ============
    error InvalidGenome();
    error InsufficientPayment();
    error InvalidAgentImplementation();
    error AgentCreationFailed();
    error OnlyOrchestrator();
    error TransferFailed();

    // ============ Events ============
    event AgentCreated(
        address indexed agent,
        address indexed owner,
        bytes32 indexed genome,
        uint256 depositAmount,
        uint256 timestamp
    );
    event AgentImplementationUpdated(address indexed newImplementation);
    event PlatformFeeUpdated(uint256 newFee);
    event FundsWithdrawn(address indexed recipient, uint256 amount);

    // ============ Structs ============
    struct AgentInfo {
        address agent;
        address creator;
        bytes32 genome;
        uint256 createdAt;
        bool exists;
    }

    // ============ Functions ============
    function createAgent(
        bytes32 _genome,
        uint256 _initialDeposit
    ) external returns (address agent);

    function getAgent(address _agent) external view returns (AgentInfo memory);

    function getAgentByGenome(bytes32 _genome) external view returns (address);

    function getAllAgents() external view returns (address[] memory);

    function getAgentsByCreator(address _creator) external view returns (address[] memory);

    function updateImplementation(address _newImplementation) external;

    function updatePlatformFee(uint256 _newFee) external;

    function withdrawFunds() external;
}
