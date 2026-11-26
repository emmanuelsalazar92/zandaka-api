FROM node:26.13.1-bookworm-slim AS build

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN PUPPETEER_SKIP_DOWNLOAD=true npm ci

COPY . .
RUN npm run build \
    && node -e "const Database = require('better-sqlite3'); const db = new Database(':memory:'); db.prepare('SELECT 1').get(); db.close()"

FROM node:26.13.1-bookworm-slim

WORKDIR /app

COPY --from=build /app/package*.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/src/assets ./src/assets

RUN apt-get update \
    && apt-get install -y --no-install-recommends fonts-noto-core fonts-dejavu-core \
    && npx puppeteer browsers install chrome --install-deps \
    && rm -rf /var/lib/apt/lists/*

# Fail the build if Chromium cannot render through the production PDF path.
RUN node -e "const { PdfRenderer } = require('./dist/utils/pdf.util'); new PdfRenderer().renderHtmlToPdf('<p>Prueba de informe: &#8353;125</p>', 'Zandaka').then(pdf => { if (pdf.subarray(0, 5).toString() !== '%PDF-') throw new Error('Invalid PDF'); }).catch(error => { console.error(error); process.exitCode = 1; });"

EXPOSE 3000

CMD ["npm", "start"]
