import puppeteer from 'puppeteer';
import { escapeHtml } from './html.util';

export class PdfRenderer {
  private static rendering = false;

  async renderHtmlToPdf(
    html: string,
    footerLabel: string,
    options?: { signal: AbortSignal; timeoutMs: number },
  ): Promise<Buffer> {
    options?.signal.throwIfAborted();
    if (PdfRenderer.rendering) throw { code: 'PDF_BUSY', message: 'A PDF is already rendering' };
    PdfRenderer.rendering = true;
    try {
      return await this.render(html, footerLabel, options);
    } finally {
      PdfRenderer.rendering = false;
    }
  }

  private async render(
    html: string,
    footerLabel: string,
    options?: { signal: AbortSignal; timeoutMs: number },
  ): Promise<Buffer> {
    const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;

    // These flags keep Chromium usable in common CI/Docker environments where the sandbox
    // is not available by default.
    const browser = await puppeteer.launch({
      headless: true,
      ...(executablePath ? { executablePath } : {}),
      ...(options && {
        signal: options.signal,
        timeout: options.timeoutMs,
        protocolTimeout: options.timeoutMs,
      }),
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });

    try {
      const page = await browser.newPage();
      await page.setJavaScriptEnabled(false);
      await page.setRequestInterception(true);
      page.on('request', (request) => {
        // Reports are self-contained. Rendering must not fetch internal services or remote assets.
        const local = request.url().startsWith('data:') || request.url() === 'about:blank';
        const resolved = local ? request.continue() : request.abort('blockedbyclient');
        // Cancellation may close Chromium while the interception is being resolved.
        void resolved.catch(() => undefined);
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
            <span>${escapeHtml(footerLabel)}</span>
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
