/**
 * API Types
 */

import { Request } from 'express';

export interface AuthenticatedRequest extends Request {
  user?: {
    address: string;
    nonce: string;
    signature: string;
  };
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: ApiError;
  meta?: {
    timestamp: number;
    requestId: string;
    pagination?: {
      page: number;
      limit: number;
      total: number;
    };
  };
}

export interface ApiError {
  code: string;
  message: string;
  details?: unknown;
  stack?: string;
}

export interface CreateAgentRequest {
  memoryFile?: string; // base64 encoded
  memoryHash?: string;
  memoryURI?: string;
  initialDeposit: string;
  preferredTraits?: string[];
  useRandom?: boolean;
}

export interface CreateAgentResponse {
  jobId: string;
  estimatedTime: number;
  status: string;
}

export interface JobStatusResponse {
  jobId: string;
  status: string;
  progress: number;
  result?: {
    agentAddress?: string;
    genomeHash?: string;
    akashUri?: string;
    analysis?: unknown;
  };
  error?: ApiError;
}

export interface GenomeQueryRequest {
  genomeHash: string;
}

export interface GenomeQueryResponse {
  genome: unknown;
  genes: unknown[];
  chromosomes: unknown[];
  regulatoryNetwork: unknown[];
}

export interface HeartbeatRequest {
  agentAddress: string;
  decisionHash: string;
  arweaveTxId?: string;
}

export interface HealthCheckResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  services: {
    blockchain: boolean;
    redis: boolean;
    llm: boolean;
    arweave: boolean;
    akash: boolean;
  };
  timestamp: number;
  version: string;
}

// Error codes
export const ErrorCodes = {
  INVALID_INPUT: 'INVALID_INPUT',
  UNAUTHORIZED: 'UNAUTHORIZED',
  NOT_FOUND: 'NOT_FOUND',
  RATE_LIMITED: 'RATE_LIMITED',
  BLOCKCHAIN_ERROR: 'BLOCKCHAIN_ERROR',
  LLM_ERROR: 'LLM_ERROR',
  DEPLOYMENT_FAILED: 'DEPLOYMENT_FAILED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;
