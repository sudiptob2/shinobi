# syntax=docker/dockerfile:1
# One image for Compose and for Render: build the web app and the Mastra bundle, then run them on a small Node runtime.

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY web/package.json web/package-lock.json web/
RUN npm ci --prefix web
COPY . .
RUN npm run build --prefix web && npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/.mastra/output .mastra/output
COPY --from=build /app/web/dist web/dist
# the labeled professors and the benchmark scripts, so `npm run batch` and `npm run judge` work inside the container
COPY data data
COPY scripts scripts
COPY src src
EXPOSE 4111
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD wget -qO- http://localhost:4111/app/me || exit 1
CMD ["node", ".mastra/output/index.mjs"]
