# syntax=docker/dockerfile:1
#
# Heroku build for the Pathment API.
#
# The API lives in server/, but Heroku's GitHub deploy builds from the REPO ROOT,
# so this root Dockerfile uses the repo root as its build context and copies
# server/ in. It mirrors server/Dockerfile (Node 20, prod-only deps, bcrypt
# compiled from source) with two Heroku-specific changes:
#   - the app binds the platform-injected $PORT (its config already reads it), so
#     no EXPOSE / hardcoded 5000 is needed;
#   - it runs as root — Heroku dynos are single-tenant isolated, and this avoids
#     UID/permission surprises the platform sometimes causes with a fixed USER.
#
# Your existing DigitalOcean deploy is unaffected: docker-compose there builds
# server/Dockerfile explicitly and ignores this file.

# ---- deps: production node_modules (build tools present so bcrypt compiles) ----
FROM node:20-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev

# ---- runner: lean runtime ----
FROM node:20-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
# dumb-init as PID 1 → clean SIGTERM handling on dyno cycling / restarts.
RUN apt-get update && apt-get install -y --no-install-recommends dumb-init \
    && rm -rf /var/lib/apt/lists/*
COPY --from=deps /app/node_modules ./node_modules
COPY server/ ./
ENTRYPOINT ["dumb-init","--"]
CMD ["node","src/index.js"]
