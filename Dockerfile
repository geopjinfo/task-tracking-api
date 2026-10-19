FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json tsconfig*.json ./
RUN npm ci --fetch-retries=5 --fetch-retry-mintimeout=2000 --fetch-retry-maxtimeout=20000
COPY src ./src
RUN npm run build
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev --fetch-retries=5 --fetch-retry-mintimeout=2000 --fetch-retry-maxtimeout=20000
COPY --from=build /app/dist ./dist
USER node
CMD ["node","dist/main.js"]
