# ---- deps ----
FROM node:20-alpine AS deps
RUN corepack enable
WORKDIR /repo
COPY pnpm-workspace.yaml package.json .npmrc ./
COPY apps/api/package.json apps/api/package.json
# lockfile lives at repo root
COPY pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --filter api...

# ---- build ----
FROM node:20-alpine AS build
RUN corepack enable
WORKDIR /repo
COPY --from=deps /repo /repo
COPY apps/api apps/api
RUN pnpm --filter api build
# prune dev deps for a slim runtime
RUN pnpm --filter api --prod deploy /out

# ---- runtime ----
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV SIGNAL_PORT=8080
COPY --from=build /out/node_modules ./node_modules
COPY --from=build /out/package.json ./package.json
COPY --from=build /repo/apps/api/dist ./dist
EXPOSE 8080
CMD ["node", "dist/main.js"]
