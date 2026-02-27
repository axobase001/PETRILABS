/**
 * WebSocket Server
 * Real-time updates for dashboard
 */

import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';
import { logger } from '../utils/logger';
import { HeartbeatMonitor } from '../services/heartbeat/monitor';
import {
  WebSocketMessage,
  HeartbeatWSMessage,
  DecisionWSMessage,
  StatusWSMessage,
  DeathWSMessage,
} from '../types';

export interface WebSocketServerOptions {
  server: Server;
  heartbeatMonitor: HeartbeatMonitor;
  path?: string;
}

export function createWebSocketServer(options: WebSocketServerOptions): WebSocketServer {
  const wss = new WebSocketServer({
    server: options.server,
    path: options.path || '/ws',
  });

  // Track connected clients with their subscriptions
  const clients = new Map<WebSocket, ClientInfo>();

  wss.on('connection', (ws: WebSocket, req) => {
    const clientId = generateClientId();
    const clientInfo: ClientInfo = {
      id: clientId,
      subscriptions: new Set(),
      connectedAt: Date.now(),
    };

    clients.set(ws, clientInfo);
    logger.info('WebSocket client connected', { clientId, ip: req.socket.remoteAddress });

    // Register with heartbeat monitor
    options.heartbeatMonitor.registerWebSocket(ws);

    // Send welcome message
    sendMessage(ws, {
      type: 'status',
      agentAddress: 'system',
      data: { message: 'Connected to PETRILABS realtime updates' },
      timestamp: Date.now(),
    });

    // Handle messages from client
    ws.on('message', (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString());
        handleClientMessage(ws, message, clientInfo);
      } catch (error) {
        sendError(ws, 'Invalid message format');
      }
    });

    // Handle disconnect
    ws.on('close', () => {
      clients.delete(ws);
      logger.info('WebSocket client disconnected', { clientId });
    });

    // Handle errors
    ws.on('error', (error) => {
      logger.error('WebSocket error', { clientId, error });
    });

    // Send heartbeat to keep connection alive
    const pingInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.ping();
      } else {
        clearInterval(pingInterval);
      }
    }, 30000);
  });

  // Set up heartbeat monitor listeners
  setupMonitorListeners(options.heartbeatMonitor, wss, clients);

  logger.info('WebSocket server started', { path: options.path || '/ws' });

  return wss;
}

interface ClientInfo {
  id: string;
  subscriptions: Set<string>; // agent addresses
  connectedAt: number;
}

interface ClientMessage {
  action: 'subscribe' | 'unsubscribe' | 'ping';
  agentAddress?: string;
  data?: any;
}

function handleClientMessage(
  ws: WebSocket,
  message: ClientMessage,
  clientInfo: ClientInfo
): void {
  switch (message.action) {
    case 'subscribe':
      if (message.agentAddress) {
        clientInfo.subscriptions.add(message.agentAddress);
        sendMessage(ws, {
          type: 'status',
          agentAddress: message.agentAddress,
          data: { message: 'Subscribed to agent updates' },
          timestamp: Date.now(),
        });
      }
      break;

    case 'unsubscribe':
      if (message.agentAddress) {
        clientInfo.subscriptions.delete(message.agentAddress);
        sendMessage(ws, {
          type: 'status',
          agentAddress: message.agentAddress,
          data: { message: 'Unsubscribed from agent updates' },
          timestamp: Date.now(),
        });
      }
      break;

    case 'ping':
      sendMessage(ws, {
        type: 'status',
        agentAddress: 'system',
        data: { message: 'pong', timestamp: Date.now() },
        timestamp: Date.now(),
      });
      break;

    default:
      sendError(ws, 'Unknown action');
  }
}

function setupMonitorListeners(
  monitor: HeartbeatMonitor,
  wss: WebSocketServer,
  clients: Map<WebSocket, ClientInfo>
): void {
  // Listen for alerts from the monitor
  monitor.onAlert((alert) => {
    const message: StatusWSMessage = {
      type: 'status',
      agentAddress: alert.agentAddress,
      data: {
        status: alert.severity === 'critical' ? 'critical' : 'warning',
        reason: alert.type,
        message: alert.message,
      },
      timestamp: Date.now(),
    };

    // Broadcast to all subscribed clients
    broadcastToSubscribers(wss, clients, alert.agentAddress, message);
  });
}

function broadcastToSubscribers(
  wss: WebSocketServer,
  clients: Map<WebSocket, ClientInfo>,
  agentAddress: string,
  message: WebSocketMessage
): void {
  const data = JSON.stringify(message);

  wss.clients.forEach((ws) => {
    if (ws.readyState !== WebSocket.OPEN) return;

    const clientInfo = clients.get(ws);
    if (!clientInfo) return;

    // Send if subscribed to this agent or if it's a system message
    if (
      agentAddress === 'system' ||
      clientInfo.subscriptions.has(agentAddress) ||
      clientInfo.subscriptions.has('all')
    ) {
      ws.send(data);
    }
  });
}

function sendMessage(ws: WebSocket, message: WebSocketMessage): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

function sendError(ws: WebSocket, errorMessage: string): void {
  sendMessage(ws, {
    type: 'error',
    agentAddress: 'system',
    data: { message: errorMessage },
    timestamp: Date.now(),
  });
}

function generateClientId(): string {
  return `ws-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

// Export broadcast functions for use by other services
export function broadcastHeartbeat(
  wss: WebSocketServer,
  agentAddress: string,
  data: HeartbeatWSMessage['data']
): void {
  const message: HeartbeatWSMessage = {
    type: 'heartbeat',
    agentAddress,
    data,
    timestamp: Date.now(),
  };

  wss.clients.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  });
}

export function broadcastDecision(
  wss: WebSocketServer,
  agentAddress: string,
  data: DecisionWSMessage['data']
): void {
  const message: DecisionWSMessage = {
    type: 'decision',
    agentAddress,
    data,
    timestamp: Date.now(),
  };

  wss.clients.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  });
}

export function broadcastStatus(
  wss: WebSocketServer,
  agentAddress: string,
  data: StatusWSMessage['data']
): void {
  const message: StatusWSMessage = {
    type: 'status',
    agentAddress,
    data,
    timestamp: Date.now(),
  };

  wss.clients.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  });
}

export function broadcastDeath(
  wss: WebSocketServer,
  agentAddress: string,
  data: DeathWSMessage['data']
): void {
  const message: DeathWSMessage = {
    type: 'death',
    agentAddress,
    data,
    timestamp: Date.now(),
  };

  wss.clients.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  });
}

export default createWebSocketServer;
