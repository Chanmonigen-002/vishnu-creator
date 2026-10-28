import { z } from 'zod/v3';
import type { CreatorServicesConfigStore } from '../../creator-services/config-store.js';
import {
  creatorServiceErrorInfo,
  fetchCreatorService,
  openAiCompatibleEndpoint
} from '../../creator-services/upstream-fetch.js';
import { CreatorExecutorError } from '../executor.js';

export type BlogArticleResult = {
  title: string;
  sections: Array<{ heading: string; body: string }>;
  seo: {
    description: string;
    keywords: string[];
    chapters: Array<{ timestamp: string; label: string }>;
    hashtags: string[];
    tags: string[];
  };
};

export type BlogArticleModel = ReturnType<typeof createBlogArticleModel>;

const chapters = z.array(z.object({
  timestamp: z.string().min(1).max(16),
  label: z.string().min(1).max(120)
}).strict()).max(20).default([]);

const blogArticleSchema = z.object({
  title: z.string().min(1).max(200),
  sections: z.array(z.object({
    heading: z.string().min(1).max(160),
    body: z.string().min(1).max(8_000)
  }).strict()).min(1).max(12),
  seo: z.object({
    description: z.string().min(1).max(2_000),
    keywords: z.array(z.string().min(1).max(60)).min(1).max(12),
    chapters,
    hashtags: z.array(z.string().min(2).max(40)).max(12).default([]),
    tags: z.array(z.string().min(1).max(40)).max(20).default([])
  }).strict()
}).strict();

export function createBlogArticleModel(input: {
  configStore: Pick<CreatorServicesConfigStore, 'read'>;
  fetchImpl?: typeof fetch;
}) {
  async function complete(request: {
    prompt: string;
    signal: AbortSignal;
  }): Promise<string> {
    const config = await input.configStore.read();
    if (!config.llm.apiKey.trim() || !config.llm.model.trim()) {
      throw new CreatorExecutorError('creator_llm_config_missing', 'LLM configuration is incomplete');
    }
    const response = await fetchCreatorService({
      endpoint: openAiCompatibleEndpoint(config.llm.baseUrl, 'chat/completions'),
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.llm.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: config.llm.model,
        ...(config.llm.jsonMode ? { response_format: { type: 'json_object' } } : {}),
        messages: [{ role: 'user', content: request.prompt }]
      }),
      proxy: config.proxy,
      signal: request.signal,
      maxResponseBytes: 4 * 1024 * 1024,
      fetchImpl: input.fetchImpl
    });
    if (!response.ok) {
      const failure = await creatorServiceErrorInfo(response, 'Blog writing', 'llm');
      throw new CreatorExecutorError(
        'creator_llm_upstream_error',
        failure.message,
        {},
        failure.publicFacts
      );
    }
    const payload = await response.json() as {
      choices?: Array<{ message?: { content?: string | Array<{ text?: string }> } }>;
    };
    const raw = payload.choices?.[0]?.message?.content;
    const content = typeof raw === 'string'
      ? raw
      : Array.isArray(raw)
        ? raw.map(item => item.text ?? '').join('')
        : '';
    if (!content.trim()) {
      throw new CreatorExecutorError('creator_llm_empty_response', 'Blog writing returned no content');
    }
    return content.trim();
  }

  return {
    async generateArticle(request: {
      sourceTitle: string;
      transcript: string;
      languageInstructions: string;
      extraRequirements: string;
      keyframeHints: Array<{ timestamp: string; srtMs: string }>;
      signal: AbortSignal;
    }): Promise<BlogArticleResult> {
      const content = await complete({
        signal: request.signal,
        prompt: [
          'You are an experienced blog editor writing a publish-ready article with an SEO kit from a video transcript.',
          'Facts must come from the transcript; never invent numbers, names or claims the transcript does not support.',
          request.languageInstructions,
          `Source video title (for context only, rewrite it): ${request.sourceTitle || '(none)'}`,
          'Return only strict JSON with this exact shape:',
          '{"title":"article title","sections":[{"heading":"H2 heading","body":"paragraph text"}],"seo":{"description":"meta description (120-300 chars)","keywords":["keyword","..."],"chapters":[{"timestamp":"m:ss","label":"chapter label"}],"hashtags":["#tag","#tag"],"tags":["tag","..."]}}',
          'Rules:',
          '- 4 to 8 sections, each a single cohesive paragraph.',
          '- description: plain text, no markdown, no hashtags.',
          '- chapters: reuse the provided keyframe timestamps where relevant.',
          '- keywords/hashtags/tags: search-phrasing people actually use for this topic.',
          request.extraRequirements.trim() ? `Additional requirements: ${request.extraRequirements}` : '',
          request.keyframeHints.length > 0
            ? `Keyframe timestamps (place chapters here when the content matches): ${request.keyframeHints.map(hint => `${hint.timestamp} (${hint.srtMs})`).join(', ')}`
            : '',
          `Transcript:\n${request.transcript}`
        ].filter(Boolean).join('\n\n')
      });
      return blogArticleSchema.parse(parseJson(content));
    }
  };
}

function parseJson(value: string): unknown {
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(value.trim());
  return JSON.parse(fenced?.[1] ?? value);
}
