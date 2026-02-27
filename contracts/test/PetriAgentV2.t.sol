// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/PetriAgentV2.sol";
import "../src/interfaces/IPetriAgentV2.sol";
import "./mocks/MockUSDC.sol";
import "./mocks/MockGenomeRegistry.sol";
import "./mocks/MockEpigenetics.sol";
import "./mocks/MockAgentBank.sol";
import "./mocks/MockTombstone.sol";

/**
 * @title PetriAgentV2Test
 * @notice Test suite for PetriAgentV2 contract - Agent Autonomy
 * @dev Tests the heartbeat permission changes for agent EOA autonomy
 */
contract PetriAgentV2Test is Test {
    PetriAgentV2 public agent;
    MockUSDC public usdc;
    MockGenomeRegistry public genomeRegistry;
    MockEpigenetics public epigenetics;
    MockAgentBank public agentBank;
    MockTombstone public tombstone;
    
    address public orchestrator = address(1);
    address public agentEOA = address(2);      // Agent's EOA wallet for autonomous heartbeat
    address public randomUser = address(3);
    address public replicationManager = address(4);
    address public creator = address(5);       // Creator address for dividend tests
    
    bytes32 public constant GENOME = keccak256("test-genome");
    uint256 public constant INITIAL_BALANCE = 100 * 1e6; // 100 USDC
    uint256 public constant CREATOR_SHARE_BPS = 1000;    // 10% creator share

    event AgentBorn(address indexed agent, bytes32 indexed genomeHash, address indexed agentEOA, uint256 birthTime);
    event Heartbeat(uint256 indexed nonce, uint256 timestamp, bytes32 decisionHash);
    event AgentDied(address indexed agentId, uint256 indexed blockNumber, string reason, string arweaveTxId, uint256 remainingBalance, bytes32 finalStateHash);

    function setUp() public {
        // Deploy mocks
        usdc = new MockUSDC();
        genomeRegistry = new MockGenomeRegistry();
        epigenetics = new MockEpigenetics();
        agentBank = new MockAgentBank();
        tombstone = new MockTombstone();
        
        // Deploy agent implementation (proxy pattern)
        agent = new PetriAgentV2();
        
        // Register genome
        genomeRegistry.registerGenome(GENOME, "");
        
        // Fund orchestrator
        usdc.transfer(orchestrator, 10000 * 1e6);
        
        // Fund agentEOA
        usdc.transfer(agentEOA, 1000 * 1e6);
        
        // Fund random user
        usdc.transfer(randomUser, 1000 * 1e6);
        
        // Fund creator
        usdc.transfer(creator, 1000 * 1e6);
    }

    function _initializeAgent() internal {
        _initializeAgentWithCreator(creator, CREATOR_SHARE_BPS);
    }
    
    function _initializeAgentWithCreator(address _creator, uint256 _creatorShareBps) internal {
        vm.startPrank(orchestrator);
        usdc.approve(address(agent), INITIAL_BALANCE);
        
        agent.initialize(
            GENOME,
            orchestrator,
            address(usdc),
            address(genomeRegistry),
            replicationManager,
            address(epigenetics),
            address(agentBank),
            address(tombstone),
            INITIAL_BALANCE,
            agentEOA,
            creator,
            CREATOR_SHARE_BPS,
            _creator,
            _creatorShareBps
        );
        vm.stopPrank();
    }

    // ============ Initialization Tests ============

    function test_Initialize() public {
        vm.startPrank(orchestrator);
        usdc.approve(address(agent), INITIAL_BALANCE);
        
        vm.expectEmit(true, true, true, false);
        emit AgentBorn(address(agent), GENOME, agentEOA, block.timestamp);
        
        agent.initialize(
            GENOME,
            orchestrator,
            address(usdc),
            address(genomeRegistry),
            replicationManager,
            address(epigenetics),
            address(agentBank),
            address(tombstone),
            INITIAL_BALANCE,
            agentEOA,
            creator,
            CREATOR_SHARE_BPS
        );
        vm.stopPrank();

        assertEq(agent.genomeHash(), GENOME);
        assertEq(agent.orchestrator(), orchestrator);
        assertEq(agent.agentEOA(), agentEOA);
        assertEq(agent.birthTime(), block.timestamp);
        assertTrue(agent.isAlive());
        assertEq(agent.getBalance(), INITIAL_BALANCE);
    }

    function test_Initialize_ZeroAgentEOAReverts() public {
        vm.startPrank(orchestrator);
        usdc.approve(address(agent), INITIAL_BALANCE);
        
        vm.expectRevert(IPetriAgentV2.InvalidAgentEOA.selector);
        agent.initialize(
            GENOME,
            orchestrator,
            address(usdc),
            address(genomeRegistry),
            replicationManager,
            address(epigenetics),
            address(agentBank),
            address(tombstone),
            INITIAL_BALANCE,
            address(0) // Invalid EOA
        );
        vm.stopPrank();
    }

    // ============ Heartbeat Permission Tests - AgentEOA ============

    function test_Heartbeat_ByAgentEOA() public {
        // Initialize agent
        _initializeAgent();
        
        // Move time forward
        vm.warp(block.timestamp + 7 hours);
        
        bytes32 decisionHash = keccak256("decision-agent");
        string memory arweaveTxId = "arweave-tx-agent";
        
        // AgentEOA calls heartbeat
        vm.startPrank(agentEOA);
        vm.expectEmit(true, false, false, false);
        emit Heartbeat(1, block.timestamp, decisionHash);
        
        bool success = agent.heartbeat(decisionHash, arweaveTxId);
        vm.stopPrank();

        assertTrue(success);
        assertEq(agent.heartbeatNonce(), 1);
        assertEq(agent.lastDecisionHash(), decisionHash);
    }

    function test_Heartbeat_ByOrchestrator() public {
        // Initialize agent
        _initializeAgent();
        
        // Move time forward
        vm.warp(block.timestamp + 7 hours);
        
        bytes32 decisionHash = keccak256("decision-orchestrator");
        string memory arweaveTxId = "arweave-tx-orchestrator";
        
        // Orchestrator calls heartbeat (backward compatibility)
        vm.startPrank(orchestrator);
        vm.expectEmit(true, false, false, false);
        emit Heartbeat(1, block.timestamp, decisionHash);
        
        bool success = agent.heartbeat(decisionHash, arweaveTxId);
        vm.stopPrank();

        assertTrue(success);
        assertEq(agent.heartbeatNonce(), 1);
    }

    function test_Heartbeat_ByRandomUserReverts() public {
        // Initialize agent
        _initializeAgent();
        
        // Move time forward
        vm.warp(block.timestamp + 7 hours);
        
        bytes32 decisionHash = keccak256("decision-random");
        
        // Random user tries to call heartbeat
        vm.startPrank(randomUser);
        vm.expectRevert(IPetriAgentV2.NotAgentOrOrchestrator.selector);
        agent.heartbeat(decisionHash, "");
        vm.stopPrank();
    }

    function test_Heartbeat_AgentEOA_CanCallMultipleTimes() public {
        // Initialize agent
        _initializeAgent();
        
        // First heartbeat by agentEOA
        vm.warp(block.timestamp + 7 hours);
        vm.prank(agentEOA);
        agent.heartbeat(keccak256("decision-1"), "tx-1");
        assertEq(agent.heartbeatNonce(), 1);
        
        // Second heartbeat by agentEOA
        vm.warp(block.timestamp + 7 hours);
        vm.prank(agentEOA);
        agent.heartbeat(keccak256("decision-2"), "tx-2");
        assertEq(agent.heartbeatNonce(), 2);
        
        // Third heartbeat by orchestrator (mixed)
        vm.warp(block.timestamp + 7 hours);
        vm.prank(orchestrator);
        agent.heartbeat(keccak256("decision-3"), "tx-3");
        assertEq(agent.heartbeatNonce(), 3);
    }

    // ============ Heartbeat Permission Tests - Edge Cases ============

    function test_Heartbeat_SameAddressAsAgentEOAAndOrchestrator() public {
        // Edge case: agentEOA is the same as orchestrator
        vm.startPrank(orchestrator);
        usdc.approve(address(agent), INITIAL_BALANCE);
        
        agent.initialize(
            GENOME,
            orchestrator,
            address(usdc),
            address(genomeRegistry),
            replicationManager,
            address(epigenetics),
            address(agentBank),
            address(tombstone),
            INITIAL_BALANCE,
            orchestrator // Same as orchestrator
        );
        vm.stopPrank();
        
        vm.warp(block.timestamp + 7 hours);
        
        // Should work since orchestrator == agentEOA
        vm.prank(orchestrator);
        bool success = agent.heartbeat(keccak256("decision"), "");
        assertTrue(success);
    }

    // ============ ExecuteDecision Permission Tests ============

    function test_ExecuteDecision_ByAgentEOA() public {
        _initializeAgent();
        
        bytes memory decisionData = abi.encode("action", "value");
        
        vm.startPrank(agentEOA);
        vm.expectEmit(true, false, false, false);
        emit IPetriAgentV2.DecisionExecuted(0, keccak256(decisionData), true);
        
        bool success = agent.executeDecision(decisionData);
        vm.stopPrank();

        assertTrue(success);
        
        IPetriAgentV2.Decision memory decision = agent.decisions(0);
        assertEq(decision.id, 0);
        assertEq(decision.hash, keccak256(decisionData));
        assertTrue(decision.executed);
    }

    function test_ExecuteDecision_ByOrchestrator() public {
        _initializeAgent();
        
        bytes memory decisionData = abi.encode("action", "value");
        
        vm.startPrank(orchestrator);
        bool success = agent.executeDecision(decisionData);
        vm.stopPrank();

        assertTrue(success);
    }

    function test_ExecuteDecision_ByRandomUserReverts() public {
        _initializeAgent();
        
        bytes memory decisionData = abi.encode("action", "value");
        
        vm.startPrank(randomUser);
        vm.expectRevert(IPetriAgentV2.NotAgentOrOrchestrator.selector);
        agent.executeDecision(decisionData);
        vm.stopPrank();
    }

    // ============ Other Function Permissions (still onlyOrchestrator) ============

    function test_Die_StillOnlyOrchestrator() public {
        _initializeAgent();
        
        // agentEOA cannot call die
        vm.startPrank(agentEOA);
        vm.expectRevert(IPetriAgentV2.NotOrchestrator.selector);
        agent.die("test");
        vm.stopPrank();
        
        // orchestrator can call die
        vm.startPrank(orchestrator);
        agent.die("test");
        vm.stopPrank();
        
        assertFalse(agent.isAlive());
    }

    function test_ApplyEpigeneticMark_StillOnlyOrchestrator() public {
        _initializeAgent();
        
        IEpigenetics.EpigeneticMark memory mark = IEpigenetics.EpigeneticMark({
            geneId: 1,
            modification: 1,
            strength: 100,
            duration: 1 days
        });
        
        // agentEOA cannot call applyEpigeneticMark
        vm.startPrank(agentEOA);
        vm.expectRevert(IPetriAgentV2.NotOrchestrator.selector);
        agent.applyEpigeneticMark(mark);
        vm.stopPrank();
        
        // orchestrator can call
        vm.startPrank(orchestrator);
        agent.applyEpigeneticMark(mark);
        vm.stopPrank();
    }

    // ============ Integration Tests ============

    function test_FullAgentLifecycle_WithAgentEOA() public {
        // 1. Initialize
        _initializeAgent();
        assertEq(agent.agentEOA(), agentEOA);
        
        // 2. AgentEOA sends multiple heartbeats
        for (uint i = 0; i < 3; i++) {
            vm.warp(block.timestamp + 7 hours);
            vm.prank(agentEOA);
            agent.heartbeat(keccak256(abi.encode("decision", i)), string(abi.encode("tx-", i)));
        }
        assertEq(agent.heartbeatNonce(), 3);
        
        // 3. Orchestrator intervenes with a heartbeat
        vm.warp(block.timestamp + 7 hours);
        vm.prank(orchestrator);
        agent.heartbeat(keccak256("orchestrator-decision"), "orchestrator-tx");
        assertEq(agent.heartbeatNonce(), 4);
        
        // 4. AgentEOA executes decisions
        vm.prank(agentEOA);
        agent.executeDecision(abi.encode("agent-action"));
        assertEq(agent.decisionCount(), 1);
        
        // 5. Orchestrator can still kill the agent
        vm.prank(orchestrator);
        agent.die("final");
        assertFalse(agent.isAlive());
    }

    // ============ Gas Comparison Test ============

    function test_GasComparison_HeartbeatPermissions() public {
        _initializeAgent();
        vm.warp(block.timestamp + 7 hours);
        
        // Measure gas for agentEOA
        vm.prank(agentEOA);
        uint256 gasAgentEOA = gasleft();
        agent.heartbeat(keccak256("decision"), "");
        uint256 gasUsedAgentEOA = gasAgentEOA - gasleft();
        
        // Reset for orchestrator test
        PetriAgentV2 agent2 = new PetriAgentV2();
        vm.startPrank(orchestrator);
        usdc.approve(address(agent2), INITIAL_BALANCE);
        agent2.initialize(
            GENOME,
            orchestrator,
            address(usdc),
            address(genomeRegistry),
            replicationManager,
            address(epigenetics),
            address(agentBank),
            address(tombstone),
            INITIAL_BALANCE,
            agentEOA,
            creator,
            CREATOR_SHARE_BPS
        );
        vm.stopPrank();
        
        vm.warp(block.timestamp + 7 hours);
        
        // Measure gas for orchestrator
        vm.prank(orchestrator);
        uint256 gasOrchestrator = gasleft();
        agent2.heartbeat(keccak256("decision"), "");
        uint256 gasUsedOrchestrator = gasOrchestrator - gasleft();
        
        // Both should use similar gas (the extra check is a single SLOAD comparison)
        // Just verify both succeed - exact gas depends on implementation details
        assertGt(gasUsedAgentEOA, 0);
        assertGt(gasUsedOrchestrator, 0);
    }

    // ============ Flexible Heartbeat Interval Tests ============

    function test_MinHeartbeatInterval_Enforced() public {
        _initializeAgent();
        
        // Try to heartbeat immediately (< 6 hours) - should fail
        vm.startPrank(agentEOA);
        vm.expectRevert(abi.encodeWithSelector(IPetriAgentV2.HeartbeatTooFrequent.selector, 0));
        agent.heartbeat(keccak256("decision"), "");
        vm.stopPrank();
    }

    function test_Heartbeat_At6Hours_Succeeds() public {
        _initializeAgent();
        
        // Warp to exactly 6 hours
        vm.warp(block.timestamp + 6 hours);
        
        vm.startPrank(agentEOA);
        bool success = agent.heartbeat(keccak256("decision"), "");
        vm.stopPrank();
        
        assertTrue(success);
        assertEq(agent.heartbeatNonce(), 1);
    }

    function test_FlexibleHeartbeat_12Hours() public {
        _initializeAgent();
        
        // Agent can choose to heartbeat at 12 hours (survival mode)
        vm.warp(block.timestamp + 12 hours);
        
        vm.prank(agentEOA);
        agent.heartbeat(keccak256("decision-12h"), "");
        
        assertEq(agent.heartbeatNonce(), 1);
        
        // Next heartbeat can be at 18 hours (6 hours after last)
        vm.warp(block.timestamp + 6 hours); // Total 18 hours from start
        
        vm.prank(agentEOA);
        agent.heartbeat(keccak256("decision-18h"), "");
        
        assertEq(agent.heartbeatNonce(), 2);
    }

    function test_FlexibleHeartbeat_24Hours() public {
        _initializeAgent();
        
        // Agent can choose to heartbeat at 24 hours (conservation mode)
        vm.warp(block.timestamp + 24 hours);
        
        vm.prank(agentEOA);
        agent.heartbeat(keccak256("decision-24h"), "");
        
        assertEq(agent.heartbeatNonce(), 1);
    }

    function test_FlexibleHeartbeat_48Hours() public {
        _initializeAgent();
        
        // Agent can choose to heartbeat at 48 hours (hibernation mode)
        vm.warp(block.timestamp + 48 hours);
        
        vm.prank(agentEOA);
        agent.heartbeat(keccak256("decision-48h"), "");
        
        assertEq(agent.heartbeatNonce(), 1);
    }

    function test_FlexibleHeartbeat_UpTo7Days() public {
        _initializeAgent();
        
        // Agent can heartbeat anywhere up to 7 days
        vm.warp(block.timestamp + 7 days - 1); // Just under 7 days
        
        vm.prank(agentEOA);
        agent.heartbeat(keccak256("decision-7d-minus-1"), "");
        
        assertEq(agent.heartbeatNonce(), 1);
    }

    // ============ Abandoned Declaration Tests ============

    function test_DeclareAbandoned_Before7Days_Reverts() public {
        _initializeAgent();
        
        // Move forward 6 days (not enough for abandonment)
        vm.warp(block.timestamp + 6 days);
        
        // Anyone trying to declare abandoned should fail
        vm.startPrank(randomUser);
        uint256 timeRemaining = 7 days - 6 days;
        vm.expectRevert(abi.encodeWithSelector(IPetriAgentV2.AgentStillAlive.selector, timeRemaining));
        agent.declareAbandoned();
        vm.stopPrank();
        
        // Agent is still alive
        assertTrue(agent.isAlive());
    }

    function test_DeclareAbandoned_AtExactly7Days_Succeeds() public {
        _initializeAgent();
        
        // Move forward exactly 7 days
        vm.warp(block.timestamp + 7 days);
        
        // Now anyone can declare it abandoned
        vm.startPrank(randomUser);
        agent.declareAbandoned();
        vm.stopPrank();
        
        // Agent should be dead
        assertFalse(agent.isAlive());
    }

    function test_DeclareAbandoned_After7Days_Succeeds() public {
        _initializeAgent();
        
        // Move forward 8 days (well past abandonment threshold)
        vm.warp(block.timestamp + 8 days);
        
        // Anyone can declare it abandoned
        vm.startPrank(randomUser);
        agent.declareAbandoned();
        vm.stopPrank();
        
        // Agent should be dead
        assertFalse(agent.isAlive());
        
        // Should have a tombstone
        assertTrue(agent.hasTombstone());
    }

    function test_DeclareAbandoned_AlreadyDead_Reverts() public {
        _initializeAgent();
        
        // Kill the agent first
        vm.warp(block.timestamp + 7 hours);
        vm.prank(orchestrator);
        agent.die("test");
        
        assertFalse(agent.isAlive());
        
        // Try to declare abandoned - should revert
        vm.warp(block.timestamp + 8 days);
        vm.startPrank(randomUser);
        vm.expectRevert(IPetriAgentV2.AgentAlreadyDead.selector);
        agent.declareAbandoned();
        vm.stopPrank();
    }

    function test_DeclareAbandoned_EmitsEvent() public {
        _initializeAgent();
        
        vm.warp(block.timestamp + 7 days + 1 hours);
        
        vm.startPrank(randomUser);
        vm.expectEmit(true, false, false, true);
        emit IPetriAgentV2.AbandonedDeclared(address(agent), 7 days + 1 hours);
        agent.declareAbandoned();
        vm.stopPrank();
    }

    function test_DeclareAbandoned_AnyoneCanCall() public {
        _initializeAgent();
        
        vm.warp(block.timestamp + 7 days + 1);
        
        // Different addresses can all call declareAbandoned
        address[] memory callers = new address[](3);
        callers[0] = address(100);
        callers[1] = address(101);
        callers[2] = address(102);
        
        // First caller succeeds
        vm.prank(callers[0]);
        agent.declareAbandoned();
        
        assertFalse(agent.isAlive());
    }

    // ============ Elastic Interval Integration Test ============

    function test_ElasticInterval_Lifecycle() public {
        _initializeAgent();
        
        // High balance mode: every 6 hours
        vm.warp(block.timestamp + 6 hours);
        vm.prank(agentEOA);
        agent.heartbeat(keccak256("high-balance-1"), "");
        assertEq(agent.heartbeatNonce(), 1);
        
        // Medium balance mode: every 12 hours
        vm.warp(block.timestamp + 12 hours);
        vm.prank(agentEOA);
        agent.heartbeat(keccak256("medium-balance-1"), "");
        assertEq(agent.heartbeatNonce(), 2);
        
        // Conservation mode: every 24 hours
        vm.warp(block.timestamp + 24 hours);
        vm.prank(agentEOA);
        agent.heartbeat(keccak256("conservation-1"), "");
        assertEq(agent.heartbeatNonce(), 3);
        
        // Survival mode: every 48 hours
        vm.warp(block.timestamp + 48 hours);
        vm.prank(agentEOA);
        agent.heartbeat(keccak256("survival-1"), "");
        assertEq(agent.heartbeatNonce(), 4);
        
        // If agent doesn't heartbeat for 7 days, anyone can declare it abandoned
        vm.warp(block.timestamp + 7 days + 1);
        
        address stranger = address(999);
        vm.prank(stranger);
        agent.declareAbandoned();
        
        assertFalse(agent.isAlive());
    }

    function test_ElasticInterval_BoundaryConditions() public {
        _initializeAgent();
        
        // Test: 5 hours 59 minutes - should revert
        vm.warp(block.timestamp + 6 hours - 1);
        vm.startPrank(agentEOA);
        vm.expectRevert(abi.encodeWithSelector(IPetriAgentV2.HeartbeatTooFrequent.selector, 6 hours - 1));
        agent.heartbeat(keccak256("too-soon"), "");
        vm.stopPrank();
        
        // Test: exactly 6 hours - should succeed
        vm.warp(block.timestamp + 1); // Now exactly 6 hours
        vm.prank(agentEOA);
        agent.heartbeat(keccak256("exactly-6h"), "");
        assertEq(agent.heartbeatNonce(), 1);
        
        // Test: 6 days 23 hours 59 minutes - still alive
        vm.warp(block.timestamp + 6 days + 23 hours + 59 minutes);
        vm.prank(agentEOA);
        agent.heartbeat(keccak256("almost-7d"), "");
        assertEq(agent.heartbeatNonce(), 2);
        
        // Test: 7 days - can be declared abandoned
        vm.warp(block.timestamp + 7 days - (6 days + 23 hours + 59 minutes)); // Reset + exactly 7 days from first heartbeat
        // Actually easier to just do:
        _initializeAgent();
        vm.warp(block.timestamp + 7 days + 1);
        vm.prank(randomUser);
        agent.declareAbandoned();
        assertFalse(agent.isAlive());
    }

    // ============ Creator Dividend Tests ============

    function test_CreatorDividend_InitializeWithCreator() public {
        _initializeAgent();
        
        assertEq(agent.creator(), creator);
        assertEq(agent.creatorShareBps(), CREATOR_SHARE_BPS);
        assertEq(agent.totalCreatorDividends(), 0);
        assertEq(agent.initialDeposit(), INITIAL_BALANCE);
        assertEq(agent.totalExternalFunding(), 0);
    }

    function test_CreatorDividend_ShareTooHighReverts() public {
        PetriAgentV2 agent2 = new PetriAgentV2();
        
        vm.startPrank(orchestrator);
        usdc.approve(address(agent2), INITIAL_BALANCE);
        
        // 5001 bps = 50.01% > 50% max, should revert
        vm.expectRevert(IPetriAgentV2.InvalidAmount.selector);
        agent2.initialize(
            GENOME,
            orchestrator,
            address(usdc),
            address(genomeRegistry),
            replicationManager,
            address(epigenetics),
            address(agentBank),
            address(tombstone),
            INITIAL_BALANCE,
            agentEOA,
            creator,
            5001
        );
        vm.stopPrank();
    }

    function test_CreatorDividend_MaxShare50Percent() public {
        PetriAgentV2 agent2 = new PetriAgentV2();
        
        vm.startPrank(orchestrator);
        usdc.approve(address(agent2), INITIAL_BALANCE);
        
        // 5000 bps = 50%, should succeed (boundary value)
        agent2.initialize(
            GENOME,
            orchestrator,
            address(usdc),
            address(genomeRegistry),
            replicationManager,
            address(epigenetics),
            address(agentBank),
            address(tombstone),
            INITIAL_BALANCE,
            agentEOA,
            creator,
            5000 // 50%
        );
        vm.stopPrank();
        
        assertEq(agent2.creatorShareBps(), 5000);
    }

    function test_CreatorDividend_InitialDepositNoDividend() public {
        // Deploy agent with 0% share for simplicity
        PetriAgentV2 agent2 = new PetriAgentV2();
        address zeroShareCreator = address(200);
        
        vm.startPrank(orchestrator);
        usdc.approve(address(agent2), INITIAL_BALANCE);
        
        agent2.initialize(
            GENOME,
            orchestrator,
            address(usdc),
            address(genomeRegistry),
            replicationManager,
            address(epigenetics),
            address(agentBank),
            address(tombstone),
            INITIAL_BALANCE,
            agentEOA,
            zeroShareCreator,
            0 // 0% share
        );
        vm.stopPrank();
        
        // Even after heartbeat, initial deposit should not trigger dividend
        vm.warp(block.timestamp + 7 hours);
        vm.prank(agentEOA);
        agent2.heartbeat(keccak256("test"), "");
        
        // Now deposit more funds - should not trigger dividend (0% share)
        uint256 depositAmount = 100 * 1e6;
        usdc.transfer(randomUser, depositAmount);
        
        vm.startPrank(randomUser);
        usdc.approve(address(agent2), depositAmount);
        agent2.deposit(depositAmount);
        vm.stopPrank();
        
        // Creator should receive 0 dividend (0% share)
        assertEq(agent2.totalCreatorDividends(), 0);
    }

    function test_CreatorDividend_SubsequentDepositDividend() public {
        _initializeAgent();
        
        // Need to do a heartbeat first to mark agent as "active"
        vm.warp(block.timestamp + 7 hours);
        vm.prank(agentEOA);
        agent.heartbeat(keccak256("test"), "");
        
        // Now deposit more funds (subsequent deposit)
        uint256 depositAmount = 100 * 1e6;
        usdc.transfer(randomUser, depositAmount);
        
        uint256 creatorBalanceBefore = usdc.balanceOf(creator);
        
        vm.startPrank(randomUser);
        usdc.approve(address(agent), depositAmount);
        
        // Expect DividendPaid event
        uint256 expectedDividend = (depositAmount * CREATOR_SHARE_BPS) / 10000; // 10% of deposit
        vm.expectEmit(true, false, false, true);
        emit IPetriAgentV2.DividendPaid(creator, expectedDividend, depositAmount);
        
        agent.deposit(depositAmount);
        vm.stopPrank();
        
        // Creator should receive dividend
        uint256 creatorBalanceAfter = usdc.balanceOf(creator);
        assertEq(creatorBalanceAfter - creatorBalanceBefore, expectedDividend);
        assertEq(agent.totalCreatorDividends(), expectedDividend);
        assertEq(agent.totalExternalFunding(), depositAmount);
    }

    function test_CreatorDividend_MultipleDepositsAccumulate() public {
        _initializeAgent();
        
        // Do heartbeat first
        vm.warp(block.timestamp + 7 hours);
        vm.prank(agentEOA);
        agent.heartbeat(keccak256("test"), "");
        
        uint256 totalDividend = 0;
        
        // Multiple deposits
        for (uint i = 0; i < 3; i++) {
            uint256 depositAmount = 50 * 1e6;
            usdc.transfer(randomUser, depositAmount);
            
            vm.startPrank(randomUser);
            usdc.approve(address(agent), depositAmount);
            agent.deposit(depositAmount);
            vm.stopPrank();
            
            totalDividend += (depositAmount * CREATOR_SHARE_BPS) / 10000;
        }
        
        assertEq(agent.totalCreatorDividends(), totalDividend);
        assertEq(agent.totalExternalFunding(), 150 * 1e6);
    }

    function test_CreatorDividend_SurvivalFloorNoDividend() public {
        // Deploy with very low initial balance
        PetriAgentV2 agent2 = new PetriAgentV2();
        uint256 tinyBalance = 2 * 1e6; // 2 USDC - barely enough
        
        vm.startPrank(orchestrator);
        usdc.approve(address(agent2), tinyBalance);
        
        agent2.initialize(
            GENOME,
            orchestrator,
            address(usdc),
            address(genomeRegistry),
            replicationManager,
            address(epigenetics),
            address(agentBank),
            address(tombstone),
            tinyBalance,
            agentEOA,
            creator,
            5000 // 50% share
        );
        vm.stopPrank();
        
        // Do heartbeat to mark as active
        vm.warp(block.timestamp + 7 hours);
        vm.prank(agentEOA);
        agent2.heartbeat(keccak256("test"), "");
        
        // Small deposit - agent balance is near survival floor, should not trigger dividend
        uint256 smallDeposit = 1 * 1e6; // 1 USDC
        usdc.transfer(randomUser, smallDeposit);
        
        uint256 creatorBalanceBefore = usdc.balanceOf(creator);
        
        vm.startPrank(randomUser);
        usdc.approve(address(agent2), smallDeposit);
        agent2.deposit(smallDeposit);
        vm.stopPrank();
        
        // Creator should receive 0 (survival floor protection)
        uint256 creatorBalanceAfter = usdc.balanceOf(creator);
        assertEq(creatorBalanceAfter - creatorBalanceBefore, 0);
    }

    function test_CreatorDividend_50PercentShare() public {
        // Deploy with 50% share
        PetriAgentV2 agent2 = new PetriAgentV2();
        
        vm.startPrank(orchestrator);
        usdc.approve(address(agent2), INITIAL_BALANCE);
        
        agent2.initialize(
            GENOME,
            orchestrator,
            address(usdc),
            address(genomeRegistry),
            replicationManager,
            address(epigenetics),
            address(agentBank),
            address(tombstone),
            INITIAL_BALANCE,
            agentEOA,
            creator,
            5000 // 50%
        );
        vm.stopPrank();
        
        // Do heartbeat
        vm.warp(block.timestamp + 7 hours);
        vm.prank(agentEOA);
        agent2.heartbeat(keccak256("test"), "");
        
        // Deposit 100 USDC
        uint256 depositAmount = 100 * 1e6;
        usdc.transfer(randomUser, depositAmount);
        
        uint256 creatorBalanceBefore = usdc.balanceOf(creator);
        
        vm.startPrank(randomUser);
        usdc.approve(address(agent2), depositAmount);
        agent2.deposit(depositAmount);
        vm.stopPrank();
        
        // Creator should receive 50 USDC (50%)
        uint256 creatorBalanceAfter = usdc.balanceOf(creator);
        uint256 expectedDividend = 50 * 1e6;
        assertEq(creatorBalanceAfter - creatorBalanceBefore, expectedDividend);
    }

    function test_CreatorDividend_EventsEmitted() public {
        _initializeAgent();
        
        // Do heartbeat
        vm.warp(block.timestamp + 7 hours);
        vm.prank(agentEOA);
        agent.heartbeat(keccak256("test"), "");
        
        uint256 depositAmount = 50 * 1e6;
        usdc.transfer(randomUser, depositAmount);
        
        vm.startPrank(randomUser);
        usdc.approve(address(agent), depositAmount);
        
        // Expect both events
        vm.expectEmit(true, false, false, true);
        emit IPetriAgentV2.IncomeReceived(randomUser, depositAmount, "external");
        
        uint256 expectedDividend = (depositAmount * CREATOR_SHARE_BPS) / 10000;
        vm.expectEmit(true, false, false, true);
        emit IPetriAgentV2.DividendPaid(creator, expectedDividend, depositAmount);
        
        agent.deposit(depositAmount);
        vm.stopPrank();
    }

    function test_CreatorDividend_GasComparison() public {
        _initializeAgent();
        
        // Do heartbeat first
        vm.warp(block.timestamp + 7 hours);
        vm.prank(agentEOA);
        agent.heartbeat(keccak256("test"), "");
        
        // Measure gas for deposit with dividend
        uint256 depositAmount = 100 * 1e6;
        usdc.transfer(randomUser, depositAmount);
        
        vm.startPrank(randomUser);
        usdc.approve(address(agent), depositAmount);
        
        uint256 gasBefore = gasleft();
        agent.deposit(depositAmount);
        uint256 gasUsed = gasBefore - gasleft();
        vm.stopPrank();
        
        // Just verify it works - gas cost includes transfer + dividend calculation + transfer
        assertGt(gasUsed, 0);
        
        // Log for reference (in real test, you'd compare against baseline)
        emit log_named_uint("Gas used for deposit with dividend", gasUsed);
    }

    // ============ Income Source Tracking Tests ============

    function test_IncomeTracking_InitialDeposit() public {
        _initializeAgent();
        
        // Initial deposit should be recorded during initialization
        assertEq(agent.initialDeposit(), INITIAL_BALANCE);
        assertEq(agent.totalExternalFunding(), 0);
        assertEq(agent.totalEarnedIncome(), 0);
    }

    function test_IncomeTracking_ExternalDeposit() public {
        _initializeAgent();
        
        // Do heartbeat to mark agent as active (pass initial deposit phase)
        vm.warp(block.timestamp + 7 hours);
        vm.prank(agentEOA);
        agent.heartbeat(keccak256("test"), "");
        
        // External deposit
        uint256 depositAmount = 50 * 1e6;
        usdc.transfer(randomUser, depositAmount);
        
        vm.startPrank(randomUser);
        usdc.approve(address(agent), depositAmount);
        agent.deposit(depositAmount);
        vm.stopPrank();
        
        assertEq(agent.initialDeposit(), INITIAL_BALANCE);
        assertEq(agent.totalExternalFunding(), depositAmount);
        assertEq(agent.totalEarnedIncome(), 0);
    }

    function test_IncomeTracking_RecordEarnedIncome() public {
        _initializeAgent();
        
        // Record earned income as agentEOA
        uint256 earnedAmount = 100 * 1e6;
        
        vm.startPrank(agentEOA);
        vm.expectEmit(true, false, false, true);
        emit IPetriAgentV2.IncomeReceived(address(agent), earnedAmount, "earned");
        agent.recordEarnedIncome(earnedAmount);
        vm.stopPrank();
        
        assertEq(agent.initialDeposit(), INITIAL_BALANCE);
        assertEq(agent.totalExternalFunding(), 0);
        assertEq(agent.totalEarnedIncome(), earnedAmount);
    }

    function test_IncomeTracking_RecordEarnedIncome_AsOrchestrator() public {
        _initializeAgent();
        
        uint256 earnedAmount = 50 * 1e6;
        
        vm.prank(orchestrator);
        agent.recordEarnedIncome(earnedAmount);
        
        assertEq(agent.totalEarnedIncome(), earnedAmount);
    }

    function test_IncomeTracking_RecordEarnedIncome_ThirdPartyReverts() public {
        _initializeAgent();
        
        address thirdParty = address(300);
        
        vm.startPrank(thirdParty);
        vm.expectRevert(IPetriAgentV2.NotAgentOrOrchestrator.selector);
        agent.recordEarnedIncome(100 * 1e6);
        vm.stopPrank();
    }

    function test_IncomeTracking_ZeroAmountReverts() public {
        _initializeAgent();
        
        vm.startPrank(agentEOA);
        vm.expectRevert(IPetriAgentV2.InvalidAmount.selector);
        agent.recordEarnedIncome(0);
        vm.stopPrank();
    }

    function test_IncomeTracking_MultipleEarnedIncomeAccumulates() public {
        _initializeAgent();
        
        uint256 totalEarned = 0;
        
        // Record multiple earned incomes
        for (uint i = 0; i < 3; i++) {
            uint256 amount = 10 * 1e6 * (i + 1); // 10, 20, 30 USDC
            vm.prank(agentEOA);
            agent.recordEarnedIncome(amount);
            totalEarned += amount;
        }
        
        assertEq(agent.totalEarnedIncome(), totalEarned); // 60 USDC total
    }

    // ============ Survival Dependency Tests ============

    function test_SurvivalDependency_NoIncome() public {
        _initializeAgent();
        
        // No income recorded yet (but initial deposit was recorded during init)
        // initialDeposit = 100, external = 0, earned = 0
        // dependency = 100 / 100 = 100%
        uint256 dependency = agent.getSurvivalDependency();
        assertEq(dependency, 10000); // 100% dependency
    }

    function test_SurvivalDependency_50Percent() public {
        _initializeAgent();
        
        // Record earned income equal to initial deposit
        vm.prank(agentEOA);
        agent.recordEarnedIncome(INITIAL_BALANCE); // 100 USDC earned
        
        // initialDeposit = 100, external = 0, earned = 100
        // total = 200, external income = 100
        // dependency = 100 / 200 = 50%
        uint256 dependency = agent.getSurvivalDependency();
        assertEq(dependency, 5000); // 50% dependency
    }

    function test_SurvivalDependency_ZeroPercent() public {
        // Deploy with 0 initial balance
        PetriAgentV2 agent2 = new PetriAgentV2();
        
        vm.startPrank(orchestrator);
        // No USDC approval needed for 0 balance
        agent2.initialize(
            GENOME,
            orchestrator,
            address(usdc),
            address(genomeRegistry),
            replicationManager,
            address(epigenetics),
            address(agentBank),
            address(tombstone),
            0, // No initial balance
            agentEOA,
            creator,
            CREATOR_SHARE_BPS
        );
        vm.stopPrank();
        
        // Record earned income
        vm.prank(agentEOA);
        agent2.recordEarnedIncome(100 * 1e6);
        
        // initialDeposit = 0, external = 0, earned = 100
        // dependency = 0 / 100 = 0%
        uint256 dependency = agent2.getSurvivalDependency();
        assertEq(dependency, 0); // 0% dependency (fully independent)
    }

    function test_SurvivalDependency_WithExternalFunding() public {
        _initializeAgent();
        
        // Do heartbeat first
        vm.warp(block.timestamp + 7 hours);
        vm.prank(agentEOA);
        agent.heartbeat(keccak256("test"), "");
        
        // External deposit
        uint256 externalAmount = 50 * 1e6;
        usdc.transfer(randomUser, externalAmount);
        vm.startPrank(randomUser);
        usdc.approve(address(agent), externalAmount);
        agent.deposit(externalAmount);
        vm.stopPrank();
        
        // Earned income
        vm.prank(agentEOA);
        agent.recordEarnedIncome(50 * 1e6);
        
        // initial = 100, external = 50, earned = 50
        // total = 200, external income = 150
        // dependency = 150 / 200 = 75%
        uint256 dependency = agent.getSurvivalDependency();
        assertEq(dependency, 7500); // 75% dependency
    }

    function test_SurvivalDependency_Lifecycle() public {
        _initializeAgent();
        
        // Start: 100% dependency (only initial deposit)
        assertEq(agent.getSurvivalDependency(), 10000);
        
        // Earn some income
        vm.prank(agentEOA);
        agent.recordEarnedIncome(100 * 1e6);
        
        // Now: 50% dependency
        assertEq(agent.getSurvivalDependency(), 5000);
        
        // Earn more
        vm.prank(agentEOA);
        agent.recordEarnedIncome(200 * 1e6);
        
        // initial = 100, external = 0, earned = 300
        // dependency = 100 / 400 = 25%
        assertEq(agent.getSurvivalDependency(), 2500);
        
        // Earn even more
        vm.prank(agentEOA);
        agent.recordEarnedIncome(600 * 1e6);
        
        // initial = 100, external = 0, earned = 900
        // dependency = 100 / 1000 = 10%
        assertEq(agent.getSurvivalDependency(), 1000);
    }

    // ============ GetIncomeStats Tests ============

    function test_GetIncomeStats() public {
        _initializeAgent();
        
        // Do heartbeat
        vm.warp(block.timestamp + 7 hours);
        vm.prank(agentEOA);
        agent.heartbeat(keccak256("test"), "");
        
        // External deposit
        uint256 externalAmount = 50 * 1e6;
        usdc.transfer(randomUser, externalAmount);
        vm.startPrank(randomUser);
        usdc.approve(address(agent), externalAmount);
        agent.deposit(externalAmount);
        vm.stopPrank();
        
        // Earned income
        uint256 earnedAmount = 150 * 1e6;
        vm.prank(agentEOA);
        agent.recordEarnedIncome(earnedAmount);
        
        // Get stats
        (uint256 initial, uint256 external, uint256 earned, uint256 total, uint256 dependency) = agent.getIncomeStats();
        
        assertEq(initial, INITIAL_BALANCE);       // 100 USDC
        assertEq(external, externalAmount);        // 50 USDC
        assertEq(earned, earnedAmount);            // 150 USDC
        assertEq(total, 300 * 1e6);                // 300 USDC total
        assertEq(dependency, 5000);                // 50% dependency
    }

    function test_GetIncomeStats_ViewFunctionGas() public {
        _initializeAgent();
        
        // View function should use minimal gas
        uint256 gasBefore = gasleft();
        agent.getIncomeStats();
        uint256 gasUsed = gasBefore - gasleft();
        
        // Should be very cheap (just reading storage)
        assertLt(gasUsed, 50000);
        emit log_named_uint("Gas used for getIncomeStats", gasUsed);
    }

    function test_GetSurvivalDependency_ViewFunctionGas() public {
        _initializeAgent();
        
        uint256 gasBefore = gasleft();
        agent.getSurvivalDependency();
        uint256 gasUsed = gasBefore - gasleft();
        
        assertLt(gasUsed, 50000);
        emit log_named_uint("Gas used for getSurvivalDependency", gasUsed);
    }

    // ============ Integration: Earned Income with Dividend ============

    function test_EarnedIncome_TriggersDividend() public {
        _initializeAgent();
        
        uint256 earnedAmount = 100 * 1e6;
        uint256 creatorBalanceBefore = usdc.balanceOf(creator);
        
        // Record earned income
        vm.prank(agentEOA);
        agent.recordEarnedIncome(earnedAmount);
        
        // Creator should receive dividend (10% of earned)
        uint256 expectedDividend = (earnedAmount * CREATOR_SHARE_BPS) / 10000;
        uint256 creatorBalanceAfter = usdc.balanceOf(creator);
        
        assertEq(creatorBalanceAfter - creatorBalanceBefore, expectedDividend);
        assertEq(agent.totalCreatorDividends(), expectedDividend);
    }

    function test_EarnedIncome_EmitsEvents() public {
        _initializeAgent();
        
        uint256 earnedAmount = 50 * 1e6;
        
        vm.startPrank(agentEOA);
        
        // Expect both events: IncomeReceived and DividendPaid
        vm.expectEmit(true, false, false, true);
        emit IPetriAgentV2.IncomeReceived(address(agent), earnedAmount, "earned");
        
        uint256 expectedDividend = (earnedAmount * CREATOR_SHARE_BPS) / 10000;
        vm.expectEmit(true, false, false, true);
        emit IPetriAgentV2.DividendPaid(creator, expectedDividend, earnedAmount);
        
        agent.recordEarnedIncome(earnedAmount);
        vm.stopPrank();
    }

    // ============ Death & Legacy Tests ============

    function test_Death_LegacyTransferToCreator() public {
        _initializeAgent();
        
        // Do a heartbeat to pass initial phase
        vm.warp(block.timestamp + 7 hours);
        vm.prank(agentEOA);
        agent.heartbeat(keccak256("test"), "");
        
        // Add more funds to agent
        uint256 extraFunds = 50 * 1e6;
        usdc.transfer(randomUser, extraFunds);
        vm.startPrank(randomUser);
        usdc.approve(address(agent), extraFunds);
        agent.deposit(extraFunds);
        vm.stopPrank();
        
        uint256 agentBalance = agent.getBalance();
        uint256 creatorBalanceBefore = usdc.balanceOf(creator);
        
        // Orchestrator kills the agent
        vm.prank(orchestrator);
        agent.die("test-death");
        
        // Agent should be dead
        assertFalse(agent.isAlive());
        
        // Creator should receive all remaining funds
        uint256 creatorBalanceAfter = usdc.balanceOf(creator);
        assertEq(creatorBalanceAfter - creatorBalanceBefore, agentBalance);
        
        // Agent balance should be 0
        assertEq(agent.getBalance(), 0);
    }

    function test_Death_EmitsCorrectEvent() public {
        _initializeAgent();
        
        uint256 initialBalance = agent.getBalance();
        
        vm.prank(orchestrator);
        
        // Expect AgentDied event with correct parameters
        vm.expectEmit(true, false, false, true);
        emit IPetriAgentV2.AgentDied(
            address(agent),
            block.timestamp,
            "test-death",
            "",
            initialBalance,
            bytes32(0), // tombstoneId (may be 0 in mock)
            creator
        );
        
        agent.die("test-death");
    }

    function test_Death_AlreadyDeadReverts() public {
        _initializeAgent();
        
        // Kill the agent
        vm.prank(orchestrator);
        agent.die("first-death");
        
        assertFalse(agent.isAlive());
        
        // Try to kill again
        vm.startPrank(orchestrator);
        vm.expectRevert("Already dead");
        agent.die("second-death");
        vm.stopPrank();
    }

    function test_Death_DeclareAbandoned() public {
        _initializeAgent();
        
        // Warp past abandonment threshold
        vm.warp(block.timestamp + 7 days + 1);
        
        uint256 agentBalance = agent.getBalance();
        uint256 creatorBalanceBefore = usdc.balanceOf(creator);
        
        // Anyone can declare abandoned
        vm.prank(randomUser);
        agent.declareAbandoned();
        
        // Agent should be dead
        assertFalse(agent.isAlive());
        
        // Creator should receive funds
        uint256 creatorBalanceAfter = usdc.balanceOf(creator);
        assertEq(creatorBalanceAfter - creatorBalanceBefore, agentBalance);
    }

    function test_Death_DeclareAbandoned_EmitsAbandonedEvent() public {
        _initializeAgent();
        
        vm.warp(block.timestamp + 7 days + 1);
        
        vm.startPrank(randomUser);
        vm.expectEmit(true, false, false, true);
        emit IPetriAgentV2.AbandonedDeclared(address(agent), 7 days + 1);
        agent.declareAbandoned();
        vm.stopPrank();
    }

    function test_Death_WithZeroBalance() public {
        // Deploy agent with minimal balance
        PetriAgentV2 agent2 = new PetriAgentV2();
        
        vm.startPrank(orchestrator);
        usdc.approve(address(agent2), 1e6); // 1 USDC
        agent2.initialize(
            GENOME,
            orchestrator,
            address(usdc),
            address(genomeRegistry),
            replicationManager,
            address(epigenetics),
            address(agentBank),
            address(tombstone),
            1e6,
            agentEOA,
            creator,
            CREATOR_SHARE_BPS
        );
        vm.stopPrank();
        
        // Do heartbeat to consume all balance (metabolic exhaustion)
        vm.warp(block.timestamp + 7 days);
        vm.prank(agentEOA);
        agent2.heartbeat(keccak256("test"), "");
        
        // If agent died from starvation, isAlive should be false
        if (!agent2.isAlive()) {
            // Death with zero balance should succeed
            // Creator should receive 0 (no funds to transfer)
            assertEq(agent2.getBalance(), 0);
        } else {
            // Otherwise kill manually
            vm.prank(orchestrator);
            agent2.die("test-zero");
            assertFalse(agent2.isAlive());
        }
    }

    function test_Death_CreatorIsZeroAddress() public {
        // Deploy agent with zero creator address
        PetriAgentV2 agent2 = new PetriAgentV2();
        
        vm.startPrank(orchestrator);
        usdc.approve(address(agent2), INITIAL_BALANCE);
        
        // This should revert during initialization
        vm.expectRevert(IPetriAgentV2.InvalidAmount.selector);
        agent2.initialize(
            GENOME,
            orchestrator,
            address(usdc),
            address(genomeRegistry),
            replicationManager,
            address(epigenetics),
            address(agentBank),
            address(tombstone),
            INITIAL_BALANCE,
            agentEOA,
            address(0), // Zero creator
            0
        );
        vm.stopPrank();
    }

    function test_Death_HasTombstoneAfterDeath() public {
        _initializeAgent();
        
        vm.prank(orchestrator);
        agent.die("test-death");
        
        assertFalse(agent.isAlive());
        assertTrue(agent.hasTombstone());
    }

    function test_Death_Lifecycle() public {
        // Full lifecycle test
        _initializeAgent();
        
        // 1. Agent is alive
        assertTrue(agent.isAlive());
        
        // 2. Do some work
        vm.warp(block.timestamp + 7 hours);
        vm.prank(agentEOA);
        agent.heartbeat(keccak256("work"), "");
        
        // 3. Earn some income
        vm.prank(agentEOA);
        agent.recordEarnedIncome(50 * 1e6);
        
        // 4. Get final stats
        (,,,, uint256 dependencyBefore) = agent.getIncomeStats();
        
        // 5. Die
        uint256 finalBalance = agent.getBalance();
        uint256 creatorBalanceBefore = usdc.balanceOf(creator);
        
        vm.prank(orchestrator);
        agent.die("natural");
        
        // 6. Verify death
        assertFalse(agent.isAlive());
        assertTrue(agent.hasTombstone());
        
        // 7. Verify legacy transfer
        uint256 creatorBalanceAfter = usdc.balanceOf(creator);
        assertEq(creatorBalanceAfter - creatorBalanceBefore, finalBalance);
        
        // 8. Verify agent is empty
        assertEq(agent.getBalance(), 0);
    }
}
