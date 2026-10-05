import { logger } from '@librechat/data-schemas';
import { FileSources } from 'librechat-data-provider';
import type { NextFunction, Request, Response } from 'express';
import type { AppConfig } from '@librechat/data-schemas';

type ImageCspConfig = Pick<AppConfig, 'fileStrategy' | 'fileStrategies' | 'cloudfront'> &
  Partial<Pick<AppConfig, 'modelSpecs' | 'mcpConfig' | 'endpoints'>>;

/** Environment variables that name image origins the browser must be allowed to load. */
export type ImageCspEnv = Partial<
  Record<'CSP_IMG_SRC' | 'OPENID_IMAGE_URL' | 'SAML_IMAGE_URL', string>
>;

const BASE_IMAGE_SOURCES = ["'self'", 'data:', 'blob:'] as const;
const FIREBASE_STORAGE_ORIGIN = 'https://firebasestorage.googleapis.com';
const UNDERIVABLE_STRATEGIES: ReadonlySet<string> = new Set([
  FileSources.s3,
  FileSources.azure_blob,
]);

function toOrigin(value: string): string | undefined {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      return undefined;
    }
    return url.origin;
  } catch {
    return undefined;
  }
}

function configuredStrategies(config: ImageCspConfig): Set<string> {
  const strategies = new Set<string>([config.fileStrategy]);
  for (const strategy of Object.values(config.fileStrategies ?? {})) {
    if (strategy) {
      strategies.add(strategy);
    }
  }
  return strategies;
}

/** Absolute icon URLs the admin configured for model specs, custom endpoints and MCP servers. */
function configuredIconUrls(config: ImageCspConfig): Array<string | undefined> {
  return [
    ...(config.modelSpecs?.list ?? []).map((spec) => spec.iconURL),
    ...(config.endpoints?.custom ?? []).map((endpoint) => endpoint.iconURL),
    ...Object.values(config.mcpConfig ?? {}).map((server) => server?.iconPath),
  ];
}

/**
 * Parses `CSP_IMG_SRC`: whitespace- or comma-separated http(s) URLs, each reduced to its origin.
 * Wildcards, schemes and anything else that would reopen arbitrary image loads are dropped.
 */
export function parseImageSourceList(raw: string | undefined): string[] {
  if (!raw) {
    return [];
  }
  const origins: string[] = [];
  for (const entry of raw.split(/[\s,]+/)) {
    if (!entry) {
      continue;
    }
    const origin = toOrigin(entry);
    if (!origin) {
      logger.warn(
        `[csp] Ignoring invalid CSP_IMG_SRC entry "${entry}"; expected an http(s) origin`,
      );
      continue;
    }
    origins.push(origin);
  }
  return origins;
}

/** Image origins implied by file storage, configured icons, login button icons and `CSP_IMG_SRC`. */
export function resolveImageSources(config: ImageCspConfig, env: ImageCspEnv = {}): string[] {
  const strategies = configuredStrategies(config);
  const sources = new Set<string>(BASE_IMAGE_SOURCES);

  const icons = [...configuredIconUrls(config), env.OPENID_IMAGE_URL, env.SAML_IMAGE_URL];
  for (const icon of icons) {
    const origin = icon ? toOrigin(icon) : undefined;
    if (origin) {
      sources.add(origin);
    }
  }

  if (strategies.has(FileSources.firebase)) {
    sources.add(FIREBASE_STORAGE_ORIGIN);
  }
  const cloudfrontOrigin = config.cloudfront?.domain
    ? toOrigin(config.cloudfront.domain)
    : undefined;
  if (strategies.has(FileSources.cloudfront) && cloudfrontOrigin) {
    sources.add(cloudfrontOrigin);
  }

  const extraOrigins = parseImageSourceList(env.CSP_IMG_SRC);
  for (const origin of extraOrigins) {
    sources.add(origin);
  }

  const underivable = [...strategies].filter((strategy) => UNDERIVABLE_STRATEGIES.has(strategy));
  if (underivable.length > 0 && extraOrigins.length === 0) {
    logger.warn(
      `[csp] File strategy ${underivable.join(', ')} serves images from an external origin; ` +
        'add it to CSP_IMG_SRC or those images will be blocked by img-src',
    );
  }

  return [...sources];
}

export function buildImageCsp(config: ImageCspConfig, env?: ImageCspEnv): string {
  return `img-src ${resolveImageSources(config, env).join(' ')}`;
}

/**
 * Restricts where the browser may load images from, so model-written markdown images
 * cannot beacon conversation contents to third-party hosts. Only `img-src` is set; other
 * fetch directives stay unrestricted to avoid breaking the app.
 */
export function createImageCspMiddleware(config: ImageCspConfig, env?: ImageCspEnv) {
  const policy = buildImageCsp(config, env);
  logger.info(`[csp] Content-Security-Policy: ${policy}`);
  return (_req: Request, res: Response, next: NextFunction): void => {
    res.setHeader('Content-Security-Policy', policy);
    next();
  };
}
