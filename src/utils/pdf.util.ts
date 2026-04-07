import puppeteer from 'puppeteer';

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
      await page.setContent(html, { waitUntil: 'networkidle0' });
      await page.emulateMediaType('print');

      const pdf = await page.pdf({
        format: 'A4',
        printBackground: true,
        displayHeaderFooter: true,
        headerTemplate: '<div></div>',
        footerTemplate: `
          <div style="width: 100%; padding: 0 24px; font-size: 9px; color: #6b7280; font-family: 'Noto Sans', Arial, sans-serif; display: flex; justify-content: space-between; align-items: center;">
            <span>${footerLabel}</span>
            <span>Page <span class="pageNumber"></span> / <span class="totalPages"></span></span>
          </div>
        `,
        margin: {
          top: '18mm',
          right: '14mm',
          bottom: '18mm',
          left: '14mm',
        },
      });

      return Buffer.from(pdf);
    } finally {
      await browser.close();
    }
  }
}
