# syntax=docker/dockerfile:1

# ---------- build: Vite production bundle ----------
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Uses client/.env.production (VITE_API_BASE_URL=/api).
RUN npm run build

# ---------- runtime: nginx serves the bundle and proxies /api ----------
FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=15s --timeout=5s --retries=5 CMD wget -qO /dev/null http://127.0.0.1/ || exit 1
