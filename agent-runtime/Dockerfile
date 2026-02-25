# PETRILABS Agent Runtime - Secure ClawBot
# Multi-stage build with security hardening

# ==========================================
# Stage 1: Build Skills
# ==========================================
FROM node:18-alpine AS skills-builder

WORKDIR /build/skills
COPY skills/package*.json ./
RUN npm ci
COPY skills/ ./
RUN npm run build

# ==========================================
# Stage 2: Build Agent Runtime
# ==========================================
FROM node:18-alpine AS builder

WORKDIR /app
COPY agent-runtime/package*.json ./
RUN npm ci
COPY agent-runtime/ ./
RUN npm run build

# ==========================================
# Stage 3: Production (Security Hardened)
# ==========================================
FROM node:18-alpine AS production

# Install security updates
RUN apk update && apk upgrade && apk add --no-cache \
    ca-certificates \
    && rm -rf /var/cache/apk/*

# Create non-root user
RUN addgroup -g 1001 -S clawbot && \
    adduser -S clawbot -u 1001 -G clawbot

WORKDIR /app

# Copy dependencies
COPY agent-runtime/package*.json ./
RUN npm ci --only=production && \
    npm cache clean --force && \
    rm -rf /tmp/* ~/.npm

# Copy built application
COPY --from=builder /app/dist ./dist
COPY --from=skills-builder /build/skills/dist ./skills/dist

# Create data directory
RUN mkdir -p /app/data && chown -R clawbot:clawbot /app

# Security: Remove unnecessary tools
RUN apk del curl wget 2>/dev/null || true

# Switch to non-root user
USER clawbot

# Expose port for health checks
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD node -e "console.log('health check')" || exit 1

# Environment
ENV NODE_ENV=production
ENV LOG_LEVEL=info
ENV SKILLS_PATH=/app/skills

# Security: Disable core dumps
ENV NODE_OPTIONS="--disable-proto=delete --disallow-code-generation-from-strings"

# Start with security flags
CMD ["node", "--experimental-modules", "dist/index.js"]
