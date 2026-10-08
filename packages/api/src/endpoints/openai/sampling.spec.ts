import { Providers, getChatModelClass } from '@librechat/agents';
import { getOpenAIConfig } from './config';

/** The preset and endpoint parameters SwatGPT's librechat.yaml sends to vLLM. */
const modelOptions = {
  model: 'Qwen/Qwen3.6-35B-A3B-FP8',
  temperature: 0.3,
  top_p: 0.8,
  max_tokens: 1536,
};
const addParams = {
  streamUsage: true,
  top_k: 20,
  chat_template_kwargs: { enable_thinking: false },
};

type RequestParams = Record<string, unknown>;
type CompletionsClient = { invocationParams: (options: object) => RequestParams };

function requestParams(): RequestParams {
  const { llmConfig, configOptions } = getOpenAIConfig(
    'test-key',
    { modelOptions, addParams, reverseProxyUrl: 'http://vllm.test/v1' },
    'SwatGPT',
  );
  const ChatModel = getChatModelClass(Providers.OPENAI);
  const model = new ChatModel({ ...llmConfig, configuration: configOptions }) as unknown as {
    completions: CompletionsClient;
  };
  return model.completions.invocationParams({});
}

describe('custom endpoint sampling parameters', () => {
  it('maps preset max_tokens and top_p onto the fields LangChain reads', () => {
    const { llmConfig } = getOpenAIConfig('test-key', { modelOptions, addParams }, 'SwatGPT');
    expect(llmConfig.maxTokens).toBe(1536);
    expect(llmConfig.topP).toBe(0.8);
    expect(llmConfig).not.toHaveProperty('top_p');
    expect(llmConfig).not.toHaveProperty('max_tokens');
  });

  it('sends max_tokens, top_p and the addParams in the chat completion request', () => {
    expect(requestParams()).toMatchObject({
      model: 'Qwen/Qwen3.6-35B-A3B-FP8',
      temperature: 0.3,
      top_p: 0.8,
      max_tokens: 1536,
      top_k: 20,
      chat_template_kwargs: { enable_thinking: false },
    });
  });

  it('still drops top_p when dropParams names it in request form', () => {
    const { llmConfig } = getOpenAIConfig(
      'test-key',
      { modelOptions, addParams, dropParams: ['top_p'] },
      'SwatGPT',
    );
    expect(llmConfig.topP).toBeUndefined();
    expect(llmConfig).not.toHaveProperty('top_p');
    expect(llmConfig.maxTokens).toBe(1536);
  });
});
