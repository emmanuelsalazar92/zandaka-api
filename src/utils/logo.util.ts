import fs from 'node:fs';
import path from 'node:path';

function getMimeType(filePath: string): string | null {
  const extension = path.extname(filePath).toLowerCase();

  switch (extension) {
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.svg':
      return 'image/svg+xml';
    case '.ico':
      return 'image/x-icon';
    default:
      return null;
  }
}

export class LogoAssetService {
  private readonly candidatePaths: string[];

  constructor() {
    this.candidatePaths = [
      process.env.ZANDAKA_LOGO_PATH ?? '',
      path.resolve(process.cwd(), 'src', 'assets', 'logo', 'zandaka-logo.png'),
      path.resolve(process.cwd(), 'src', 'assets', 'logo', 'zandaka-logo.jpg'),
      path.resolve(process.cwd(), 'src', 'assets', 'logo', 'zandaka-logo.jpeg'),
      path.resolve(process.cwd(), 'src', 'assets', 'logo', 'zandaka-logo.svg'),
      path.resolve(process.cwd(), 'src', 'assets', 'logo', 'zandaka-logo.ico'),
    ].filter(Boolean);
  }

  getLogoDataUri(): string | null {
    for (const candidatePath of this.candidatePaths) {
      try {
        if (!fs.existsSync(candidatePath)) {
          continue;
        }

        const mimeType = getMimeType(candidatePath);
        if (!mimeType) {
          continue;
        }

        const file = fs.readFileSync(candidatePath);
        return `data:${mimeType};base64,${file.toString('base64')}`;
      } catch {
        continue;
      }
    }

    return null;
  }
}
