FROM node:22.23.0-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY src/env.js ./src/env.js
COPY fixture ./fixture
USER node
EXPOSE 4101
CMD ["node","fixture/origin.js"]
