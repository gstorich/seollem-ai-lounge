# ==============================================================================
# Seollem AI Lounge - Production Dockerfile for OCI (Oracle Cloud Infrastructure)
# ==============================================================================
FROM node:18-alpine AS base

WORKDIR /app

# Install dependencies
COPY server/package*.json ./server/
RUN cd server && npm install --omit=dev

# Copy server source code and assets
COPY server/ ./server/
COPY avatars/ ./avatars/
COPY gifts/ ./gifts/
COPY index.html ./index.html

WORKDIR /app/server

# Security: Non-root user
USER node

EXPOSE 4000

ENV NODE_ENV=production
ENV PORT=4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:4000/api/health || exit 1

CMD ["node", "server.js"]
