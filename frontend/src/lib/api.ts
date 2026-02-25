import axios from 'axios';
import { DeploymentRequest, DeploymentResponse, AgentState } from '@/types';

const API_BASE_URL = process.env.NEXT_PUBLIC_ORCHESTRATOR_URL || 'http://localhost:3000';

const api = axios.create({
  baseURL: `${API_BASE_URL}/api`,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Deployment API
export const deploymentApi = {
  async createAgent(request: DeploymentRequest): Promise<DeploymentResponse> {
    const formData = new FormData();
    
    if (request.memoryFile) {
      formData.append('memoryFile', request.memoryFile);
    }
    if (request.memoryHash) {
      formData.append('memoryHash', request.memoryHash);
    }
    if (request.memoryURI) {
      formData.append('memoryURI', request.memoryURI);
    }
    
    formData.append('initialDeposit', request.initialDeposit);
    formData.append('creatorAddress', request.creatorAddress);
    formData.append('useRandom', String(request.useRandom));
    
    if (request.preferredTraits) {
      formData.append('preferredTraits', JSON.stringify(request.preferredTraits));
    }
    
    const response = await axios.post(`${API_BASE_URL}/api/agents`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    
    return response.data.data;
  },
  
  async getStatus(jobId: string): Promise<DeploymentResponse> {
    const response = await api.get(`/agents/${jobId}/status`);
    return response.data.data;
  },
  
  async pollUntilComplete(
    jobId: string,
    onProgress?: (response: DeploymentResponse) => void,
    interval = 5000
  ): Promise<DeploymentResponse> {
    return new Promise((resolve, reject) => {
      const poll = async () => {
        try {
          const status = await this.getStatus(jobId);
          onProgress?.(status);
          
          if (status.status === 'completed') {
            resolve(status);
          } else if (status.status === 'failed') {
            reject(new Error(status.error || 'Deployment failed'));
          } else {
            setTimeout(poll, interval);
          }
        } catch (error) {
          reject(error);
        }
      };
      
      poll();
    });
  },
};

// Agent API
export const agentApi = {
  async getAgent(address: string): Promise<{ info: any; state: AgentState }> {
    const response = await api.get(`/agents/${address}`);
    return response.data.data;
  },
  
  async getGeneExpression(address: string, geneId: number): Promise<string> {
    const response = await api.get(`/agents/${address}/genes/${geneId}`);
    return response.data.data.expression;
  },
};

export default api;
