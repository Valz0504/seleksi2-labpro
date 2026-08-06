FROM node:22-alpine

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

COPY auth-provider/server/package.json auth-provider/server/package.json
COPY packages/shared/package.json packages/shared/package.json

RUN corepack enable && pnpm install --frozen-lockfile

COPY . .

RUN pnpm --filter server exec prisma generate
RUN pnpm --filter server build

EXPOSE 3001

CMD ["node", "auth-provider/server/dist/src/main.js"]
