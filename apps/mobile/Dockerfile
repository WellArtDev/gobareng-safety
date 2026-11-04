FROM node:22-alpine

COPY --from=oven/bun:1-alpine /usr/local/bin/bun /usr/local/bin/bun

WORKDIR /app

COPY apps/mobile/package.json apps/mobile/package-lock.json ./
RUN npm ci

COPY apps/mobile/ ./

EXPOSE 8081 19000 19001 19002

CMD ["npx", "expo", "start", "--lan", "--port", "8081"]
