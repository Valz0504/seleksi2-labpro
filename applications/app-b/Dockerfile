FROM node:22-alpine

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

COPY applications/app-b/package.json applications/app-b/package.json
COPY packages/shared/package.json packages/shared/package.json

RUN corepack enable && pnpm install --frozen-lockfile

COPY . .

RUN pnpm --filter app-b build

EXPOSE 3003

ENV PORT=3003

CMD ["pnpm", "--filter", "app-b", "start"]