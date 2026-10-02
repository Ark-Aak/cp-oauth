FROM node:22-bookworm-slim AS base
WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 python3-venv ca-certificates openssl \
    && rm -rf /var/lib/apt/lists/*

FROM base AS python-deps
COPY requirements.txt /tmp/requirements.txt
RUN python3 -m venv /opt/clist-venv \
    && /opt/clist-venv/bin/python -m pip install --no-cache-dir --only-binary=:all: \
        --no-deps -r /tmp/requirements.txt

FROM base AS deps
COPY package.json package-lock.json ./
RUN HUSKY=0 npm ci

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM base AS migration
ENV NODE_ENV=production
COPY --chown=node:node --from=build /app/package.json /app/package-lock.json ./
COPY --chown=node:node --from=build /app/node_modules ./node_modules
COPY --chown=node:node --from=build /app/prisma ./prisma
COPY --chown=node:node --from=build /app/scripts ./scripts
COPY --chown=node:node --from=build /app/server/utils/secrets.ts ./server/utils/secrets.ts
COPY --chown=node:node --from=build /app/utils/oauth-redirect.ts /app/utils/validation.ts /app/utils/platforms.ts /app/utils/username.ts /app/utils/control-characters.ts ./utils/
USER node
CMD ["./node_modules/.bin/prisma", "--help"]

FROM base AS production
ENV NODE_ENV=production \
    NITRO_HOST=0.0.0.0 \
    NITRO_PORT=3000 \
    PYTHON_PATH=/opt/clist-venv/bin/python \
    PYTHONDONTWRITEBYTECODE=1
COPY --chown=node:node --from=build /app/.output ./.output
COPY --chown=node:node --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --chown=node:node --from=build /app/node_modules/@prisma ./node_modules/@prisma
COPY --chown=node:node --from=python-deps /opt/clist-venv /opt/clist-venv
COPY --chown=node:node --from=build /app/server/utils/clist-fetch.py ./server/utils/clist-fetch.py
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
    CMD ["node", "-e", "fetch('http://127.0.0.1:' + (process.env.NITRO_PORT || process.env.PORT || '3000') + '/api/readyz', { signal: AbortSignal.timeout(2500) }).then(response => process.exit(response.status === 200 ? 0 : 1)).catch(() => process.exit(1))"]
CMD ["node", ".output/server/index.mjs"]
