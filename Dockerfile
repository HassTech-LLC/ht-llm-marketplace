FROM node:24-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/sdk/package.json packages/sdk/package.json
COPY packages/react/package.json packages/react/package.json
COPY packages/web-component/package.json packages/web-component/package.json
COPY packages/daemon/package.json packages/daemon/package.json
COPY packages/cli/package.json packages/cli/package.json
COPY apps/studio/package.json apps/studio/package.json
RUN npm ci --ignore-scripts

FROM deps AS build
COPY . .
RUN npm run build

FROM node:24-bookworm-slim
ENV NODE_ENV=production
ENV HT_MARKETPLACE_HOST=0.0.0.0
ENV HT_MARKETPLACE_PORT=3001
WORKDIR /app
COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/packages ./packages
COPY --from=build /app/apps ./apps
RUN npm ci --omit=dev --ignore-scripts
EXPOSE 3001
CMD ["node", "packages/daemon/dist/index.js"]
