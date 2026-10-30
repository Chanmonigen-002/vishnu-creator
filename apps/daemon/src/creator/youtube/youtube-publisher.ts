import { readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { CreatorExecutor, CreatorExecutorOutput } from '../executor.js';
import { CreatorExecutorError } from '../executor.js';
import { chaptersFromParagraphs, transcriptParagraphs, type SeoChapter } from '../article/blog-text.js';
import { parseSrt, type SrtCue } from '../validators/srt.js';

export type YoutubePrivacyStatus = 'private' | 'unlisted' | 'public';

export type YoutubeOAuthCredentials = {
  clientId?: string;
  clientSecret?: string;
  refreshToken?: string;
  accessToken?: string;
  tokenEndpoint?: string;
  uploadEndpoint?: string;
  thumbnailEndpoint?: string;
};

export type YoutubePublishKitInput = {
  sourceTitle?: string;
  titleKm?: string;
  titleEn?: string;
  khmerCues?: SrtCue[];
  englishCues?: SrtCue[];
  extraTags?: string[];
  privacyStatus?: YoutubePrivacyStatus;
  categoryId?: string;
};

export type YoutubePublishKit = {
  titleKm: string;
  titleEn: string;
  title: string;
  descriptionKm: string;
  descriptionEn: string;
  description: string;
  tagsKm: string[];
  tagsEn: string[];
  tags: string[];
  chapters: SeoChapter[];
  privacyStatus: YoutubePrivacyStatus;
  categoryId: string;
  defaultLanguage: 'km';
  defaultAudioLanguage: 'km';
};

export type YoutubeUploadResult = {
  videoId: string;
  watchUrl: string;
  studioUrl: string;
  privacyStatus: YoutubePrivacyStatus;
  thumbnailUploaded: boolean;
};

const YOUTUBE_MAX_TITLE_LENGTH = 100;
const YOUTUBE_MAX_DESCRIPTION_LENGTH = 5_000;
const YOUTUBE_MAX_TAG_CHARS = 480;

const DEFAULT_KHMER_TITLE = 'វីដេអូបកប្រែនិងបញ្ចូលសំឡេងភាសាខ្មែរ។';
const DEFAULT_ENGLISH_TITLE = 'Khmer Dubbed & Translated Video';

const DEFAULT_KHMER_SUMMARY = 'វីដេអូនេះត្រូវបានបកប្រែនិងបញ្ចូលសំឡេងជាភាសាខ្មែរដោយស្វ័យប្រវត្តិ។';
const DEFAULT_ENGLISH_SUMMARY = 'This video has been translated and dubbed into natural spoken Khmer.';

const DEFAULT_KHMER_TAGS = ['ភាសាខ្មែរ', 'បកប្រែវីដេអូ', 'បញ្ចូលសំឡេងខ្មែរ', 'កម្ពុជា'];
const DEFAULT_ENGLISH_TAGS = ['Khmer', 'KhmerDub', 'Cambodia', 'TranslatedVideo'];

function normalizeKhmerSentence(value: string): string {
  const trimmed = value.replace(/\s+/g, ' ').trim();
  if (!trimmed) return '';
  // Remove spaces between adjacent Khmer characters while preserving spaces around Latin/numbers
  const unspacedKhmer = trimmed.replace(/([\u1780-\u17FF])\s+(?=[\u1780-\u17FF])/g, '$1');
  if (/[\u1780-\u17FF]/.test(unspacedKhmer) && !/[។៕៖!?]$/.test(unspacedKhmer)) {
    return `${unspacedKhmer}។`;
  }
  return unspacedKhmer;
}

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(1, maxLength - 1)).trimEnd()}…`;
}

export function buildYoutubePublishKit(input: YoutubePublishKitInput): YoutubePublishKit {
  const khmerParagraphs = transcriptParagraphs(input.khmerCues ?? []);
  const englishParagraphs = transcriptParagraphs(input.englishCues ?? []);

  const firstKhmerSnippet = khmerParagraphs[0]?.text.split('\n')[0]?.trim() ?? '';
  const firstEnglishSnippet = englishParagraphs[0]?.text.split('\n')[0]?.trim() ?? '';

  const rawTitleKm = normalizeKhmerSentence(
    input.titleKm?.trim()
      || (firstKhmerSnippet ? truncateText(firstKhmerSnippet, 48) : '')
      || DEFAULT_KHMER_TITLE
  );
  const rawTitleEn = (
    input.titleEn?.trim()
    || input.sourceTitle?.trim()
    || (firstEnglishSnippet ? truncateText(firstEnglishSnippet, 48) : '')
    || DEFAULT_ENGLISH_TITLE
  );

  const combinedTitle = truncateText(`${rawTitleKm} | ${rawTitleEn}`, YOUTUBE_MAX_TITLE_LENGTH);

  const chapters = chaptersFromParagraphs(
    khmerParagraphs.length > 0 ? khmerParagraphs : englishParagraphs,
    6
  );

  const khmerBody = khmerParagraphs
    .slice(0, 3)
    .map(p => normalizeKhmerSentence(p.text.replace(/\n+/g, ' ')))
    .filter(Boolean)
    .join('\n\n') || DEFAULT_KHMER_SUMMARY;

  const englishBody = englishParagraphs
    .slice(0, 3)
    .map(p => p.text.replace(/\n+/g, ' ').trim())
    .filter(Boolean)
    .join('\n\n') || DEFAULT_ENGLISH_SUMMARY;

  const chapterLines = chapters.length > 0
    ? ['0:00 សេចក្តីផ្តើម។ / Intro', ...chapters.filter(c => c.timestamp !== '0:00').map(c => `${c.timestamp} ${c.label}`)].join('\n')
    : '';

  const descriptionKm = [
    rawTitleKm,
    '',
    khmerBody,
    ...(chapterLines ? ['', 'មាតិកាវីដេអូ៖', chapterLines] : [])
  ].join('\n');

  const descriptionEn = [
    rawTitleEn,
    '',
    englishBody,
    ...(chapterLines ? ['', 'Chapters:', chapterLines] : [])
  ].join('\n');

  const tagsKm = Array.from(new Set([...DEFAULT_KHMER_TAGS]));
  const tagsEn = Array.from(new Set([
    ...DEFAULT_ENGLISH_TAGS,
    ...(input.extraTags ?? []).map(t => t.trim()).filter(Boolean)
  ]));

  const mergedTags: string[] = [];
  let tagChars = 0;
  for (const tag of [...tagsKm, ...tagsEn]) {
    const clean = tag.replace(/[<>]/g, '').trim();
    if (!clean || mergedTags.includes(clean)) continue;
    if (tagChars + clean.length + 1 > YOUTUBE_MAX_TAG_CHARS) break;
    mergedTags.push(clean);
    tagChars += clean.length + 1;
  }

  const hashtagsLine = ['#ភាសាខ្មែរ', '#KhmerDub', '#កម្ពុជា', '#Cambodia'].join(' ');
  const combinedDescription = truncateText(
    [
      '🇰🇭 ភាសាខ្មែរ៖',
      descriptionKm,
      '',
      '────────────────────',
      '🌐 English:',
      descriptionEn,
      '',
      hashtagsLine
    ].join('\n'),
    YOUTUBE_MAX_DESCRIPTION_LENGTH
  );

  return {
    titleKm: rawTitleKm,
    titleEn: rawTitleEn,
    title: combinedTitle,
    descriptionKm,
    descriptionEn,
    description: combinedDescription,
    tagsKm,
    tagsEn,
    tags: mergedTags,
    chapters,
    privacyStatus: input.privacyStatus ?? 'private',
    categoryId: input.categoryId?.trim() || '22',
    defaultLanguage: 'km',
    defaultAudioLanguage: 'km'
  };
}

export function renderYoutubePublishKitMarkdown(
  kit: YoutubePublishKit,
  uploadResult?: YoutubeUploadResult
): string {
  const lines = [
    `# YouTube Publish Kit (Khmer + English)`,
    '',
    `## Bilingual Title`,
    kit.title,
    '',
    `- **Khmer Title (\`km\`)**: ${kit.titleKm}`,
    `- **English Title (\`en\`)**: ${kit.titleEn}`,
    `- **Privacy Status**: \`${kit.privacyStatus}\``,
    `- **Category ID**: \`${kit.categoryId}\``,
    '',
    `## Bilingual Description`,
    '```text',
    kit.description,
    '```',
    '',
    `## Tags (${kit.tags.length})`,
    kit.tags.map(t => `\`${t}\``).join(', ')
  ];
  if (uploadResult) {
    lines.push(
      '',
      '## YouTube Upload Receipt',
      `- **Video ID**: \`${uploadResult.videoId}\``,
      `- **Watch URL**: ${uploadResult.watchUrl}`,
      `- **Studio URL**: ${uploadResult.studioUrl}`,
      `- **Privacy**: \`${uploadResult.privacyStatus}\``,
      `- **Thumbnail Uploaded**: \`${uploadResult.thumbnailUploaded}\``
    );
  }
  return `${lines.join('\n')}\n`;
}

