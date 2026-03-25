# Stage 1: Build
FROM node:22-alpine AS builder

# Native module dependencies (argon2, sqlite3)
RUN apk add --no-cache python3 make g++

RUN corepack enable && corepack prepare pnpm@10.13.1 --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

# Remove devDependencies from node_modules
RUN pnpm prune --prod

# Stage 2: Production
FROM node:22-alpine AS runner

WORKDIR /app

# Copy pruned node_modules (includes pre-compiled native bindings)
COPY --from=builder /app/node_modules ./node_modules
# Copy compiled client and server output
COPY --from=builder /app/dist ./dist
COPY package.json ./

# Pre-create persistent data directories
RUN mkdir -p data/uploads/_tmp

EXPOSE 3000

ENV NODE_ENV=production

# Mount this volume to persist the SQLite database and uploaded files
VOLUME ["/app/data"]

CMD ["node", "dist/server/index.js"]
