#!/bin/bash
# PETRILABS Orchestrator - Deployment Verification Script
# Usage: ./verify-deployment.sh [url]

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

BASE_URL="${1:-http://localhost:3000}"
FAILED=0

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

check_endpoint() {
    local method=$1
    local endpoint=$2
    local expected_status=$3
    local description=$4
    
    echo -n "Testing $description... "
    
    local response
    local status
    
    response=$(curl -s -w "\n%{http_code}" -X "$method" "$BASE_URL$endpoint" 2>/dev/null || echo -e "\n000")
    status=$(echo "$response" | tail -n1)
    body=$(echo "$response" | head -n-1)
    
    if [ "$status" = "$expected_status" ]; then
        echo -e "${GREEN}OK${NC} (HTTP $status)"
        return 0
    else
        echo -e "${RED}FAILED${NC} (Expected $expected_status, got $status)"
        log_error "Response: $body"
        return 1
    fi
}

check_json_response() {
    local endpoint=$1
    local jq_filter=$2
    local description=$3
    
    echo -n "Testing $description... "
    
    local response
    response=$(curl -s "$BASE_URL$endpoint" 2>/dev/null)
    
    if echo "$response" | jq -e "$jq_filter" >/dev/null 2>&1; then
        echo -e "${GREEN}OK${NC}"
        return 0
    else
        echo -e "${RED}FAILED${NC}"
        log_error "Response: $response"
        return 1
    fi
}

echo "========================================"
echo "  PETRILABS Orchestrator Verification"
echo "  URL: $BASE_URL"
echo "========================================"
echo ""

# Health check
echo "### Health Checks ###"
if check_endpoint "GET" "/health" "200" "Health endpoint"; then
    health_response=$(curl -s "$BASE_URL/health")
    log_info "Health response: $health_response"
else
    FAILED=$((FAILED + 1))
fi
echo ""

# API endpoints
echo "### API Endpoints ###"

# Agents
if ! check_endpoint "GET" "/api/v1/agents" "200" "List agents"; then
    FAILED=$((FAILED + 1))
fi

if ! check_endpoint "GET" "/api/v1/agents/0x1234567890123456789012345678901234567890" "404" "Agent not found"; then
    FAILED=$((FAILED + 1))
fi

if ! check_endpoint "GET" "/api/v1/agents/invalid-address" "400" "Invalid address"; then
    FAILED=$((FAILED + 1))
fi

# Overview
if ! check_endpoint "GET" "/api/v1/overview" "200" "Platform overview"; then
    FAILED=$((FAILED + 1))
fi

# Missing Reports
if ! check_endpoint "GET" "/api/v1/missing-reports" "200" "List missing reports"; then
    FAILED=$((FAILED + 1))
fi

if ! check_endpoint "GET" "/api/v1/missing-reports-stats" "200" "Missing report stats"; then
    FAILED=$((FAILED + 1))
fi

echo ""

# JSON structure validation
echo "### JSON Response Validation ###"

if ! check_json_response "/health" ".status" "Health JSON structure"; then
    FAILED=$((FAILED + 1))
fi

if ! check_json_response "/api/v1/agents" ".success" "Agents JSON structure"; then
    FAILED=$((FAILED + 1))
fi

if ! check_json_response "/api/v1/overview" ".data.agents" "Overview JSON structure"; then
    FAILED=$((FAILED + 1))
fi

echo ""

# WebSocket test (optional)
echo "### WebSocket Test ###"
WS_URL=$(echo "$BASE_URL" | sed 's/http/ws/')
if command -v wscat >/dev/null 2>&1; then
    echo -n "Testing WebSocket connection... "
    if timeout 5 wscat -c "$WS_URL/ws" -x '{"action":"ping"}' 2>/dev/null | grep -q "pong"; then
        echo -e "${GREEN}OK${NC}"
    else
        echo -e "${YELLOW}SKIPPED${NC} (WebSocket test inconclusive)"
    fi
else
    log_warn "wscat not installed, skipping WebSocket test"
fi

echo ""

# Performance test
echo "### Performance Test ###"
echo -n "Testing API response time... "
response_time=$(curl -s -o /dev/null -w "%{time_total}" "$BASE_URL/api/v1/agents")
response_ms=$(echo "$response_time * 1000" | bc | cut -d. -f1)

if [ "$response_ms" -lt 1000 ]; then
    echo -e "${GREEN}OK${NC} (${response_ms}ms)"
else
    echo -e "${YELLOW}SLOW${NC} (${response_ms}ms)"
fi

echo ""

# Summary
echo "========================================"
if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}All tests passed!${NC}"
    exit 0
else
    echo -e "${RED}$FAILED test(s) failed${NC}"
    exit 1
fi
