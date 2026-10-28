import { describe, expect, it } from 'vitest';
import { inferLlmProviderId } from './llm-provider-selection.js';

describe('inferLlmProviderId', () => {
  it('matches every preset by its exact base URL, ignoring case and trailing slashes', () => {
    expect(inferLlmProviderId('https://api.groq.com/openai/v1/', 'x')).toBe('groq');
    expect(inferLlmProviderId('https://generativelanguage.googleapis.com/v1beta/openai', 'x')).toBe('gemini');
    expect(inferLlmProviderId('HTTP://LOCALHOST:11434/v1', 'llama3.2')).toBe('ollama');
    expect(inferLlmProviderId('http://127.0.0.1:9931/v1', 'x')).toBe('llamacpp');
  });

  it('prefers the preset URL over a vendor prefix in the model name', () => {
    expect(inferLlmProviderId('https://integrate.api.nvidia.com/v1', 'deepseek-ai/deepseek-v4-flash')).toBe('nvidia');
  });

  it('keeps the previous fallbacks for unknown endpoints', () => {
    expect(inferLlmProviderId('https://proxy.example/v1', 'deepseek-v4-pro')).toBe('deepseek');
    expect(inferLlmProviderId('https://eu.api.openai.com/v1', 'gpt')).toBe('openai');
    expect(inferLlmProviderId('https://proxy.example/v1', 'gpt')).toBe('custom');
  });
});
