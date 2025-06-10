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

# Install dumb-init for proper signal handling and git for version control
RUN apk add --no-cache dumb-init git

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

# Create uploads directory with proper permissions
RUN mkdir -p uploads && \
    chmod 755 uploads && \
    chmod 755 public

# Expose port
EXPOSE 3000

# Health check with improved settings
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD node healthcheck.js || exit 1

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start application
CMD ["node", "app.js"]