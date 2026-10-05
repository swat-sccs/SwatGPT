import express from 'express';
import request from 'supertest';
import { logger } from '@librechat/data-schemas';
import { FileSources } from 'librechat-data-provider';
import {
  buildImageCsp,
  parseImageSourceList,
  resolveImageSources,
  createImageCspMiddleware,
} from './csp';

type CspConfig = Parameters<typeof resolveImageSources>[0];

const local: CspConfig = { fileStrategy: FileSources.local };

function imageSources(header: string): string[] {
  const directive = header.split(';').find((part) => part.trim().startsWith('img-src'));
  return directive ? directive.trim().split(/\s+/).slice(1) : [];
}

describe('image Content-Security-Policy', () => {
  let warn: jest.SpyInstance;

  beforeEach(() => {
    warn = jest.spyOn(logger, 'warn');
  });

  afterEach(() => {
    warn.mockRestore();
  });

  it('limits local storage deployments to same-origin, data and blob images', () => {
    expect(buildImageCsp(local)).toBe("img-src 'self' data: blob:");
    expect(warn).not.toHaveBeenCalled();
  });

  it('sets only the img-src directive on every response', async () => {
    const app = express();
    app.use(createImageCspMiddleware(local));
    app.get('/', (_req, res) => {
      res.send('<!doctype html>');
    });
    app.get('/api/thing', (_req, res) => {
      res.json({ ok: true });
    });

    const page = await request(app).get('/');
    const api = await request(app).get('/api/thing');

    expect(page.headers['content-security-policy']).toBe("img-src 'self' data: blob:");
    expect(api.headers['content-security-policy']).toBe("img-src 'self' data: blob:");
  });

  it('blocks the markdown-image exfiltration origin', () => {
    const sources = imageSources(buildImageCsp(local, { CSP_IMG_SRC: 'https://cdn.example.org' }));
    expect(sources).not.toContain('*');
    expect(sources).not.toContain('https:');
    expect(sources).not.toContain('https://evil.example');
  });

  it('adds operator-supplied origins, reduced to their origin', () => {
    expect(
      resolveImageSources(local, {
        CSP_IMG_SRC: 'https://cdn.example.org/images/a.png, https://x.example.com:8443',
      }),
    ).toEqual([
      "'self'",
      'data:',
      'blob:',
      'https://cdn.example.org',
      'https://x.example.com:8443',
    ]);
  });

  it('drops wildcards, bare schemes and non-http entries from CSP_IMG_SRC', () => {
    expect(
      parseImageSourceList("* https: 'unsafe-inline' javascript:alert(1) ftp://x.org"),
    ).toEqual([]);
    expect(warn).toHaveBeenCalledTimes(5);
  });

  it('allows absolute login button icons and ignores relative ones', () => {
    const sources = resolveImageSources(local, {
      OPENID_IMAGE_URL: 'https://idp.example.edu/static/logo.svg',
      SAML_IMAGE_URL: '/assets/saml.png',
    });
    expect(sources).toEqual(["'self'", 'data:', 'blob:', 'https://idp.example.edu']);
    expect(warn).not.toHaveBeenCalled();
  });

  it('allows absolute model spec, custom endpoint and MCP icons from the config', () => {
    const preset = { endpoint: 'SwatGPT' };
    const config: CspConfig = {
      ...local,
      modelSpecs: {
        list: [
          { name: 'a', label: 'A', preset, iconURL: 'https://icons.example.edu/a.png' },
          { name: 'b', label: 'B', preset, iconURL: '/assets/sccs.png' },
        ],
      },
      endpoints: {
        custom: [
          {
            name: 'c',
            apiKey: 'k',
            baseURL: 'http://llm.example.edu/v1',
            models: { default: ['m'] },
            iconURL: 'https://cdn.example.net/c.svg',
          },
        ],
      },
      mcpConfig: {
        dash: {
          type: 'streamable-http',
          url: 'http://mcp:3000/mcp',
          iconPath: 'https://mcp.example.org/i.png',
        },
      },
    };
    expect(resolveImageSources(config)).toEqual([
      "'self'",
      'data:',
      'blob:',
      'https://icons.example.edu',
      'https://cdn.example.net',
      'https://mcp.example.org',
    ]);
  });

  it('allows the Firebase storage origin when Firebase serves files', () => {
    expect(
      resolveImageSources({
        fileStrategy: FileSources.local,
        fileStrategies: { avatar: FileSources.firebase },
      }),
    ).toContain('https://firebasestorage.googleapis.com');
  });

  it('allows the configured CloudFront domain', () => {
    const config = {
      fileStrategy: FileSources.cloudfront,
      cloudfront: { domain: 'https://d111.cloudfront.net/' },
    } as CspConfig;
    expect(resolveImageSources(config)).toContain('https://d111.cloudfront.net');
  });

  it('warns when an S3 or Azure strategy has no CSP_IMG_SRC origin', () => {
    resolveImageSources({ fileStrategy: FileSources.s3 });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('CSP_IMG_SRC'));

    warn.mockClear();
    resolveImageSources(
      { fileStrategy: FileSources.s3 },
      { CSP_IMG_SRC: 'https://bucket.s3.amazonaws.com' },
    );
    expect(warn).not.toHaveBeenCalled();
  });
});
