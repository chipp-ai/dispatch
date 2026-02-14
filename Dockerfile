# Dockerfile for Dispatch (Chipp Issues tracker)
# Standalone issue tracker with MCP server and WebSocket terminal streaming

FROM node:22-bookworm-slim AS base

# Install build dependencies
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source files
COPY . .

# Build the app
RUN npm run build

# Production stage
FROM node:22-bookworm-slim AS production

WORKDIR /app

# Copy built files and dependencies
COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/.next ./.next
COPY --from=base /app/package.json ./
COPY --from=base /app/next.config.js ./
COPY --from=base /app/server.ts ./
COPY --from=base /app/app ./app
COPY --from=base /app/components ./components
COPY --from=base /app/lib ./lib
COPY --from=base /app/dist ./dist
COPY --from=base /app/scripts ./scripts

# Set environment
ENV NODE_ENV=production
ENV PORT=3002

# Expose port
EXPOSE 3002

# Run with custom server (includes WebSocket support)
CMD ["npm", "start"]
