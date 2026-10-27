# Single-origin image (D-02): Express serves the API and the built React app.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci
COPY client client
RUN npm run build

FROM node:22-alpine
ENV NODE_ENV=production CLIENT_DIST=/app/client/dist PORT=5000
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci --omit=dev -w server && npm cache clean --force
COPY server server
COPY --from=build /app/client/dist client/dist
USER node
EXPOSE 5000
WORKDIR /app/server
CMD ["node", "src/server.js"]
