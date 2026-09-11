# Arayüz: derle, nginx ile statik servis et.
#
# VITE_* değişkenleri build anında gömülür — çalışma anında verilmesi işe yaramaz.
# Bu yüzden build argümanı olarak alınır; Dokploy'da compose'un build.args'ı besler.
FROM node:22-alpine AS build
WORKDIR /app

ARG VITE_APPWRITE_ENDPOINT=""
ARG VITE_APPWRITE_PROJECT_ID=""
ARG VITE_APPWRITE_DATABASE_ID="takip"
ARG VITE_MCP_BASE_URL=""

ENV VITE_APPWRITE_ENDPOINT=$VITE_APPWRITE_ENDPOINT \
    VITE_APPWRITE_PROJECT_ID=$VITE_APPWRITE_PROJECT_ID \
    VITE_APPWRITE_DATABASE_ID=$VITE_APPWRITE_DATABASE_ID \
    VITE_MCP_BASE_URL=$VITE_MCP_BASE_URL

# Workspace çözümlemesi için üç paketin de manifesti gerekli.
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY web/package.json web/
COPY mcp/package.json mcp/
RUN npm ci

COPY shared/ shared/
COPY web/ web/
RUN npm run build -w shared && npm run build -w web

FROM nginx:1.27-alpine
COPY --from=build /app/web/dist /usr/share/nginx/html
COPY web/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
