import { readFile } from 'node:fs/promises';

export type EnvKey = 'VLLM_API_KEY' | 'TEI_EMBEDDINGS_URL' | 'TEI_RERANK_URL' | 'QDRANT_URL';

export type EvalEnv = Partial<Record<EnvKey, string>>;

const KEYS: readonly EnvKey[] = [
  'VLLM_API_KEY',
  'TEI_EMBEDDINGS_URL',
  'TEI_RERANK_URL',
  'QDRANT_URL',
];
const KEY_SET = new Set<string>(KEYS);

const isEnvKey = (key: string): key is EnvKey => KEY_SET.has(key);

/** Parses only the keys the eval needs from dotenv text; values are never logged. */
export function parseDotenv(text: string): EvalEnv {
  const env: EvalEnv = {};
  for (const line of text.split('\n')) {
    const match = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!match || !isEnvKey(match[1])) {
      continue;
    }
    const value = match[2].replace(/^(['"])(.*)\1$/, '$2');
    if (value) {
      env[match[1]] = value;
    }
  }
  return env;
}

/** Process environment wins over the dotenv file, so a run can override one value. */
export async function loadEnv(path: string | undefined): Promise<EvalEnv> {
  const fromFile = path ? parseDotenv(await readFile(path, 'utf8').catch(() => '')) : {};
  const env: EvalEnv = { ...fromFile };
  for (const key of KEYS) {
    const value = process.env[key];
    if (value) {
      env[key] = value;
    }
  }
  return env;
}
