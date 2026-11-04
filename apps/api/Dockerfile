FROM oven/bun:1-slim

WORKDIR /app

COPY apps/api/package.json apps/api/bun.lock ./
RUN bun install --frozen-lockfile

COPY apps/api/ ./

# Generate the Prisma client (schema is copied above; generate does not
# need a live DB) so `db:seed` and runtime imports work in the image.
RUN bunx prisma generate

EXPOSE 3000

CMD ["bun", "run", "start"]
