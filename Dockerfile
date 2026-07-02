# ---- build ----
FROM node:20-alpine AS build
WORKDIR /app
ARG VITE_TMDB_KEY
ENV VITE_TMDB_KEY=$VITE_TMDB_KEY
COPY package*.json ./
RUN npm ci || npm install
COPY . .
RUN npm run build

# ---- serve ----
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
