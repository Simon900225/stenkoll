# syntax=docker/dockerfile:1

FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build
RUN npm prune --omit=dev

FROM node:22-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3250
ENV HOST=0.0.0.0
ENV BODY_SIZE_LIMIT=10M

RUN addgroup -S app && adduser -S app -G app

COPY --from=build --chown=app:app /app/build ./build
COPY --from=build --chown=app:app /app/package.json ./
COPY --from=build --chown=app:app /app/node_modules ./node_modules

USER app
EXPOSE 3250

CMD ["node", "build"]
