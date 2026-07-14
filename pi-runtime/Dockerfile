FROM node:20-bookworm-slim

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY src ./src

EXPOSE 9010
CMD ["node", "src/server.mjs"]
