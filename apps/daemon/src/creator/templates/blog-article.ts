import { z } from 'zod/v3';
import type { CreatorTemplateDefinition } from './types.js';

const record = z.record(z.string(), z.unknown()) as never;

export function createBlogArticleTemplate(): CreatorTemplateDefinition {
  return {
    id: 'blog-article',
    version: 1,
    renderer: 'blog-article',
    inputSchema: z.object({
      sourceTitle: z.string().max(200).default(''),
      targetLanguage: z.string().min(2).default('km'),
      keyframeCount: z.number().int().min(0).max(10).default(4),
      extraRequirements: z.string().max(6_000).default(''),
      currentStage: z.string().nullable().default(null)
    }).passthrough() as never,
    stages: [{
      id: 'generate',
      executor: 'blog-article',
      allowedJobStatuses: ['draft', 'running', 'completed', 'failed', 'needs_input'],
      inputArtifacts: [
        { kind: 'target_subtitle', selector: 'latest-completed' },
        { kind: 'source_video', selector: 'latest-completed', optional: true }
      ],
      outputArtifacts: [
        { kind: 'article_document', status: 'completed' },
        { kind: 'seo_kit', status: 'completed' },
        { kind: 'article_keyframe', status: 'completed' }
      ]
    }],
    actions: [
      { id: 'update-settings', inputSchema: record, allowedStages: ['generate'] },
      { id: 'run-stage', inputSchema: record, allowedStages: ['generate'] },
      { id: 'undo-action', inputSchema: record, allowedStages: ['generate'] }
    ],
    outputs: [
      { kind: 'article_document', required: true },
      { kind: 'seo_kit', required: true }
    ],
    agentGuidance: [
      '从已有字幕(transcript)生成博客文章与SEO工具包。',
      'target_subtitle 为必需输入；提供 source_video 可额外抽取关键帧图片。',
      '更新设置必须写入 input.patch：sourceTitle、targetLanguage、keyframeCount、extraRequirements。',
      '确认字幕已就绪后运行 generate 阶段；写作模型失败时会用确定性回退并明确标注 generatedBy。'
    ].join(' ')
  };
}
