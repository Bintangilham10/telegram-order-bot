# === Stage 1: Build frontends ===
FROM node:20-alpine AS builder

WORKDIR /app
COPY package.json package-lock.json* ./
COPY packages/ ./packages/
COPY apps/admin/ ./apps/admin/

RUN npm install --workspaces --include-workspace-root

# Build admin panel
WORKDIR /app/apps/admin
ARG VITE_API_BASE_URL
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
RUN npm run build

# === Stage 2: Production server ===
FROM node:20-alpine

RUN apk add --no-cache tini

WORKDIR /app

COPY package.json package-lock.json* ./
COPY packages/ ./packages/
COPY apps/server/ ./apps/server/

RUN npm install --workspaces --include-workspace-root --omit=dev

# Copy built admin panel to the directory served by apps/server/src/index.js
COPY --from=builder /app/apps/admin/dist /app/apps/server/public/admin

# Data volume
RUN mkdir -p /app/data
VOLUME /app/data

EXPOSE 3000

ENV NODE_ENV=production
ENV DATA_DIR=/app/data
ENV PORT=3000

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "apps/server/src/index.js"]
