FROM node:20-bookworm-slim

WORKDIR /app

COPY package*.json ./

RUN npm ci

RUN apt-get update \
    && apt-get install -y --no-install-recommends fonts-noto-core fonts-dejavu-core \
    && npx puppeteer browsers install chrome --install-deps \
    && rm -rf /var/lib/apt/lists/*

COPY . .

RUN npm run build

EXPOSE 3000

CMD ["npm", "start"]
