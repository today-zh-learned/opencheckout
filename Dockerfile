FROM node:22-alpine AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

WORKDIR /app

RUN corepack enable

FROM base AS build

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json biome.json ./
COPY packages ./packages
COPY services/gateway ./services/gateway

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @opencheckout/gateway... build

FROM base AS runtime

ENV NODE_ENV="production"
ENV PORT="8080"

RUN addgroup -S opencheckout && adduser -S opencheckout -G opencheckout

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages ./packages
COPY services/gateway ./services/gateway

RUN pnpm install --prod --frozen-lockfile --ignore-scripts

COPY --from=build /app/packages ./packages
COPY --from=build /app/services/gateway/dist ./services/gateway/dist

USER opencheckout

EXPOSE 8080

HEALTHCHECK --interval=10s --timeout=3s --start-period=20s \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 8080) + '/readyz').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "services/gateway/dist/index.js"]