export async function exchangeYoutubeRefreshToken(
  credentials: YoutubeOAuthCredentials,
  signal?: AbortSignal
): Promise<string> {
  if (credentials.accessToken?.trim()) {
    return credentials.accessToken.trim();
  }
  const clientId = credentials.clientId?.trim();
  const clientSecret = credentials.clientSecret?.trim();
  const refreshToken = credentials.refreshToken?.trim();
  if (!clientId || !clientSecret || !refreshToken) {
    throw new CreatorExecutorError(
      'creator_youtube_oauth_missing',
      'YouTube OAuth 2.0 credentials (clientId, clientSecret, refreshToken or accessToken) are required to upload to YouTube.'
    );
  }
  const tokenEndpoint = credentials.tokenEndpoint?.trim() || 'https://oauth2.googleapis.com/token';
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token'
  });

  const response = await fetch(tokenEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
    signal
  });
  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new CreatorExecutorError(
      'creator_youtube_oauth_failed',
      `YouTube OAuth token exchange failed (HTTP ${response.status}): ${errorText.slice(0, 240)}`
    );
  }
  const payload = (await response.json()) as { access_token?: string };
  if (!payload.access_token || typeof payload.access_token !== 'string') {
    throw new CreatorExecutorError(
      'creator_youtube_oauth_failed',
      'YouTube OAuth token response did not contain an access_token.'
    );
  }
  return payload.access_token;
}

