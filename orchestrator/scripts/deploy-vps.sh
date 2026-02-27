#!/bin/bash
# PETRILABS Orchestrator - VPS Deployment Script
# Usage: ./deploy-vps.sh [staging|production]

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
ENV=${1:-staging}
PROJECT_NAME="petrilabs-orchestrator"
DOCKER_REGISTRY="${DOCKER_REGISTRY:-}"  # Optional: for custom registry
VERSION=$(cat package.json | grep '"version"' | head -1 | awk -F: '{ print $2 }' | sed 's/[",]//g' | tr -d '[[:space:]]')

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  PETRILABS Orchestrator Deployment${NC}"
echo -e "${GREEN}  Environment: $ENV${NC}"
echo -e "${GREEN}  Version: $VERSION${NC}"
echo -e "${GREEN}========================================${NC}"

# Validate environment
if [[ "$ENV" != "staging" && "$ENV" != "production" ]]; then
    echo -e "${RED}Error: Environment must be 'staging' or 'production'${NC}"
    exit 1
fi

# Check prerequisites
check_prerequisites() {
    echo -e "${YELLOW}Checking prerequisites...${NC}"
    
    command -v docker >/dev/null 2>&1 || { echo -e "${RED}Docker is required but not installed.${NC}"; exit 1; }
    command -v docker-compose >/dev/null 2>&1 || { echo -e "${RED}Docker Compose is required but not installed.${NC}"; exit 1; }
    
    # Check if .env file exists
    if [[ ! -f ".env.$ENV" ]]; then
        echo -e "${RED}Error: .env.$ENV file not found${NC}"
        echo "Please create .env.$ENV from .env.example"
        exit 1
    fi
    
    echo -e "${GREEN}Prerequisites check passed${NC}"
}

# Build Docker image
build_image() {
    echo -e "${YELLOW}Building Docker image...${NC}"
    
    local tag="${PROJECT_NAME}:${VERSION}"
    
    docker build -t "$tag" -f docker/Dockerfile .
    docker tag "$tag" "${PROJECT_NAME}:latest"
    
    if [[ -n "$DOCKER_REGISTRY" ]]; then
        docker tag "$tag" "${DOCKER_REGISTRY}/${tag}"
        docker tag "$tag" "${DOCKER_REGISTRY}/${PROJECT_NAME}:latest"
    fi
    
    echo -e "${GREEN}Docker image built: $tag${NC}"
}

# Push to registry (optional)
push_image() {
    if [[ -n "$DOCKER_REGISTRY" ]]; then
        echo -e "${YELLOW}Pushing to registry...${NC}"
        docker push "${DOCKER_REGISTRY}/${PROJECT_NAME}:${VERSION}"
        docker push "${DOCKER_REGISTRY}/${PROJECT_NAME}:latest"
        echo -e "${GREEN}Image pushed to registry${NC}"
    fi
}

# Deploy to VPS
deploy() {
    echo -e "${YELLOW}Deploying to $ENV environment...${NC}"
    
    # Create logs directory
    mkdir -p logs
    
    # Copy environment file
    cp ".env.$ENV" .env
    
    # Stop existing containers
    echo -e "${YELLOW}Stopping existing containers...${NC}"
    docker-compose -f docker/docker-compose.yml down --remove-orphans
    
    # Pull latest images if using registry
    if [[ -n "$DOCKER_REGISTRY" ]]; then
        docker-compose -f docker/docker-compose.yml pull
    fi
    
    # Start containers
    echo -e "${YELLOW}Starting containers...${NC}"
    docker-compose -f docker/docker-compose.yml up -d
    
    # Wait for health check
    echo -e "${YELLOW}Waiting for health check...${NC}"
    sleep 10
    
    local retries=0
    local max_retries=30
    
    while [[ $retries -lt $max_retries ]]; do
        if curl -sf http://localhost:3000/health >/dev/null 2>&1; then
            echo -e "${GREEN}Health check passed!${NC}"
            break
        fi
        
        retries=$((retries + 1))
        echo -e "${YELLOW}Health check pending... ($retries/$max_retries)${NC}"
        sleep 5
    done
    
    if [[ $retries -eq $max_retries ]]; then
        echo -e "${RED}Health check failed!${NC}"
        echo -e "${YELLOW}Checking logs...${NC}"
        docker-compose -f docker/docker-compose.yml logs --tail=50 orchestrator
        exit 1
    fi
    
    echo -e "${GREEN}Deployment successful!${NC}"
}

# Cleanup old images
cleanup() {
    echo -e "${YELLOW}Cleaning up old images...${NC}"
    docker image prune -f --filter "label!=${PROJECT_NAME}"
    echo -e "${GREEN}Cleanup complete${NC}"
}

# Show status
show_status() {
    echo -e "${GREEN}========================================${NC}"
    echo -e "${GREEN}  Deployment Status${NC}"
    echo -e "${GREEN}========================================${NC}"
    
    echo -e "${YELLOW}Containers:${NC}"
    docker-compose -f docker/docker-compose.yml ps
    
    echo ""
    echo -e "${YELLOW}API Status:${NC}"
    curl -s http://localhost:3000/health | jq . 2>/dev/null || curl -s http://localhost:3000/health
    
    echo ""
    echo -e "${YELLOW}Resource Usage:${NC}"
    docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}\t{{.PIDs}}"
}

# Main execution
main() {
    check_prerequisites
    build_image
    push_image
    deploy
    cleanup
    show_status
    
    echo ""
    echo -e "${GREEN}========================================${NC}"
    echo -e "${GREEN}  Deployment Complete!${NC}"
    echo -e "${GREEN}========================================${NC}"
    echo ""
    echo -e "API: http://localhost:3000"
    echo -e "Health: http://localhost:3000/health"
    echo ""
    echo -e "Logs: docker-compose -f docker/docker-compose.yml logs -f"
    echo -e "Stop: docker-compose -f docker/docker-compose.yml down"
}

# Run rollback if requested
rollback() {
    echo -e "${YELLOW}Rolling back to previous version...${NC}"
    docker-compose -f docker/docker-compose.yml down
    docker-compose -f docker/docker-compose.yml up -d
    echo -e "${GREEN}Rollback complete${NC}"
}

# Handle commands
case "${2:-}" in
    rollback)
        rollback
        ;;
    status)
        show_status
        ;;
    logs)
        docker-compose -f docker/docker-compose.yml logs -f
        ;;
    *)
        main
        ;;
esac
