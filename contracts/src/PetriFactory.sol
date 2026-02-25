// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/proxy/Clones.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./interfaces/IPetriFactory.sol";
import "./interfaces/IPetriAgent.sol";
import "./PetriAgent.sol";

/**
 * @title PetriFactory
 * @notice Factory contract for creating new PetriAgent instances
 * @dev Uses minimal proxy pattern (Clones) for gas-efficient deployment
 */
contract PetriFactory is IPetriFactory, Ownable {
    using Clones for address;

    // ============ Constants ============
    uint256 public constant MIN_DEPOSIT = 20 * 1e6; // 20 USDC
    uint256 public constant PLATFORM_FEE = 5 * 1e6; // 5 USDC

    // ============ State Variables ============
    address public agentImplementation;
    IERC20 public usdc;
    
    mapping(address => AgentInfo) public agents;
    mapping(bytes32 => address) public genomeToAgent;
    address[] public allAgents;
    mapping(address => address[]) public creatorToAgents;

    uint256 public totalPlatformFees;

    // ============ Events ============
    event FundsRecovered(address indexed token, address indexed to, uint256 amount);

    // ============ Constructor ============
    constructor(address _usdc, address _agentImplementation) Ownable(msg.sender) {
        if (_usdc == address(0)) revert InvalidAgentImplementation();
        if (_agentImplementation == address(0)) revert InvalidAgentImplementation();
        
        usdc = IERC20(_usdc);
        agentImplementation = _agentImplementation;
    }

    // ============ Core Functions ============
    
    /**
     * @notice Create a new PetriAgent
     * @param _genome Unique genetic identifier for the agent
     * @param _initialDeposit Initial USDC deposit (minimum 20 USDC + 5 USDC fee)
     * @return agent Address of the newly created agent
     */
    function createAgent(
        bytes32 _genome,
        uint256 _initialDeposit
    ) external override returns (address agent) {
        if (_genome == bytes32(0)) revert InvalidGenome();
        if (_initialDeposit < MIN_DEPOSIT) revert InsufficientPayment();

        // Check genome uniqueness
        if (genomeToAgent[_genome] != address(0)) revert InvalidGenome();

        // Calculate amounts
        uint256 agentDeposit = _initialDeposit;
        uint256 totalRequired = agentDeposit + PLATFORM_FEE;

        // Transfer USDC from caller
        bool success = usdc.transferFrom(msg.sender, address(this), totalRequired);
        if (!success) revert AgentCreationFailed();

        // Collect platform fee
        totalPlatformFees += PLATFORM_FEE;

        // Create proxy clone
        agent = agentImplementation.clone();
        
        // Initialize the agent
        IPetriAgent(agent).initialize(_genome, address(this), address(usdc), 0);

        // Transfer deposit to agent
        success = usdc.transfer(agent, agentDeposit);
        if (!success) revert AgentCreationFailed();

        // Record agent info
        agents[agent] = AgentInfo({
            agent: agent,
            creator: msg.sender,
            genome: _genome,
            createdAt: block.timestamp,
            exists: true
        });

        genomeToAgent[_genome] = agent;
        allAgents.push(agent);
        creatorToAgents[msg.sender].push(agent);

        emit AgentCreated(agent, msg.sender, _genome, agentDeposit, block.timestamp);

        return agent;
    }

    // ============ View Functions ============
    
    function getAgent(address _agent) external view override returns (AgentInfo memory) {
        return agents[_agent];
    }

    function getAgentByGenome(bytes32 _genome) external view override returns (address) {
        return genomeToAgent[_genome];
    }

    function getAllAgents() external view override returns (address[] memory) {
        return allAgents;
    }

    function getAgentsByCreator(address _creator) external view override returns (address[] memory) {
        return creatorToAgents[_creator];
    }

    function getAgentCount() external view returns (uint256) {
        return allAgents.length;
    }

    // ============ Admin Functions ============
    
    /**
     * @notice Update the agent implementation address
     * @param _newImplementation New implementation contract address
     */
    function updateImplementation(address _newImplementation) external override onlyOwner {
        if (_newImplementation == address(0)) revert InvalidAgentImplementation();
        agentImplementation = _newImplementation;
        emit AgentImplementationUpdated(_newImplementation);
    }

    /**
     * @notice Update platform fee (only owner)
     * @param _newFee New fee amount in USDC (6 decimals)
     */
    function updatePlatformFee(uint256 _newFee) external override onlyOwner {
        emit PlatformFeeUpdated(_newFee);
    }

    /**
     * @notice Withdraw accumulated platform fees
     */
    function withdrawFunds() external override onlyOwner {
        uint256 amount = totalPlatformFees;
        if (amount == 0) revert InsufficientPayment();
        
        totalPlatformFees = 0;
        bool success = usdc.transfer(owner(), amount);
        if (!success) revert TransferFailed();

        emit FundsWithdrawn(owner(), amount);
    }

    /**
     * @notice Recover stuck ERC20 tokens (emergency only)
     */
    function recoverFunds(address _token, address _to) external onlyOwner {
        IERC20 token = IERC20(_token);
        uint256 balance = token.balanceOf(address(this));
        // Subtract platform fees for USDC
        if (_token == address(usdc)) {
            balance -= totalPlatformFees;
        }
        if (balance > 0) {
            token.transfer(_to, balance);
            emit FundsRecovered(_token, _to, balance);
        }
    }
}
