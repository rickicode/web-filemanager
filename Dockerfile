# Multi-stage build for optimized image
FROM node:20-alpine AS builder

# Install git for potential git operations
RUN apk add --no-cache git

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies including dev dependencies
RUN npm ci

# Copy source code
COPY . .

# Production stage
FROM node:20-alpine AS production

# Install dumb-init, git, redis, and supervisor for managing multiple processes
RUN apk add --no-cache dumb-init git redis supervisor

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install only production dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy application files from builder
COPY --from=builder /app/public ./public
COPY --from=builder /app/app.js ./
COPY --from=builder /app/healthcheck.js ./

# Create uploads directory and redis data directory with proper permissions
RUN mkdir -p uploads redis-data && \
    chmod 755 uploads && \
    chmod 755 public && \
    chmod 755 redis-data

# Create supervisor configuration for managing Redis and Node.js
RUN mkdir -p /etc/supervisor.d
COPY <<EOF /etc/supervisor.d/supervisord.conf
[supervisord]
nodaemon=true
user=root
logfile=/dev/stdout
logfile_maxbytes=0

[program:redis]
command=redis-server --port 6379 --bind 127.0.0.1 --dir /app/redis-data --appendonly yes
stdout_logfile=/dev/stdout
stdout_logfile_maxbytes=0
stderr_logfile=/dev/stderr
stderr_logfile_maxbytes=0
autorestart=true

[program:filemanager]
command=node app.js
stdout_logfile=/dev/stdout
stdout_logfile_maxbytes=0
stderr_logfile=/dev/stderr
stderr_logfile_maxbytes=0
autorestart=true
environment=REDIS_URL="redis://127.0.0.1:6379"
EOF

# Set environment variables
ENV REDIS_URL=redis://127.0.0.1:6379
ENV NODE_ENV=production

# Expose port
EXPOSE 3000

# Health check with improved settings - check both Redis and Node.js app
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
    CMD redis-cli ping && node healthcheck.js || exit 1

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start supervisor to manage Redis and Node.js application
CMD ["supervisord", "-c", "/etc/supervisor.d/supervisord.conf"]