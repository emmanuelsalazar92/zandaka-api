import { buildProjectPdfHtml } from '../templates/project-pdf.template';
import { LogoAssetService } from '../utils/logo.util';
import { PdfRenderer } from '../utils/pdf.util';
import type { ProjectPdfSnapshot } from './project.service';

const timeoutMs = 20_000;

export class ProjectPdfService {
  private readonly renderer = new PdfRenderer();
  private readonly logo = new LogoAssetService();

  async generate(data: ProjectPdfSnapshot, client: AbortSignal) {
    const signal = AbortSignal.any([client, AbortSignal.timeout(timeoutMs)]);
    const timeoutError = { code: 'PDF_TIMEOUT', message: 'The project PDF did not finish in time' };
    if (signal.aborted) throw timeoutError;
    let onAbort: (() => void) | undefined;
    const canceled = new Promise<never>((_resolve, reject) => {
      onAbort = () => reject(timeoutError);
      signal.addEventListener('abort', onAbort, { once: true });
    });
    try {
      const html = buildProjectPdfHtml(data, this.logo.getLogoDataUri());
      const pdf = await Promise.race([
        this.renderer.renderHtmlToPdf(html, 'Zandaka · Informe de proyecto', { signal, timeoutMs }),
        canceled,
      ]);
      const slug = data.project.title
        .normalize('NFKD')
        .replace(/\p{M}/gu, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .slice(0, 56)
        .replace(/^-+|-+$/g, '');
      const fileName =
        ['zandaka-proyecto', slug, data.project.id.slice(0, 8)].filter(Boolean).join('-') + '.pdf';
      return { fileName, pdf };
    } finally {
      if (onAbort) signal.removeEventListener('abort', onAbort);
    }
  }
}
