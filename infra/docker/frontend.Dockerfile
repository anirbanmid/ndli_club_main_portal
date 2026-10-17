# Frontend image: Node build stage + nginx serving the static Vite build.
# Build context is the repository root (see infra/docker-compose.yml).
FROM node:22-alpine AS build

WORKDIR /app
COPY frontend/package.json frontend/package-lock.json /app/
RUN npm ci
COPY frontend/ /app/
RUN npm run build

FROM nginx:1.27-alpine
COPY infra/docker/frontend-nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
