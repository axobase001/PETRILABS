# PETRILABS Dashboard

React-based frontend for PETRILABS AI Agent Ecosystem.

## Features

- **Real-time Monitoring**: WebSocket integration for live agent updates
- **Agent Management**: View, search, and filter agents
- **Alert System**: Monitor missing heartbeat reports
- **Analytics**: Dashboard with key metrics and visualizations
- **Responsive Design**: Mobile-friendly interface

## Tech Stack

- React 18 + TypeScript
- Tailwind CSS
- Zustand (State Management)
- TanStack Query (Data Fetching)
- React Router (Routing)
- WebSocket (Real-time)

## Quick Start

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build
```

## Environment Variables

```bash
VITE_API_URL=http://localhost:3000/api/v1
VITE_WS_URL=ws://localhost:3000/ws
```

## Pages

- `/` - Dashboard with overview metrics
- `/agents` - Agent list and search
- `/agents/:address` - Agent details
- `/alerts` - Missing heartbeat alerts

## Build with Docker

```bash
docker build -t petrilabs-dashboard:latest .
docker run -p 3001:80 petrilabs-dashboard:latest
```
