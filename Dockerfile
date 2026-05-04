FROM node:18-alpine AS web-build
WORKDIR /src
COPY app/package.json app/package-lock.json* ./app/
RUN cd app && npm ci --no-audit --no-fund
COPY app ./app
RUN cd app && npm run build

FROM node:18-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev --no-audit --no-fund --ignore-scripts
COPY index.js ./
COPY api ./api
COPY --from=web-build /src/app/build ./app/build
EXPOSE 8080
CMD ["node", "index.js"]
