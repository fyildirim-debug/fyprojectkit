# MCP sunucusu: derle, üretim bağımlılıklarıyla çalıştır.
FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY web/package.json web/
COPY mcp/package.json mcp/
RUN npm ci

COPY shared/ shared/
COPY mcp/ mcp/
RUN npm run build -w shared && npm run build -w mcp

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY mcp/package.json mcp/
RUN npm ci --omit=dev --workspace @takip/mcp --include-workspace-root

COPY --from=build /app/shared/dist shared/dist
COPY --from=build /app/mcp/dist mcp/dist

EXPOSE 8787
CMD ["node", "mcp/dist/index.js"]
