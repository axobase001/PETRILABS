import axios, { AxiosInstance, AxiosError } from 'axios'
import type { ApiResponse } from '@/types'

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api/v1'

class ApiClient {
  private client: AxiosInstance

  constructor() {
    this.client = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        'Content-Type': 'application/json',
      },
    })

    // Request interceptor
    this.client.interceptors.request.use(
      (config) => {
        const apiKey = localStorage.getItem('api_key')
        if (apiKey) {
          config.headers.Authorization = `Bearer ${apiKey}`
        }
        return config
      },
      (error) => Promise.reject(error)
    )

    // Response interceptor
    this.client.interceptors.response.use(
      (response) => response.data,
      (error: AxiosError<ApiResponse<any>>) => {
        const message = error.response?.data?.error?.message || error.message
        return Promise.reject(new Error(message))
      }
    )
  }

  // Agents
  async getAgents(params?: {
    status?: string
    creator?: string
    page?: number
    limit?: number
  }): Promise<ApiResponse<any>> {
    return this.client.get('/agents', { params })
  }

  async getAgent(address: string): Promise<ApiResponse<any>> {
    return this.client.get(`/agents/${address}`)
  }

  async getAgentDecisions(
    address: string,
    params?: { page?: number; limit?: number; action?: string }
  ): Promise<ApiResponse<any>> {
    return this.client.get(`/agents/${address}/decisions`, { params })
  }

  async getAgentTransactions(
    address: string,
    params?: { page?: number; limit?: number; type?: string }
  ): Promise<ApiResponse<any>> {
    return this.client.get(`/agents/${address}/transactions`, { params })
  }

  async getAgentStats(address: string): Promise<ApiResponse<any>> {
    return this.client.get(`/agents/${address}/stats`)
  }

  async getAgentMissingReports(address: string): Promise<ApiResponse<any>> {
    return this.client.get(`/agents/${address}/missing-reports`)
  }

  // Overview
  async getOverview(): Promise<ApiResponse<any>> {
    return this.client.get('/overview')
  }

  // Creators
  async getCreatorStats(address: string): Promise<ApiResponse<any>> {
    return this.client.get(`/creators/${address}/stats`)
  }

  // Missing Reports
  async getMissingReports(params?: {
    severity?: string
    resolved?: boolean
    acknowledged?: boolean
    page?: number
    limit?: number
  }): Promise<ApiResponse<any>> {
    return this.client.get('/missing-reports', { params })
  }

  async getMissingReport(id: string): Promise<ApiResponse<any>> {
    return this.client.get(`/missing-reports/${id}`)
  }

  async acknowledgeReport(id: string, acknowledgedBy: string): Promise<ApiResponse<any>> {
    return this.client.post(`/missing-reports/${id}/acknowledge`, { acknowledgedBy })
  }

  async resolveReport(id: string, resolution: string): Promise<ApiResponse<any>> {
    return this.client.post(`/missing-reports/${id}/resolve`, { resolution })
  }

  async getMissingReportStats(): Promise<ApiResponse<any>> {
    return this.client.get('/missing-reports-stats')
  }
}

export const api = new ApiClient()
export default api
