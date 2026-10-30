import { createServer } from 'node:http';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import {
  buildYoutubePublishKit,
  createYoutubePublishExecutor,
  exchangeYoutubeRefreshToken,
  uploadVideoToYoutube
} from '../../src/creator/youtube/youtube-publisher.js';

let tempRoot = '';
afterEach(() => {
  if (tempRoot) {
    rmSync(tempRoot, { recursive: true, force: true });
    tempRoot = '';
  }
});

describe('creator YouTube publisher (T6.3 / ADR-0007)', () => {
  it('builds bilingual Khmer + English title, description with chapters, and tags with natural Khmer rules', () => {
    const kit = buildYoutubePublishKit({
      titleKm: 'សួស្តី អ្នកទាំងអស់គ្នា មកកាន់ កម្ពុជា',
      titleEn: 'Welcome Everyone to Cambodia',
      khmerCues: [
        { index: 1, startMs: 0, endMs: 4000, text: 'សួស្តី អ្នកទាំងអស់គ្នា សូមស្វាគមន៍។' },
        { index: 2, startMs: 65000, endMs: 70000, text: 'ថ្ងៃនេះ យើងរៀនអំពី បច្ចេកវិទ្យា AI ថ្មីៗ។' }
      ],
      englishCues: [
        { index: 1, startMs: 0, endMs: 4000, text: 'Hello everyone and welcome.' },
        { index: 2, startMs: 65000, endMs: 70000, text: 'Today we learn about new AI technology.' }
      ],
      extraTags: ['AICambodia', 'VishnuCreator']
    });

    // Inter-word spaces between Khmer words removed, ends with ។
    expect(kit.titleKm).toBe('សួស្តីអ្នកទាំងអស់គ្នាមកកាន់កម្ពុជា។');
    expect(kit.titleEn).toBe('Welcome Everyone to Cambodia');
    expect(kit.title).toBe('សួស្តីអ្នកទាំងអស់គ្នាមកកាន់កម្ពុជា។ | Welcome Everyone to Cambodia');
    expect(kit.title.length).toBeLessThanOrEqual(100);

    expect(kit.description).toContain('🇰🇭 ភាសាខ្មែរ៖');
    expect(kit.description).toContain('🌐 English:');
    expect(kit.description).toContain('សួស្តីអ្នកទាំងអស់គ្នាសូមស្វាគមន៍។');
    expect(kit.description).toContain('Hello everyone and welcome.');
    expect(kit.tags).toEqual(
      expect.arrayContaining(['ភាសាខ្មែរ', 'កម្ពុជា', 'Khmer', 'KhmerDub', 'AICambodia', 'VishnuCreator'])
    );
    expect(kit.privacyStatus).toBe('private');
    expect(kit.defaultLanguage).toBe('km');
  });

  it('fails honestly when OAuth credentials are missing', async () => {
    await expect(exchangeYoutubeRefreshToken({})).rejects.toMatchObject({
      code: 'creator_youtube_oauth_missing'
    });
  });

  it('exchanges OAuth refresh token and performs resumable video + thumbnail upload', async () => {
    tempRoot = mkdtempSync(join(tmpdir(), 'vishnu-yt-publish-'));
    const videoPath = join(tempRoot, 'dubbed.mp4');
    const thumbPath = join(tempRoot, 'cover.png');
    const videoContent = Buffer.from('FAKE_MP4_HEADER_FOR_UNIT_TEST_STREAMING_VERIFICATION');
    const thumbContent = Buffer.from('PNG_THUMBNAIL_BYTES');
    writeFileSync(videoPath, videoContent);
    writeFileSync(thumbPath, thumbContent);

    let tokenCalled = false;
    let initSnippet: Record<string, unknown> | null = null;
    let uploadedBytes = Buffer.alloc(0);
    let thumbnailVideoId = '';

    const server = createServer(async (req, res) => {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      const body = Buffer.concat(chunks);
      const url = new URL(req.url ?? '/', `http://${req.headers.host}`);

      if (req.method === 'POST' && url.pathname === '/oauth2/token') {
        tokenCalled = true;
        const params = new URLSearchParams(body.toString('utf8'));
        expect(params.get('client_id')).toBe('my-client-id');
        expect(params.get('client_secret')).toBe('my-client-secret');
        expect(params.get('refresh_token')).toBe('my-refresh-token');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ access_token: 'issued-access-token-123' }));
        return;
      }

      if (req.method === 'POST' && url.pathname === '/upload/youtube/v3/videos') {
        expect(req.headers.authorization).toBe('Bearer issued-access-token-123');
        expect(req.headers['x-upload-content-length']).toBe(String(videoContent.byteLength));
        initSnippet = JSON.parse(body.toString('utf8'));
        res.writeHead(200, {
          Location: `http://${req.headers.host}/upload/session/abc`
        });
        res.end();
        return;
      }

      if (req.method === 'PUT' && url.pathname === '/upload/session/abc') {
        expect(req.headers.authorization).toBe('Bearer issued-access-token-123');
        uploadedBytes = body;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ id: 'yt_video_khmer_01', status: { privacyStatus: 'unlisted' } }));
        return;
      }

      if (req.method === 'POST' && url.pathname === '/upload/youtube/v3/thumbnails/set') {
        thumbnailVideoId = url.searchParams.get('videoId') ?? '';
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ items: [{ default: { url: 'https://i.ytimg.com/vi/yt_video_khmer_01/default.jpg' } }] }));
        return;
      }

      res.writeHead(404).end();
    });

    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    try {
      const kit = buildYoutubePublishKit({
        titleKm: 'វីដេអូសាកល្បង។',
        titleEn: 'Test Video',
        privacyStatus: 'unlisted'
      });

      const result = await uploadVideoToYoutube({
        videoPath,
        thumbnailPath: thumbPath,
        kit,
        credentials: {
          clientId: 'my-client-id',
          clientSecret: 'my-client-secret',
          refreshToken: 'my-refresh-token',
          tokenEndpoint: `${origin}/oauth2/token`,
          uploadEndpoint: `${origin}/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status`,
          thumbnailEndpoint: `${origin}/upload/youtube/v3/thumbnails/set`
        }
      });

      expect(tokenCalled).toBe(true);
      expect(initSnippet).toMatchObject({
        snippet: {
          title: 'វីដេអូសាកល្បង។ | Test Video',
          defaultLanguage: 'km',
          defaultAudioLanguage: 'km'
        },
        status: {
          privacyStatus: 'unlisted'
        }
      });
      expect(uploadedBytes.equals(videoContent)).toBe(true);
      expect(thumbnailVideoId).toBe('yt_video_khmer_01');
      expect(result).toEqual({
        videoId: 'yt_video_khmer_01',
        watchUrl: 'https://www.youtube.com/watch?v=yt_video_khmer_01',
        studioUrl: 'https://studio.youtube.com/video/yt_video_khmer_01/edit',
        privacyStatus: 'unlisted',
        thumbnailUploaded: true
      });
    } finally {
      server.closeAllConnections();
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
  });

  it('writes youtube-publish-kit.json and .md via createYoutubePublishExecutor', async () => {
    tempRoot = mkdtempSync(join(tmpdir(), 'vishnu-yt-exec-'));
    const srtPath = join(tempRoot, 'km.srt');
    writeFileSync(
      srtPath,
      '1\n00:00:00,000 --> 00:00:03,000\nសួស្តីបងប្អូនទាំងអស់គ្នា។\n\n',
      'utf8'
    );

    const executor = createYoutubePublishExecutor();
    const out = await executor.run({
      job: {
        id: 'job-yt-1',
        projectId: 'proj-1',
        templateId: 'youtube-publish',
        templateVersion: 1,
        status: 'running',
        revision: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        state: {
          sourceTitle: 'Cambodia AI Overview',
          uploadToYoutube: false
        }
      } as never,
      stageRun: { id: 'sr-1', jobId: 'job-yt-1', stageId: 'publish', executor: 'youtube-publish', status: 'running' } as never,
      inputArtifacts: [
        { id: 'art-1', jobId: 'job-yt-1', kind: 'target_subtitle', status: 'completed', path: srtPath, sourceArtifactIds: [], metadata: {}, createdAt: '', updatedAt: '' } as never
      ],
      workdir: tempRoot,
      signal: new AbortController().signal,
      reportProgress: () => {}
    });

    expect(out.outputs).toHaveLength(2);
    const jsonPayload = JSON.parse(readFileSync(join(tempRoot, 'youtube-publish-kit.json'), 'utf8'));
    expect(jsonPayload.kit.titleKm).toBe('សួស្តីបងប្អូនទាំងអស់គ្នា។');
    expect(jsonPayload.kit.titleEn).toBe('Cambodia AI Overview');
    const mdContent = readFileSync(join(tempRoot, 'youtube-publish-kit.md'), 'utf8');
    expect(mdContent).toContain('# YouTube Publish Kit (Khmer + English)');
  });
});
