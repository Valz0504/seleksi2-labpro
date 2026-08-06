FROM node:22-alpine

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

COPY auth-provider/sync-worker/package.json auth-provider/sync-worker/package.json
COPY packages/shared/package.json packages/shared/package.json

RUN corepack enable && pnpm install --frozen-lockfile

COPY . .

RUN pnpm --filter sync-worker build

EXPOSE 3004

CMD ["node", "auth-provider/sync-worker/dist/main.js"]