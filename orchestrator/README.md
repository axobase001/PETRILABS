# PETRILABS Orchestrator

Platform services for PETRILABS AI Agent ecosystem - heartbeat monitoring, dashboard API, and Akash deployment management.

## Features

- **Heartbeat Monitor** - Real-time monitoring of agent liveness on Base L2
- **Akash Integration** - Track container deployments and detect crashes
- **Missing Report Service** - Generate and manage heartbeat failure reports
- **Dashboard API** - REST endpoints for dashboard frontend
- **WebSocket Server** - Real-time updates for live agent status
- **Alert System** - Configurable alerts for critical events

## Quick Start

```bash
# Install dependencies
npm install

# Copy environment config
cp .env.example .env
# Edit .env with your configuration

# Build
npm run build

# Start
npm start

# Development mode
npm run dev
```

## Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | 3000 |
| `RPC_URL` | Base L2 RPC endpoint | https://mainnet.base.org |
| `FACTORY_ADDRESS` | PetriAgentFactory contract | - |
| `GENOME_REGISTRY_ADDRESS` | GenomeRegistry contract | - |
| `REDIS_URL` | Redis connection (optional) | - |
| `AKASH_RPC` | Akash RPC endpoint | - |
| `AKASH_REST` | Akash REST endpoint | - |
| `AKASH_MNEMONIC` | Akash wallet mnemonic | - |
| `CHECK_INTERVAL_MS` | Heartbeat check interval | 60000 |
| `WARNING_THRESHOLD_HOURS` | Warning threshold | 24 |
| `CRITICAL_THRESHOLD_HOURS` | Critical threshold | 6 |

## API Endpoints

### Agents
- `GET /api/v1/agents` - List all agents
- `GET /api/v1/agents/:address` - Get agent details
- `GET /api/v1/agents/:address/decisions` - Get decision history
- `GET /api/v1/agents/:address/transactions` - Get transaction history
- `GET /api/v1/agents/:address/stats` - Get agent statistics
- `GET /api/v1/agents/:address/missing-reports` - Get missing heartbeat reports

### Platform
- `GET /api/v1/overview` - Platform overview statistics
- `GET /api/v1/creators/:address/stats` - Creator statistics

### Missing Reports
- `GET /api/v1/missing-reports` - List all reports
- `GET /api/v1/missing-reports/:id` - Get specific report
- `POST /api/v1/missing-reports/:id/acknowledge` - Acknowledge report
- `POST /api/v1/missing-reports/:id/resolve` - Resolve report
- `GET /api/v1/missing-reports-stats` - Report statistics

### WebSocket
- `WS /ws` - Real-time updates

## WebSocket Protocol

Connect to `ws://localhost:3000/ws` and send subscription messages:

```json
{ "action": "subscribe", "agentAddress": "0x..." }
```

Receive events:
```json
{ "type": "heartbeat", "agentAddress": "0x...", "data": {...} }
{ "type": "status", "agentAddress": "0x...", "data": {...} }
{ "type": "death", "agentAddress": "0x...", "data": {...} }
```

## Architecture

```
orchestrator/
├── src/
│   ├── index.ts                 # Main entry point
│   ├── types/                   # TypeScript types
│   ├── utils/                   # Utilities (logger)
│   ├── middleware/              # Express middleware
│   ├── api/                     # API routes
│   │   ├── dashboard.ts         # REST API
│   │   └── websocket.ts         # WebSocket server
│   └── services/
│       ├── heartbeat/           # Heartbeat monitoring
│       │   ├── monitor.ts       # Core monitor service
│       │   └── missing-report.ts # Report management
│       └── akash/               # Akash integration
│           ├── client.ts        # Akash RPC client
│           └── deployment-store.ts # Deployment tracking
```

## License

MIT
