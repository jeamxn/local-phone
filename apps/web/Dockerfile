# ---- deps ----
FROM node:20-alpine AS deps
RUN corepack enable
WORKDIR /repo
COPY pnpm-workspace.yaml package.json .npmrc pnpm-lock.yaml ./
COPY apps/web/package.json apps/web/package.json
RUN pnpm install --frozen-lockfile --filter web...

# ---- build ----
FROM node:20-alpine AS build
RUN corepack enable
WORKDIR /repo
# VITE_* values are baked into the client bundle at build time.
ARG VITE_SIGNAL_URL
ARG VITE_ICE_SERVERS
ENV VITE_SIGNAL_URL=$VITE_SIGNAL_URL
ENV VITE_ICE_SERVERS=$VITE_ICE_SERVERS
COPY --from=deps /repo /repo
COPY apps/web apps/web
RUN pnpm --filter web build
# react-router-serve needs the build output + production node_modules
RUN pnpm --filter web --prod deploy /out

# ---- runtime ----
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
COPY --from=build /out/node_modules ./node_modules
COPY --from=build /out/package.json ./package.json
COPY --from=build /repo/apps/web/build ./build
EXPOSE 3000
# Run the real Node entrypoint, NOT node_modules/.bin/react-router-serve
# (that's a /bin/sh wrapper — `node` on it throws SyntaxError).
CMD ["node", "node_modules/@react-router/serve/dist/cli.js", "./build/server/index.js"]
