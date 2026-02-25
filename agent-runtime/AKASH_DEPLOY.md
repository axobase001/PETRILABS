# PetriLabs Akash Deployment Guide

## Quick Start

### 1. Build Docker Image

```bash
cd agent-runtime
docker build -t petrilabs/agent-runtime:latest .
```

### 2. Local Test with Docker Compose

```bash
# Copy environment template
cp .env.example .env
# Edit .env with your values

# Start services
docker-compose up -d

# View logs
docker-compose logs -f clawbot
```

### 3. Deploy to Akash

```bash
# Install Akash CLI
# https://docs.akash.network/guides/cli

# Create deployment
akash tx deployment create deploy.yaml --from your-key

# Get logs
akash provider lease-logs --dseq YOUR_DSEQ --provider PROVIDER --follow
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| AGENT_ADDRESS | Yes | Agent contract address |
| GENOME_HASH | Yes | Genome hash |
| PRIVATE_KEY | Yes | Agent private key |
| RPC_URL | Yes | Base L2 RPC URL |
| GENOME_REGISTRY_ADDRESS | Yes | GenomeRegistry contract |
| PETRI_AGENT_V2_ADDRESS | Yes | PetriAgentV2 contract |
| LLM_API_KEY | Yes | OpenRouter API key |
| WALLET_PRIVATE_KEY | Yes | Base L2 wallet for x402 |
| NKMC_JWT | No | nkmc.ai JWT token |
| OPENAI_API_KEY | No | For premium cognition |
| ANTHROPIC_API_KEY | No | For premium cognition |

## Architecture

ClawBot runs in Akash container with:
- Dual-mode cognition (Pollinations free + x402 premium)
- nkmc gateway for D-chromosome internet skills
- Turbo storage for Arweave uploads
- Heartbeat service for on-chain survival

See full documentation in COGNITION_DUAL_MODE.md and NKMC_INTEGRATION.md
