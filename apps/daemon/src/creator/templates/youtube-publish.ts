import { z } from 'zod/v3';
import type { CreatorTemplateDefinition } from './types.js';

const record = z.record(z.string(), z.unknown()) as never;

export function createYoutubePublishTemplate(): CreatorTemplateDefinition {
  return {
    id: 'youtube-publish',
    version: 1,
    renderer: 'youtube-publish',
    inputSchema: z.object({
      sourceTitle: z.string().max(200).default(''),
      titleKm: z.string().max(100).default(''),
      titleEn: z.string().max(100).default(''),
      privacyStatus: z.enum(['private', 'unlisted', 'public']).default('private'),
      categoryId: z.string().max(16).default('22'),
      uploadToYoutube: z.boolean().default(false),
      extraTags: z.array(z.string()).default([]),
      currentStage: z.string().nullable().default(null)
    }).passthrough() as never,
    stages: [{
      id: 'publish',
      executor: 'youtube-publish',
      allowedJobStatuses: ['draft', 'running', 'completed', 'failed', 'needs_input'],
      inputArtifacts: [
        { kind: 'target_subtitle', selector: 'latest-completed', optional: true },
        { kind: 'source_subtitle', selector: 'latest-completed', optional: true },
        { kind: 'dubbed_video', selector: 'latest-completed', optional: true },
        { kind: 'source_video', selector: 'latest-completed', optional: true },
        { kind: 'cover_image', selector: 'latest-completed', optional: true }
      ],
      outputArtifacts: [
        { kind: 'youtube_publish_kit', status: 'completed' },
        { kind: 'youtube_publish_markdown', status: 'completed' }
      ]
    }],
    actions: [
      { id: 'update-settings', inputSchema: record, allowedStages: ['publish'] },
      { id: 'run-stage', inputSchema: record, allowedStages: ['publish'] },
      { id: 'undo-action', inputSchema: record, allowedStages: ['publish'] }
    ],
    outputs: [
      { kind: 'youtube_publish_kit', required: true },
      { kind: 'youtube_publish_markdown', required: true }
    ],
    agentGuidance: [
      'Generate a bilingual Khmer + English YouTube publish kit (title, description with chapters, and tags) and optionally upload the video to YouTube via OAuth 2.0.',
      'Defaults to privacyStatus="private" so videos are never published publicly by accident.',
      'When uploadToYoutube=true, user OAuth credentials (clientId, clientSecret, refreshToken or accessToken) are required.'
    ].join(' ')
  };
}
