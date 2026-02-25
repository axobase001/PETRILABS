// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./interfaces/IAgentBank.sol";

/**
 * @title AgentBank
 * @notice Agent 的多链资产管理与跨链桥接
 * @dev 利用 EVM 地址同质性，同一地址跨链身份一致
 * @dev MVP 版本：单链为主，跨链查询通过预言机/缓存
 */
contract AgentBank is IAgentBank, Ownable {
    
    // 常量
    uint256 public constant MIN_BRIDGE_AMOUNT = 1e6; // 1 USDC
    uint256 public constant CURRENT_CHAIN = 8453;    // Base Mainnet
    
    // 本链 USDC
    IERC20 public usdc;
    
    // 链 ID => USDC 合约地址（在其他链上）
    mapping(uint256 => address) public chainUSDC;
    
    // 链 ID => 跨链桥适配器
    mapping(uint256 => address) public bridgeAdapters;
    
    // 支持的链列表
    uint256[] public supportedChains;
    
    // 跨链余额缓存（用于优化查询）
    // agent => chainId => cachedBalance
    mapping(address => mapping(uint256 => uint256)) public cachedCrossChainBalances;
    mapping(address => mapping(uint256 => uint256)) public cacheTimestamps;
    uint256 public constant CACHE_TTL = 1 hours;
    
    // Agent 死亡清扫授权
    mapping(address => bool) public authorizedSweepers;
    
    modifier onlySweeper() {
        require(authorizedSweepers[msg.sender], "Not authorized sweeper");
        _;
    }
    
    constructor(address _usdc) Ownable(msg.sender) {
        require(_usdc != address(0), "USDC address required");
        usdc = IERC20(_usdc);
        
        // 默认添加当前链
        chainUSDC[CURRENT_CHAIN] = _usdc;
        supportedChains.push(CURRENT_CHAIN);
    }
    
    /**
     * @notice 查询单链余额
     * @dev 在当前链上直接查询，其他链返回缓存值
     */
    function getBalanceOnChain(address agent, uint256 chainId) 
        public 
        view 
        override 
        returns (uint256) 
    {
        if (chainId == CURRENT_CHAIN) {
            // 当前链直接查询
            return usdc.balanceOf(agent);
        }
        
        // 其他链返回缓存值
        return cachedCrossChainBalances[agent][chainId];
    }
    
    /**
     * @notice 查询跨链总净资产
     * @dev MVP：当前链实时 + 其他链缓存
     * @dev 未来版本：通过 LayerZero View 函数查询实时跨链余额
     */
    function getTotalCrossChainBalance(address agent) 
        external 
        view 
        override 
        returns (uint256 total) 
    {
        for (uint i = 0; i < supportedChains.length; i++) {
            uint256 chainId = supportedChains[i];
            total += getBalanceOnChain(agent, chainId);
        }
        return total;
    }
    
    /**
     * @notice 更新跨链余额缓存（由预言机或 Agent 自己调用）
     * @param agent Agent 地址
     * @param chainId 链 ID
     * @param balance 余额
     */
    function updateCache(
        address agent, 
        uint256 chainId, 
        uint256 balance
    ) external {
        // 任何人都可以更新缓存（数据可验证）
        require(isChainSupported(chainId), "Chain not supported");
        
        cachedCrossChainBalances[agent][chainId] = balance;
        cacheTimestamps[agent][chainId] = block.timestamp;
    }
    
    /**
     * @notice 执行跨链转账
     * @dev MVP 版本：仅支持当前链操作，跨链需通过桥合约
     */
    function bridge(
        uint256 fromChain,
        uint256 toChain,
        uint256 amount
    ) external override returns (bytes32 bridgeTxId) {
        require(amount >= MIN_BRIDGE_AMOUNT, "Amount too small");
        require(fromChain == CURRENT_CHAIN, "Only support bridging from current chain");
        require(isChainSupported(toChain), "Dest chain not supported");
        require(bridgeAdapters[toChain] != address(0), "Bridge adapter not set");
        
        address adapter = bridgeAdapters[toChain];
        
        // 检查 Agent 余额
        require(usdc.balanceOf(msg.sender) >= amount, "Insufficient balance");
        
        // 批准桥合约使用 USDC
        // 实际调用由 Agent 在链下通过私钥签名完成
        // 这里仅记录意图
        
        bridgeTxId = keccak256(abi.encodePacked(
            msg.sender,
            fromChain,
            toChain,
            amount,
            block.timestamp
        ));
        
        emit BridgeInitiated(msg.sender, fromChain, toChain, amount, bridgeTxId);
        return bridgeTxId;
    }
    
    /**
     * @notice 死亡时清扫余额
     * @dev 将当前链上的 USDC 转至指定接收地址
     */
    function sweepOnDeath(address agent, address recipient) 
        external 
        override 
        onlySweeper 
    {
        require(recipient != address(0), "Invalid recipient");
        
        uint256 balance = usdc.balanceOf(agent);
        if (balance > 0) {
            // 注意：这需要 Agent 合约授权给 AgentBank
            // 或在 Agent 死亡时自动允许清扫
            bool success = usdc.transferFrom(agent, recipient, balance);
            require(success, "Transfer failed");
            
            emit SweepOnDeath(agent, recipient, balance);
        }
    }
    
    /**
     * @notice 添加支持的链
     */
    function addChain(uint256 chainId, address usdcAddress, address bridge) 
        external 
        override 
        onlyOwner 
    {
        require(chainId != 0, "Invalid chain ID");
        require(usdcAddress != address(0), "Invalid USDC address");
        
        if (chainUSDC[chainId] == address(0)) {
            supportedChains.push(chainId);
        }
        
        chainUSDC[chainId] = usdcAddress;
        bridgeAdapters[chainId] = bridge;
        
        emit ChainAdded(chainId, usdcAddress, bridge);
    }
    
    /**
     * @notice 获取支持的链列表
     */
    function getSupportedChains() external view override returns (uint256[] memory) {
        return supportedChains;
    }
    
    /**
     * @notice 检查链是否支持
     */
    function isChainSupported(uint256 chainId) public view override returns (bool) {
        return chainUSDC[chainId] != address(0);
    }
    
    /**
     * @notice 授权清扫者
     */
    function setSweeper(address sweeper, bool authorized) external onlyOwner {
        authorizedSweepers[sweeper] = authorized;
    }
    
    /**
     * @notice 获取缓存年龄
     */
    function getCacheAge(address agent, uint256 chainId) external view returns (uint256) {
        uint256 timestamp = cacheTimestamps[agent][chainId];
        if (timestamp == 0) return type(uint256).max;
        return block.timestamp - timestamp;
    }
    
    /**
     * @notice 检查缓存是否过期
     */
    function isCacheExpired(address agent, uint256 chainId) external view returns (bool) {
        uint256 timestamp = cacheTimestamps[agent][chainId];
        if (timestamp == 0) return true;
        return block.timestamp - timestamp > CACHE_TTL;
    }
}
