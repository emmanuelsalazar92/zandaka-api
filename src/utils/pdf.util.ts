import puppeteer from 'puppeteer';

const escapeFooter = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ??
      character,
  );

export class PdfRenderer {
  async renderHtmlToPdf(html: string, footerLabel: string): Promise<Buffer> {
    const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;

    // These flags keep Chromium usable in common CI/Docker environments where the sandbox
    // is not available by default.
    const browser = await puppeteer.launch({
      headless: true,
      ...(executablePath ? { executablePath } : {}),
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });

    try {
      const page = await browser.newPage();
      await page.setJavaScriptEnabled(false);
      await page.setRequestInterception(true);
      page.on('request', (request) => {
        // Reports are self-contained. Rendering must not fetch internal services or remote assets.
        if (request.url().startsWith('data:') || request.url() === 'about:blank') {
          void request.continue();
        } else {
          void request.abort('blockedbyclient');
        }
      });
      await page.setContent(html, { waitUntil: 'load', timeout: 15000 });
      await page.emulateMediaType('print');
      await page.evaluate('document.fonts.ready');

      const pdf = await page.pdf({
        format: 'Letter',
        preferCSSPageSize: true,
        timeout: 15000,
        printBackground: true,
        displayHeaderFooter: true,
        headerTemplate: '<div></div>',
        footerTemplate: `
          <div style="width: 100%; padding: 0 24px; font-size: 9px; color: #6b7280; font-family: 'Noto Sans', Arial, sans-serif; display: flex; justify-content: space-between; align-items: center;">
            <span>${escapeFooter(footerLabel)}</span>
            <span>Página <span class="pageNumber"></span> / <span class="totalPages"></span></span>
          </div>
        `,
        margin: {
          top: '14mm',
          right: '13mm',
          bottom: '18mm',
          left: '13mm',
        },
      });

      return Buffer.from(pdf);
    } finally {
      await browser.close();
    }
  }
}
