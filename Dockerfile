FROM node:22.23.0-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npx playwright install --with-deps chromium && chmod -R a+rX /root/.cache/ms-playwright && mv /root/.cache/ms-playwright /ms-playwright
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
COPY src ./src
COPY public ./public
COPY config ./config
RUN mkdir var && chown node:node var
USER node
EXPOSE 4100
CMD ["node","src/server.js"]
