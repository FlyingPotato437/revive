FROM node:22-alpine
WORKDIR /app
COPY scripts/worker.mjs ./scripts/worker.mjs
USER node
CMD ["node", "scripts/worker.mjs"]