export async function uploadVideoToYoutube(input: {
  videoPath: string;
  thumbnailPath?: string;
  kit: YoutubePublishKit;
  credentials: YoutubeOAuthCredentials;
  signal?: AbortSignal;
}): Promise<YoutubeUploadResult> {
  let videoBytes: Buffer;
  try {
    const videoStat = await stat(input.videoPath);
    if (!videoStat.isFile() || videoStat.size === 0) {
      throw new Error('Video file is empty');
    }
    videoBytes = await readFile(input.videoPath);
  } catch (error) {
    throw CreatorExecutorError.from(
      'creator_youtube_video_missing',
      error,
      `Video file for YouTube upload is missing or unreadable: ${input.videoPath}`
    );
  }

  const accessToken = await exchangeYoutubeRefreshToken(input.credentials, input.signal);
  const uploadEndpoint = input.credentials.uploadEndpoint?.trim()
    || 'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status';

  const initResponse = await fetch(uploadEndpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Length': String(videoBytes.byteLength),
      'X-Upload-Content-Type': 'video/mp4'
    },
    body: JSON.stringify({
      snippet: {
        title: input.kit.title,
        description: input.kit.description,
        tags: input.kit.tags,
        categoryId: input.kit.categoryId,
        defaultLanguage: input.kit.defaultLanguage,
        defaultAudioLanguage: input.kit.defaultAudioLanguage
      },
      status: {
        privacyStatus: input.kit.privacyStatus,
        selfDeclaredMadeForKids: false
      }
    }),
    signal: input.signal
  });

  if (!initResponse.ok) {
    const errorText = await initResponse.text().catch(() => '');
    throw new CreatorExecutorError(
      'creator_youtube_upload_failed',
      `YouTube resumable upload initialization failed (HTTP ${initResponse.status}): ${errorText.slice(0, 240)}`
    );
  }

  const uploadUrl = initResponse.headers.get('location');
  if (!uploadUrl) {
    throw new CreatorExecutorError(
      'creator_youtube_upload_failed',
      'YouTube resumable upload initialization did not return a Location header.'
    );
  }

  const putResponse = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Length': String(videoBytes.byteLength),
      'Content-Type': 'video/mp4'
    },
    body: new Uint8Array(videoBytes),
    signal: input.signal
  });

  if (!putResponse.ok) {
    const errorText = await putResponse.text().catch(() => '');
    throw new CreatorExecutorError(
      'creator_youtube_upload_failed',
      `YouTube video byte upload failed (HTTP ${putResponse.status}): ${errorText.slice(0, 240)}`
    );
  }

  const uploaded = (await putResponse.json()) as { id?: string; status?: { privacyStatus?: YoutubePrivacyStatus } };
  if (!uploaded.id || typeof uploaded.id !== 'string') {
    throw new CreatorExecutorError(
      'creator_youtube_upload_failed',
      'YouTube upload response did not include a video id.'
    );
  }

  let thumbnailUploaded = false;
  if (input.thumbnailPath) {
    const thumbBytes = await readFile(input.thumbnailPath);
    const thumbBase = input.credentials.thumbnailEndpoint?.trim()
      || 'https://www.googleapis.com/upload/youtube/v3/thumbnails/set';
    const separator = thumbBase.includes('?') ? '&' : '?';
    const thumbUrl = `${thumbBase}${separator}videoId=${encodeURIComponent(uploaded.id)}`;
    const thumbRes = await fetch(thumbUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': input.thumbnailPath.endsWith('.jpg') || input.thumbnailPath.endsWith('.jpeg')
          ? 'image/jpeg'
          : 'image/png',
        'Content-Length': String(thumbBytes.byteLength)
      },
      body: new Uint8Array(thumbBytes),
      signal: input.signal
    });
    if (!thumbRes.ok) {
      const errorText = await thumbRes.text().catch(() => '');
      throw new CreatorExecutorError(
        'creator_youtube_thumbnail_failed',
        `YouTube thumbnail upload failed (HTTP ${thumbRes.status}): ${errorText.slice(0, 240)}`
      );
    }
    thumbnailUploaded = true;
  }

  const privacyStatus = uploaded.status?.privacyStatus ?? input.kit.privacyStatus;
  return {
    videoId: uploaded.id,
    watchUrl: `https://www.youtube.com/watch?v=${uploaded.id}`,
    studioUrl: `https://studio.youtube.com/video/${uploaded.id}/edit`,
    privacyStatus,
    thumbnailUploaded
  };
}

