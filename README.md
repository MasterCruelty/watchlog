# Episodio V7 — TV Time clone

TV show & movie tracker. Shows via TVMaze, movies via TMDB.

## Run locally (working preview)
```bash
npm install
npm run dev
```
Open the printed URL (also from your phone on the same network: `host: true` is enabled).

## Data
- Shows (search + episodes): https://api.tvmaze.com (free, no key)
- Movies (search): TMDB, free key required (see below)
- Library & watched state: browser/WebView localStorage

## TMDB setup (movies)
1. Free account at https://www.themoviedb.org
2. Generate an API key (v3): https://www.themoviedb.org/settings/api
3. `cp .env.example .env` and paste your key
4. Rebuild: `docker compose up -d --build` (compose passes it to the Vite build)

## Docker
```bash
docker compose up -d --build
```
App at http://localhost:8080 (or http://PI-IP:8080 from your phone).
Pi note: nginx:alpine and node:20-alpine both support arm64/armv7.

## Next step: APK with Capacitor
```bash
npm install @capacitor/core @capacitor/cli @capacitor/android
npx cap init episodio com.mastercruelty.episodio --web-dir=dist
npm run build
npx cap add android
npx cap sync
npx cap open android   # build the APK from Android Studio
```
