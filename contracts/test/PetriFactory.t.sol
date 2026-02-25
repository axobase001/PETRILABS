// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/PetriFactory.sol";
import "../src/PetriAgent.sol";
import "../src/interfaces/IPetriFactory.sol";
import "./mocks/MockUSDC.sol";

/**
 * @title PetriFactoryTest
 * @notice Test suite for PetriFactory contract
 */
contract PetriFactoryTest is Test {
    PetriFactory public factory;
    PetriAgent public agentImplementation;
    MockUSDC public usdc;
    
    address public owner = address(this);
    address public user1 = address(1);
    address public user2 = address(2);
    
    bytes32 public constant GENOME_1 = keccak256("genome-1");
    bytes32 public constant GENOME_2 = keccak256("genome-2");
    
    uint256 public constant MIN_DEPOSIT = 20 * 1e6; // 20 USDC
    uint256 public constant PLATFORM_FEE = 5 * 1e6; // 5 USDC

    event AgentCreated(
        address indexed agent,
        address indexed owner,
        bytes32 indexed genome,
        uint256 depositAmount,
        uint256 timestamp
    );

    function setUp() public {
        // Deploy mock USDC
        usdc = new MockUSDC();
        
        // Deploy agent implementation
        agentImplementation = new PetriAgent();
        
        // Deploy factory
        factory = new PetriFactory(address(usdc), address(agentImplementation));
        
        // Fund users
        usdc.transfer(user1, 10000 * 1e6);
        usdc.transfer(user2, 10000 * 1e6);
    }

    function test_Constructor() public {
        assertEq(address(factory.usdc()), address(usdc));
        assertEq(factory.agentImplementation(), address(agentImplementation));
    }

    function test_CreateAgent() public {
        uint256 initialDeposit = 100 * 1e6; // 100 USDC
        uint256 totalRequired = initialDeposit + PLATFORM_FEE;
        
        vm.startPrank(user1);
        usdc.approve(address(factory), totalRequired);
        
        vm.expectEmit(true, true, true, false);
        emit AgentCreated(address(0), user1, GENOME_1, initialDeposit, block.timestamp);
        
        address agent = factory.createAgent(GENOME_1, initialDeposit);
        vm.stopPrank();

        assertTrue(agent != address(0));
        
        IPetriFactory.AgentInfo memory info = factory.getAgent(agent);
        assertEq(info.creator, user1);
        assertEq(info.genome, GENOME_1);
        assertTrue(info.exists);
        
        assertEq(factory.getAgentByGenome(GENOME_1), agent);
        assertEq(factory.getAgentCount(), 1);
        
        // Check agent balance
        PetriAgent petriAgent = PetriAgent(agent);
        assertEq(petriAgent.getBalance(), initialDeposit);
        assertEq(petriAgent.genome(), GENOME_1);
    }

    function test_CreateAgent_InsufficientPaymentReverts() public {
        uint256 lowDeposit = 10 * 1e6; // 10 USDC (below minimum)
        
        vm.startPrank(user1);
        usdc.approve(address(factory), lowDeposit + PLATFORM_FEE);
        
        vm.expectRevert(IPetriFactory.InsufficientPayment.selector);
        factory.createAgent(GENOME_1, lowDeposit);
        vm.stopPrank();
    }

    function test_CreateAgent_ZeroGenomeReverts() public {
        vm.startPrank(user1);
        usdc.approve(address(factory), MIN_DEPOSIT + PLATFORM_FEE);
        
        vm.expectRevert(IPetriFactory.InvalidGenome.selector);
        factory.createAgent(bytes32(0), MIN_DEPOSIT);
        vm.stopPrank();
    }

    function test_CreateAgent_DuplicateGenomeReverts() public {
        uint256 initialDeposit = 100 * 1e6;
        uint256 totalRequired = initialDeposit + PLATFORM_FEE;
        
        // Create first agent
        vm.startPrank(user1);
        usdc.approve(address(factory), totalRequired);
        factory.createAgent(GENOME_1, initialDeposit);
        vm.stopPrank();

        // Try to create second agent with same genome
        vm.startPrank(user2);
        usdc.approve(address(factory), totalRequired);
        
        vm.expectRevert(IPetriFactory.InvalidGenome.selector);
        factory.createAgent(GENOME_1, initialDeposit);
        vm.stopPrank();
    }

    function test_CreateAgent_MultipleAgents() public {
        uint256 deposit1 = 100 * 1e6;
        uint256 deposit2 = 200 * 1e6;
        
        // Create first agent
        vm.startPrank(user1);
        usdc.approve(address(factory), deposit1 + PLATFORM_FEE);
        address agent1 = factory.createAgent(GENOME_1, deposit1);
        vm.stopPrank();
        
        // Create second agent
        vm.startPrank(user2);
        usdc.approve(address(factory), deposit2 + PLATFORM_FEE);
        address agent2 = factory.createAgent(GENOME_2, deposit2);
        vm.stopPrank();

        assertEq(factory.getAgentCount(), 2);
        
        address[] memory allAgents = factory.getAllAgents();
        assertEq(allAgents.length, 2);
        assertEq(allAgents[0], agent1);
        assertEq(allAgents[1], agent2);
    }

    function test_GetAgentsByCreator() public {
        uint256 deposit = 100 * 1e6;
        
        // User1 creates 2 agents
        vm.startPrank(user1);
        usdc.approve(address(factory), 2 * (deposit + PLATFORM_FEE));
        address agent1 = factory.createAgent(GENOME_1, deposit);
        address agent2 = factory.createAgent(keccak256("genome-user1-2"), deposit);
        vm.stopPrank();
        
        // User2 creates 1 agent
        vm.startPrank(user2);
        usdc.approve(address(factory), deposit + PLATFORM_FEE);
        address agent3 = factory.createAgent(GENOME_2, deposit);
        vm.stopPrank();

        address[] memory user1Agents = factory.getAgentsByCreator(user1);
        assertEq(user1Agents.length, 2);
        assertEq(user1Agents[0], agent1);
        assertEq(user1Agents[1], agent2);

        address[] memory user2Agents = factory.getAgentsByCreator(user2);
        assertEq(user2Agents.length, 1);
        assertEq(user2Agents[0], agent3);
    }

    function test_UpdateImplementation() public {
        PetriAgent newImplementation = new PetriAgent();
        
        factory.updateImplementation(address(newImplementation));
        assertEq(factory.agentImplementation(), address(newImplementation));
    }

    function test_UpdateImplementation_ZeroAddressReverts() public {
        vm.expectRevert(IPetriFactory.InvalidAgentImplementation.selector);
        factory.updateImplementation(address(0));
    }

    function test_UpdateImplementation_NotOwnerReverts() public {
        PetriAgent newImplementation = new PetriAgent();
        
        vm.prank(user1);
        vm.expectRevert();
        factory.updateImplementation(address(newImplementation));
    }

    function test_WithdrawFunds() public {
        uint256 deposit = 100 * 1e6;
        
        // Create agent to accumulate fees
        vm.startPrank(user1);
        usdc.approve(address(factory), deposit + PLATFORM_FEE);
        factory.createAgent(GENOME_1, deposit);
        vm.stopPrank();

        uint256 ownerBalanceBefore = usdc.balanceOf(owner);
        
        factory.withdrawFunds();
        
        uint256 ownerBalanceAfter = usdc.balanceOf(owner);
        assertEq(ownerBalanceAfter - ownerBalanceBefore, PLATFORM_FEE);
    }

    function test_WithdrawFunds_NoFundsReverts() public {
        vm.expectRevert(IPetriFactory.InsufficientPayment.selector);
        factory.withdrawFunds();
    }

    function test_PlatformFeeAccumulation() public {
        uint256 deposit = 100 * 1e6;
        
        // Create 3 agents
        for (uint i = 0; i < 3; i++) {
            vm.startPrank(user1);
            usdc.approve(address(factory), deposit + PLATFORM_FEE);
            factory.createAgent(keccak256(abi.encodePacked("genome", i)), deposit);
            vm.stopPrank();
        }

        assertEq(factory.totalPlatformFees(), 3 * PLATFORM_FEE);
    }

    function test_RecoverFunds() public {
        // Send extra USDC to factory (simulating stuck funds)
        uint256 stuckAmount = 1000 * 1e6;
        usdc.transfer(address(factory), stuckAmount);

        // Create an agent to have some platform fees
        vm.startPrank(user1);
        usdc.approve(address(factory), MIN_DEPOSIT + PLATFORM_FEE);
        factory.createAgent(GENOME_1, MIN_DEPOSIT);
        vm.stopPrank();

        uint256 ownerBalanceBefore = usdc.balanceOf(owner);
        
        // Recover stuck funds
        factory.recoverFunds(address(usdc), owner);
        
        uint256 ownerBalanceAfter = usdc.balanceOf(owner);
        assertEq(ownerBalanceAfter - ownerBalanceBefore, stuckAmount);
    }
}
