FROM node:22-alpine

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

COPY auth-provider/control-panel/package.json auth-provider/control-panel/package.json

RUN corepack enable && pnpm install --frozen-lockfile

COPY . .

RUN pnpm --filter control-panel build

EXPOSE 3000

CMD ["pnpm", "--filter", "control-panel", "start"]