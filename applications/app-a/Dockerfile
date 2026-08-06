FROM node:22-alpine

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

COPY applications/app-a/package.json applications/app-a/package.json
COPY packages/shared/package.json packages/shared/package.json

RUN corepack enable && pnpm install --frozen-lockfile

COPY . .

RUN pnpm --filter app-a build

EXPOSE 3002

ENV PORT=3002

CMD ["pnpm", "--filter", "app-a", "start"]