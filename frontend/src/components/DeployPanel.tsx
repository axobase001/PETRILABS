'use client';

import { useState } from 'react';
import { useAccount } from 'wagmi';
import { Sparkles, Shuffle, AlertCircle } from 'lucide-react';
import { FileUpload } from './FileUpload';
import { DeploymentProgress } from './DeploymentProgress';
import { cn, formatUSDC } from '@/lib/utils';
import { deploymentApi } from '@/lib/api';
import { useAppStore } from '@/stores/app';
import { MemoryAnalysis, DeploymentResponse } from '@/types';

const MIN_DEPOSIT = 20; // USDC
const PLATFORM_FEE = 5; // USDC

export function DeployPanel() {
  const { address, isConnected } = useAccount();
  const { addToast, addDeployment } = useAppStore();
  
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [analysis, setAnalysis] = useState<MemoryAnalysis | null>(null);
  const [deposit, setDeposit] = useState<string>('100');
  const [isDeploying, setIsDeploying] = useState(false);
  const [currentDeployment, setCurrentDeployment] = useState<DeploymentResponse | null>(null);
  const [useRandom, setUseRandom] = useState(false);

  const totalCost = (parseFloat(deposit) || 0) + PLATFORM_FEE;
  const canDeploy = isConnected && (selectedFile || useRandom) && parseFloat(deposit) >= MIN_DEPOSIT;

  const handleDeploy = async () => {
    if (!address || (!selectedFile && !useRandom)) return;
    
    setIsDeploying(true);
    
    try {
      const deployment = await deploymentApi.createAgent({
        memoryFile: selectedFile || undefined,
        initialDeposit: (parseFloat(deposit) * 1e6).toString(),
        creatorAddress: address,
        useRandom,
      });
      
      addDeployment(deployment);
      setCurrentDeployment(deployment);
      
      addToast({
        type: 'success',
        title: 'Deployment started',
        message: `Job ID: ${deployment.jobId.slice(0, 8)}...`,
      });
      
      // Poll for completion
      deploymentApi.pollUntilComplete(
        deployment.jobId,
        (progress) => {
          setCurrentDeployment(progress);
        }
      ).then((result) => {
        addToast({
          type: 'success',
          title: 'Agent deployed!',
          message: `Address: ${result.agentAddress?.slice(0, 8)}...`,
        });
        setIsDeploying(false);
      }).catch((error) => {
        addToast({
          type: 'error',
          title: 'Deployment failed',
          message: error.message,
        });
        setIsDeploying(false);
      });
      
    } catch (error) {
      addToast({
        type: 'error',
        title: 'Deployment failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
      setIsDeploying(false);
    }
  };

  if (currentDeployment && isDeploying) {
    return (
      <DeploymentProgress
        deployment={currentDeployment}
        onClose={() => {
          setIsDeploying(false);
          setCurrentDeployment(null);
        }}
      />
    );
  }

  return (
    <div className="w-full max-w-2xl mx-auto space-y-6">
      {/* Mode Selection */}
      <div className="grid grid-cols-2 gap-4">
        <button
          onClick={() => setUseRandom(false)}
          className={cn(
            'p-4 rounded-xl border-2 transition-all text-left',
            !useRandom
              ? 'border-primary-500 bg-primary-500/10'
              : 'border-dark-700 bg-dark-800 hover:border-dark-600'
          )}
        >
          <Sparkles className={cn(
            'w-6 h-6 mb-3',
            !useRandom ? 'text-primary-400' : 'text-gray-400'
          )} />
          <p className={cn(
            'font-medium',
            !useRandom ? 'text-white' : 'text-gray-300'
          )}>
            From Memory
          </p>
          <p className="mt-1 text-sm text-gray-400">
            Upload your memory file for personalized genome
          </p>
        </button>
        
        <button
          onClick={() => {
            setUseRandom(true);
            setSelectedFile(null);
          }}
          className={cn(
            'p-4 rounded-xl border-2 transition-all text-left',
            useRandom
              ? 'border-primary-500 bg-primary-500/10'
              : 'border-dark-700 bg-dark-800 hover:border-dark-600'
          )}
        >
          <Shuffle className={cn(
            'w-6 h-6 mb-3',
            useRandom ? 'text-primary-400' : 'text-gray-400'
          )} />
          <p className={cn(
            'font-medium',
            useRandom ? 'text-white' : 'text-gray-300'
          )}>
            Random Genome
          </p>
          <p className="mt-1 text-sm text-gray-400">
            Let the universe decide your agent's fate
          </p>
        </button>
      </div>

      {/* File Upload */}
      {!useRandom && (
        <FileUpload
          selectedFile={selectedFile}
          onFileSelect={setSelectedFile}
          onAnalysis={setAnalysis}
        />
      )}

      {/* Deposit Input */}
      <div className="p-6 rounded-xl bg-dark-800 border border-dark-700">
        <label className="block text-sm font-medium text-gray-300 mb-2">
          Initial Deposit (USDC)
        </label>
        <div className="relative">
          <input
            type="number"
            value={deposit}
            onChange={(e) => setDeposit(e.target.value)}
            min={MIN_DEPOSIT}
            className={cn(
              'w-full px-4 py-3 rounded-lg bg-dark-900 border text-white',
              'focus:outline-none focus:ring-2 focus:ring-primary-500',
              parseFloat(deposit) < MIN_DEPOSIT
                ? 'border-red-500'
                : 'border-dark-600'
            )}
            placeholder="100"
          />
          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400">
            USDC
          </span>
        </div>
        
        {parseFloat(deposit) < MIN_DEPOSIT && (
          <p className="mt-2 text-sm text-red-400 flex items-center gap-1">
            <AlertCircle className="w-4 h-4" />
            Minimum deposit is {MIN_DEPOSIT} USDC
          </p>
        )}
        
        <div className="mt-4 pt-4 border-t border-dark-700 space-y-2 text-sm">
          <div className="flex justify-between text-gray-400">
            <span>Initial Deposit</span>
            <span>{parseFloat(deposit) || 0} USDC</span>
          </div>
          <div className="flex justify-between text-gray-400">
            <span>Platform Fee</span>
            <span>{PLATFORM_FEE} USDC</span>
          </div>
          <div className="flex justify-between text-white font-medium pt-2 border-t border-dark-700">
            <span>Total</span>
            <span>{totalCost} USDC</span>
          </div>
        </div>
      </div>

      {/* Deploy Button */}
      <button
        onClick={handleDeploy}
        disabled={!canDeploy || isDeploying}
        className={cn(
          'w-full py-4 rounded-xl font-medium text-lg transition-all',
          canDeploy
            ? 'bg-gradient-to-r from-primary-500 to-primary-600 text-white hover:from-primary-400 hover:to-primary-500 shadow-lg shadow-primary-500/25 hover:shadow-xl'
            : 'bg-dark-700 text-gray-500 cursor-not-allowed'
        )}
      >
        {isDeploying ? (
          <span className="flex items-center justify-center gap-2">
            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            Deploying...
          </span>
        ) : !isConnected ? (
          'Connect Wallet to Deploy'
        ) : !selectedFile && !useRandom ? (
          'Upload Memory File'
        ) : parseFloat(deposit) < MIN_DEPOSIT ? (
          `Minimum ${MIN_DEPOSIT} USDC Required`
        ) : (
          `Deploy Agent (${totalCost} USDC)`
        )}
      </button>

      {/* Warning */}
      <div className="p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
        <p className="text-sm text-yellow-400">
          <strong>⚠️ One-way Door:</strong> Once deployed, you cannot pause, 
          modify, or intervene with your agent. It will operate autonomously 
          until its balance is depleted.
        </p>
      </div>
    </div>
  );
}

export default DeployPanel;
