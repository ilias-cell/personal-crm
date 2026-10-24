# Production image, built by CI (.github/workflows/deploy.yml). One image runs the app, the migrations and the seed.

ARG NODE_VERSION=24

FROM node:${NODE_VERSION}-slim AS base
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
# pnpm of the exact version pinned in package.json ("packageManager"), so CI and local machines match.
COPY package.json ./
RUN npm install --global "pnpm@$(node -p "require('./package.json').packageManager.split('@')[1]")"

FROM base AS build
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store pnpm install --frozen-lockfile
COPY . .
# DATABASE_URL is only a placeholder: the build must not reach a database, and the value is not kept in the image.
RUN DATABASE_URL=postgresql://build:build@127.0.0.1:1/build pnpm build && pnpm build:tools

FROM node:${NODE_VERSION}-slim AS runner
ARG GIT_SHA=dev
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3001 \
    HOSTNAME=0.0.0.0 \
    APP_VERSION=${GIT_SHA}
WORKDIR /app
# There is no public/ folder in the project yet; add a COPY for it here when one appears.
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
# Migrations and the seed run from this same image: node tools/migrate.js, node tools/seed.js
COPY --from=build --chown=node:node /app/drizzle ./drizzle
COPY --from=build --chown=node:node /app/build/tools ./tools
USER node
EXPOSE 3001
CMD ["node", "server.js"]
