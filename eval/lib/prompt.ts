import { load } from 'js-yaml';
import { readFile } from 'node:fs/promises';
import { replaceSpecialVars } from 'librechat-data-provider';
import type { GenerationParams } from './types.ts';
import { librechatApi } from './runtime.ts';

interface PresetConfig {
  endpoint?: string;
  model?: string;
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  promptPrefix?: string;
}

interface ModelSpecConfig {
  name?: string;
  default?: boolean;
  preset?: PresetConfig;
}

interface AddParams {
  top_k?: number;
  chat_template_kwargs?: { enable_thinking?: boolean };
}

interface CustomEndpointConfig {
  name?: string;
  baseURL?: string;
  addParams?: AddParams;
}

interface LibreChatConfig {
  modelSpecs?: { list?: ModelSpecConfig[] };
  endpoints?: { custom?: CustomEndpointConfig[] };
}

export interface ProductionConfig {
  promptPrefix: string;
  params: GenerationParams;
}

const TIMEZONE = 'America/New_York';

function requireValue<T>(value: T | undefined, name: string): T {
  if (value === undefined || value === null) {
    throw new Error(`librechat.yaml is missing ${name}`);
  }
  return value;
}

/**
 * Reads the default model spec and its custom endpoint from librechat.yaml, so the
 * eval always sends the same system prompt and sampling parameters as production.
 */
export function parseProductionConfig(text: string): ProductionConfig {
  const config = load(text) as LibreChatConfig;
  const specs = config.modelSpecs?.list ?? [];
  const spec = specs.find((candidate) => candidate.default) ?? specs[0];
  const preset = requireValue(spec?.preset, 'a default modelSpecs preset');
  const endpoint = requireValue(
    config.endpoints?.custom?.find((candidate) => candidate.name === preset.endpoint),
    `custom endpoint "${preset.endpoint}"`,
  );
  const addParams = endpoint.addParams ?? {};
  return {
    promptPrefix: requireValue(preset.promptPrefix, 'preset.promptPrefix'),
    params: {
      model: requireValue(preset.model, 'preset.model'),
      baseUrl: requireValue(endpoint.baseURL, 'endpoint baseURL'),
      temperature: requireValue(preset.temperature, 'preset.temperature'),
      top_p: requireValue(preset.top_p, 'preset.top_p'),
      top_k: requireValue(addParams.top_k, 'addParams.top_k'),
      max_tokens: requireValue(preset.max_tokens, 'preset.max_tokens'),
      chat_template_kwargs: {
        enable_thinking: addParams.chat_template_kwargs?.enable_thinking ?? true,
      },
    },
  };
}

export async function loadProductionConfig(path: string): Promise<ProductionConfig> {
  return parseProductionConfig(await readFile(path, 'utf8'));
}

/**
 * Production system message: the preset up to its first date variable (the stable,
 * cacheable prefix), then the date tail (`splitTemporalInstructions` in
 * `initializeAgent`), then the per-message KB block `AgentClient.buildMessages`
 * appends. MCP server instructions and the directory block are not reproduced.
 */
export function buildSystemPrompt(
  promptPrefix: string,
  context: string | undefined,
  now: Date,
): string {
  const { stable, dynamic } = librechatApi.splitTemporalInstructions(promptPrefix);
  const resolved = [stable, dynamic]
    .filter((part) => part !== '')
    .map((text) => replaceSpecialVars({ text, now, timezone: TIMEZONE }));
  return [...resolved, context ?? ''].filter((part) => part !== '').join('\n\n');
}
