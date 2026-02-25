// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/PetriAgent.sol";
import "../src/interfaces/IPetriAgent.sol";
import "./mocks/MockUSDC.sol";

/**
 * @title PetriAgentTest
 * @notice Test suite for PetriAgent contract
 */
contract PetriAgentTest is Test {
    PetriAgent public agent;
    MockUSDC public usdc;
    
    address public orchestrator = address(1);
    address public user = address(2);
    
    bytes32 public constant GENOME = keccak256("test-genome");
    uint256 public constant INITIAL_BALANCE = 100 * 1e6; // 100 USDC

    event AgentBorn(address indexed agent, bytes32 indexed genome, uint256 birthTime);
    event Heartbeat(uint256 indexed nonce, uint256 timestamp, bytes32 decisionHash);
    event AgentDied(uint256 indexed deathTime, uint256 remainingBalance, bytes32 finalStateHash);
    event ArweaveRecordStored(string arweaveTxId, bytes32 dataHash);

    function setUp() public {
        // Deploy mock USDC
        usdc = new MockUSDC();
        
        // Deploy agent implementation
        agent = new PetriAgent();
        
        // Fund orchestrator
        usdc.transfer(orchestrator, 10000 * 1e6);
        
        // Fund user
        usdc.transfer(user, 10000 * 1e6);
    }

    function test_Initialize() public {
        vm.startPrank(orchestrator);
        usdc.approve(address(agent), INITIAL_BALANCE);
        
        vm.expectEmit(true, true, false, false);
        emit AgentBorn(address(agent), GENOME, block.timestamp);
        
        agent.initialize(GENOME, orchestrator, address(usdc), INITIAL_BALANCE);
        vm.stopPrank();

        assertEq(agent.genome(), GENOME);
        assertEq(agent.orchestrator(), orchestrator);
        assertEq(agent.birthTime(), block.timestamp);
        assertTrue(agent.isAlive());
        assertEq(agent.getBalance(), INITIAL_BALANCE);
    }

    function test_Initialize_ZeroGenomeReverts() public {
        vm.startPrank(orchestrator);
        usdc.approve(address(agent), INITIAL_BALANCE);
        
        vm.expectRevert(IPetriAgent.InvalidGenome.selector);
        agent.initialize(bytes32(0), orchestrator, address(usdc), INITIAL_BALANCE);
        vm.stopPrank();
    }

    function test_Initialize_ZeroOrchestratorReverts() public {
        vm.startPrank(orchestrator);
        usdc.approve(address(agent), INITIAL_BALANCE);
        
        vm.expectRevert(IPetriAgent.InvalidAmount.selector);
        agent.initialize(GENOME, address(0), address(usdc), INITIAL_BALANCE);
        vm.stopPrank();
    }

    function test_Heartbeat() public {
        // Initialize agent
        vm.startPrank(orchestrator);
        usdc.approve(address(agent), INITIAL_BALANCE);
        agent.initialize(GENOME, orchestrator, address(usdc), INITIAL_BALANCE);
        
        // Move time forward
        vm.warp(block.timestamp + 7 hours);
        
        bytes32 decisionHash = keccak256("decision-1");
        string memory arweaveTxId = "arweave-tx-1";
        
        vm.expectEmit(true, false, false, false);
        emit Heartbeat(1, block.timestamp, decisionHash);
        
        vm.expectEmit(false, false, false, false);
        emit ArweaveRecordStored(arweaveTxId, keccak256(abi.encodePacked(decisionHash, block.timestamp)));
        
        agent.heartbeat(decisionHash, arweaveTxId);
        vm.stopPrank();

        assertEq(agent.heartbeatNonce(), 1);
        assertEq(agent.lastDecisionHash(), decisionHash);
    }

    function test_Heartbeat_TooFrequentReverts() public {
        // Initialize agent
        vm.startPrank(orchestrator);
        usdc.approve(address(agent), INITIAL_BALANCE);
        agent.initialize(GENOME, orchestrator, address(usdc), INITIAL_BALANCE);
        
        bytes32 decisionHash = keccak256("decision-1");
        
        vm.expectRevert(IPetriAgent.HeartbeatTooFrequent.selector);
        agent.heartbeat(decisionHash, "");
        vm.stopPrank();
    }

    function test_Heartbeat_NotOrchestratorReverts() public {
        // Initialize agent
        vm.startPrank(orchestrator);
        usdc.approve(address(agent), INITIAL_BALANCE);
        agent.initialize(GENOME, orchestrator, address(usdc), INITIAL_BALANCE);
        vm.stopPrank();

        vm.warp(block.timestamp + 7 hours);

        vm.startPrank(user);
        bytes32 decisionHash = keccak256("decision-1");
        
        vm.expectRevert(IPetriAgent.NotOrchestrator.selector);
        agent.heartbeat(decisionHash, "");
        vm.stopPrank();
    }

    function test_Heartbeat_DeadAgentReverts() public {
        // Initialize agent with minimal balance
        vm.startPrank(orchestrator);
        usdc.approve(address(agent), 2 * 1e6); // 2 USDC
        agent.initialize(GENOME, orchestrator, address(usdc), 2 * 1e6);
        
        // Move time forward
        vm.warp(block.timestamp + 7 hours);
        
        bytes32 decisionHash = keccak256("decision-1");
        
        // This heartbeat will kill the agent due to low balance
        agent.heartbeat(decisionHash, "");
        
        assertFalse(agent.isAlive());
        
        // Move time forward again
        vm.warp(block.timestamp + 7 hours);
        
        // Try another heartbeat on dead agent
        vm.expectRevert(IPetriAgent.AgentDead.selector);
        agent.heartbeat(decisionHash, "");
        vm.stopPrank();
    }

    function test_ExecuteDecision() public {
        // Initialize agent
        vm.startPrank(orchestrator);
        usdc.approve(address(agent), INITIAL_BALANCE);
        agent.initialize(GENOME, orchestrator, address(usdc), INITIAL_BALANCE);
        
        bytes memory decisionData = abi.encode("action", "value");
        
        vm.expectEmit(true, false, false, false);
        emit IPetriAgent.DecisionExecuted(0, keccak256(decisionData), true);
        
        agent.executeDecision(decisionData);
        vm.stopPrank();

        IPetriAgent.Decision memory decision = agent.getDecision(0);
        assertEq(decision.id, 0);
        assertEq(decision.hash, keccak256(decisionData));
        assertTrue(decision.executed);
    }

    function test_Deposit() public {
        // Initialize agent
        vm.startPrank(orchestrator);
        usdc.approve(address(agent), 1e6);
        agent.initialize(GENOME, orchestrator, address(usdc), 1e6);
        vm.stopPrank();

        // Deposit before first heartbeat should work
        uint256 depositAmount = 50 * 1e6;
        vm.startPrank(user);
        usdc.approve(address(agent), depositAmount);
        
        vm.expectEmit(true, false, false, false);
        emit IPetriAgent.FundsDeposited(user, depositAmount);
        
        agent.deposit(depositAmount);
        vm.stopPrank();

        assertEq(agent.getBalance(), 51 * 1e6);
    }

    function test_Deposit_AfterHeartbeatReverts() public {
        // Initialize agent
        vm.startPrank(orchestrator);
        usdc.approve(address(agent), INITIAL_BALANCE);
        agent.initialize(GENOME, orchestrator, address(usdc), INITIAL_BALANCE);
        
        // Move time and do heartbeat
        vm.warp(block.timestamp + 7 hours);
        agent.heartbeat(keccak256("decision-1"), "");
        vm.stopPrank();

        // Try to deposit after heartbeat
        vm.startPrank(user);
        usdc.approve(address(agent), 50 * 1e6);
        
        vm.expectRevert(IPetriAgent.AgentAlreadyInitialized.selector);
        agent.deposit(50 * 1e6);
        vm.stopPrank();
    }

    function test_Die() public {
        // Initialize agent
        vm.startPrank(orchestrator);
        usdc.approve(address(agent), INITIAL_BALANCE);
        agent.initialize(GENOME, orchestrator, address(usdc), INITIAL_BALANCE);
        
        vm.expectEmit(true, false, false, false);
        emit AgentDied(block.timestamp, INITIAL_BALANCE, keccak256(abi.encodePacked(
            GENOME,
            uint256(0),
            bytes32(0)
        )));
        
        agent.die();
        vm.stopPrank();

        assertFalse(agent.isAlive());
    }

    function test_GetState() public {
        vm.startPrank(orchestrator);
        usdc.approve(address(agent), INITIAL_BALANCE);
        agent.initialize(GENOME, orchestrator, address(usdc), INITIAL_BALANCE);
        
        IPetriAgent.AgentState memory state = agent.getState();
        vm.stopPrank();

        assertEq(state.genome, GENOME);
        assertEq(state.birthTime, block.timestamp);
        assertEq(state.lastHeartbeat, block.timestamp);
        assertEq(state.heartbeatNonce, 0);
        assertTrue(state.isAlive);
        assertEq(state.balance, INITIAL_BALANCE);
        assertEq(state.lastDecisionHash, bytes32(0));
    }

    function test_GetArweaveRecords() public {
        vm.startPrank(orchestrator);
        usdc.approve(address(agent), INITIAL_BALANCE);
        agent.initialize(GENOME, orchestrator, address(usdc), INITIAL_BALANCE);
        
        vm.warp(block.timestamp + 7 hours);
        
        agent.heartbeat(keccak256("decision-1"), "tx-1");
        
        vm.warp(block.timestamp + 7 hours);
        
        agent.heartbeat(keccak256("decision-2"), "tx-2");
        vm.stopPrank();

        string[] memory records = agent.getArweaveRecords();
        assertEq(records.length, 2);
        assertEq(records[0], "tx-1");
        assertEq(records[1], "tx-2");
    }
}
