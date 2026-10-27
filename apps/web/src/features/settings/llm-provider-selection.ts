import { creatorProviderCatalogById } from '@vishnucreator/protocol';

export const llmProviderOptions = Object.values(creatorProviderCatalogById.llm);

export function inferLlmProviderId(baseUrl: string, model: string): string {
  const normalizedUrl = normalizeBaseUrl(baseUrl);
  const normalizedModel = model.toLowerCase();
  // An exact preset URL wins, so local servers and routers that host other
  // vendors' models (for example deepseek on NVIDIA) map to their own preset.
  const exact = llmProviderOptions.find(provider => (
    provider.defaultBaseUrl !== undefined && normalizeBaseUrl(provider.defaultBaseUrl) === normalizedUrl
  ));
  if (exact !== undefined) return exact.id;
  if (normalizedUrl.includes('deepseek') || normalizedModel.startsWith('deepseek-')) return 'deepseek';
  if (normalizedUrl.includes('minimax') || normalizedModel.startsWith('minimax-')) return 'minimax';
  if (normalizedUrl.includes('openai.com')) return 'openai';
  return 'custom';
}

function normalizeBaseUrl(value: string): string {
  return value.trim().toLowerCase().replace(/\/+$/, '');
}
