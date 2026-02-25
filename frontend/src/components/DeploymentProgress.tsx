'use client';

import { useEffect, useState } from 'react';
import { Check, Loader2, X, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DeploymentResponse } from '@/types';

interface DeploymentProgressProps {
  deployment: DeploymentResponse;
  onClose: () => void;
}

const steps = [
  { key: 'queued', label: 'Queued' },
  { key: 'analyzing', label: 'Analyzing Memory' },
  { key: 'generating_genome', label: 'Generating Genome' },
  { key: 'deploying', label: 'Deploying Agent' },
  { key: 'completed', label: 'Complete' },
];

export function DeploymentProgress({ deployment, onClose }: DeploymentProgressProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [isFailed, setIsFailed] = useState(false);

  useEffect(() => {
    const stepIndex = steps.findIndex(s => s.key === deployment.status);
    if (stepIndex >= 0) {
      setCurrentStep(stepIndex);
    }
    setIsFailed(deployment.status === 'failed');
  }, [deployment.status]);

  return (
    <div className="w-full max-w-2xl mx-auto p-8 rounded-2xl bg-dark-800 border border-dark-700">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-white">
          {isFailed ? 'Deployment Failed' : 'Deploying Agent'}
        </h2>
        <p className="mt-2 text-gray-400">
          {isFailed 
            ? deployment.error || 'Something went wrong'
            : 'Your agent is being born into the wild...'
          }
        </p>
      </div>

      {/* Progress Steps */}
      <div className="space-y-4">
        {steps.map((step, index) => {
          const isActive = index === currentStep;
          const isComplete = index < currentStep;
          const isCurrentStep = step.key === deployment.status;

          return (
            <div
              key={step.key}
              className={cn(
                'flex items-center gap-4 p-4 rounded-xl transition-all',
                isActive && !isFailed && 'bg-primary-500/10 border border-primary-500/30',
                isComplete && 'opacity-60',
                !isActive && !isComplete && 'opacity-40'
              )}
            >
              <div className={cn(
                'w-10 h-10 rounded-full flex items-center justify-center transition-colors',
                isComplete && !isFailed ? 'bg-green-500 text-white' :
                isActive && !isFailed ? 'bg-primary-500 text-white' :
                isFailed && isActive ? 'bg-red-500 text-white' :
                'bg-dark-700 text-gray-500'
              )}>
                {isComplete && !isFailed ? (
                  <Check className="w-5 h-5" />
                ) : isActive && !isFailed ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : isFailed && isActive ? (
                  <X className="w-5 h-5" />
                ) : (
                  <span className="text-sm font-medium">{index + 1}</span>
                )}
              </div>
              
              <div className="flex-1">
                <p className={cn(
                  'font-medium',
                  isActive ? 'text-white' : 'text-gray-400'
                )}>
                  {step.label}
                </p>
                {isCurrentStep && deployment.progress > 0 && (
                  <div className="mt-2 h-1 bg-dark-700 rounded-full overflow-hidden">
                    <div
                      className={cn(
                        'h-full transition-all duration-500',
                        isFailed ? 'bg-red-500' : 'bg-primary-500'
                      )}
                      style={{ width: `${deployment.progress}%` }}
                    />
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Result */}
      {deployment.status === 'completed' && deployment.agentAddress && (
        <div className="mt-8 p-4 rounded-xl bg-green-500/10 border border-green-500/30">
          <p className="text-green-400 font-medium">🎉 Agent Successfully Deployed!</p>
          <div className="mt-3 flex items-center gap-2">
            <code className="px-3 py-1 rounded bg-dark-900 text-sm font-mono text-gray-300">
              {deployment.agentAddress}
            </code>
            <a
              href={`https://basescan.org/address/${deployment.agentAddress}`}
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 rounded-lg hover:bg-dark-700 text-gray-400 hover:text-white transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
            </a>
          </div>
          <button
            onClick={onClose}
            className="mt-4 w-full py-3 rounded-lg bg-green-500 hover:bg-green-600 text-white font-medium transition-colors"
          >
            View My Agents
          </button>
        </div>
      )}

      {isFailed && (
        <button
          onClick={onClose}
          className="mt-8 w-full py-3 rounded-lg bg-dark-700 hover:bg-dark-600 text-white font-medium transition-colors"
        >
          Try Again
        </button>
      )}
    </div>
  );
}

export default DeploymentProgress;