export function createYoutubePublishExecutor(): CreatorExecutor {
  return {
    id: 'youtube-publish',
    async run(stage) {
      if (stage.stageRun.stageId !== 'publish') {
        throw new CreatorExecutorError('creator_stage_not_supported', 'Unsupported YouTube publish stage');
      }

      const khmerSubtitlePath = stage.inputArtifacts.find(a => a.kind === 'target_subtitle' || a.kind === 'khmer_srt')?.path;
      const englishSubtitlePath = stage.inputArtifacts.find(a => a.kind === 'source_subtitle' || a.kind === 'source_srt')?.path;
      const videoPath = stage.inputArtifacts.find(a => a.kind === 'dubbed_video' || a.kind === 'rendered_video' || a.kind === 'source_video')?.path;
      const thumbnailPath = stage.inputArtifacts.find(a => a.kind === 'cover_image' || a.kind === 'thumbnail')?.path ?? undefined;

      const khmerCues = khmerSubtitlePath
        ? parseSrt(await readFile(khmerSubtitlePath, 'utf8'), { allowOverlaps: true })
        : [];
      const englishCues = englishSubtitlePath
        ? parseSrt(await readFile(englishSubtitlePath, 'utf8'), { allowOverlaps: true })
        : [];

      const state = stage.job.state;
      const privacyStatus = readPrivacyStatus(state.privacyStatus);
      const uploadToYoutube = state.uploadToYoutube === true;

      stage.reportProgress({ phase: 'building_metadata', percent: 25 });
      const kit = buildYoutubePublishKit({
        sourceTitle: typeof state.sourceTitle === 'string' ? state.sourceTitle : undefined,
        titleKm: typeof state.titleKm === 'string' ? state.titleKm : undefined,
        titleEn: typeof state.titleEn === 'string' ? state.titleEn : undefined,
        khmerCues,
        englishCues,
        extraTags: Array.isArray(state.extraTags) ? state.extraTags.filter((t): t is string => typeof t === 'string') : undefined,
        privacyStatus,
        categoryId: typeof state.categoryId === 'string' ? state.categoryId : undefined
      });

      let uploadResult: YoutubeUploadResult | undefined;
      if (uploadToYoutube) {
        if (!videoPath) {
          throw new CreatorExecutorError(
            'creator_youtube_video_missing',
            'A video artifact (dubbed_video, rendered_video, or source_video) is required when uploadToYoutube is enabled.'
          );
        }
        stage.reportProgress({ phase: 'uploading_video', percent: 60 });
        const oauth = (typeof state.oauth === 'object' && state.oauth !== null ? state.oauth : {}) as Record<string, unknown>;
        uploadResult = await uploadVideoToYoutube({
          videoPath,
          thumbnailPath,
          kit,
          credentials: {
            clientId: typeof oauth.clientId === 'string' ? oauth.clientId : undefined,
            clientSecret: typeof oauth.clientSecret === 'string' ? oauth.clientSecret : undefined,
            refreshToken: typeof oauth.refreshToken === 'string' ? oauth.refreshToken : undefined,
            accessToken: typeof oauth.accessToken === 'string' ? oauth.accessToken : undefined,
            tokenEndpoint: typeof oauth.tokenEndpoint === 'string' ? oauth.tokenEndpoint : undefined,
            uploadEndpoint: typeof oauth.uploadEndpoint === 'string' ? oauth.uploadEndpoint : undefined,
            thumbnailEndpoint: typeof oauth.thumbnailEndpoint === 'string' ? oauth.thumbnailEndpoint : undefined
          },
          signal: stage.signal
        });
      }

      const jsonPath = join(stage.workdir, 'youtube-publish-kit.json');
      const mdPath = join(stage.workdir, 'youtube-publish-kit.md');
      await writeFile(jsonPath, `${JSON.stringify({ kit, upload: uploadResult ?? null }, null, 2)}\n`, 'utf8');
      await writeFile(mdPath, renderYoutubePublishKitMarkdown(kit, uploadResult), 'utf8');

      const sourceArtifactIds = stage.inputArtifacts.map(a => a.id);
      const outputs: CreatorExecutorOutput[] = [
        {
          kind: 'youtube_publish_kit',
          status: 'completed',
          path: jsonPath,
          sourceArtifactIds,
          metadata: {
            fileName: 'youtube-publish-kit.json',
            mimeType: 'application/json',
            title: kit.title,
            titleKm: kit.titleKm,
            titleEn: kit.titleEn,
            tagsCount: kit.tags.length,
            privacyStatus: kit.privacyStatus,
            uploaded: Boolean(uploadResult),
            videoId: uploadResult?.videoId ?? null,
            watchUrl: uploadResult?.watchUrl ?? null
          }
        },
        {
          kind: 'youtube_publish_markdown',
          status: 'completed',
          path: mdPath,
          sourceArtifactIds,
          metadata: {
            fileName: 'youtube-publish-kit.md',
            mimeType: 'text/markdown',
            title: kit.title
          }
        }
      ];
      stage.reportProgress({ phase: 'completed', percent: 100 });
      return { outputs };
    }
  };
}

function readPrivacyStatus(value: unknown): YoutubePrivacyStatus {
  if (value === 'public' || value === 'unlisted' || value === 'private') {
    return value;
  }
  return 'private';
}
