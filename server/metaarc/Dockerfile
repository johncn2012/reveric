# Multi-stage Dockerfile for MetaArc BaaS Server
FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json ./
RUN npm install

COPY . .
RUN npm run build

FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080

COPY package.json ./
RUN npm install --omit=dev

COPY --from=builder /app/dist ./dist
COPY migrations ./migrations
COPY public ./public
COPY updates ./updates
COPY downloads ./downloads

EXPOSE 8080

CMD ["node", "dist/index.js"]
