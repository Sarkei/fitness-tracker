# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# libc6-compat helps some native npm binaries on Alpine (e.g. Tailwind oxide)
RUN apk add --no-cache libc6-compat

ENV NODE_OPTIONS=--max-old-space-size=4096

COPY package.json package-lock.json .npmrc ./
RUN npm ci --legacy-peer-deps

COPY . .

# Build frontend (Vite) — fails fast with visible logs
RUN npm run build

# Bundle server (npm exec mangle esbuild CLI flags — use npm script instead)
RUN npm run build:server

# Runtime stage
FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache libc6-compat wget

COPY package.json package-lock.json .npmrc ./
RUN npm ci --omit=dev --legacy-peer-deps

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server.js ./server.js
COPY --from=builder /app/prompts ./prompts

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:3000 || exit 1

CMD ["node", "server.js"]
