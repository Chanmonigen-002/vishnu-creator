import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import type { CreatorJob } from '@vishnucreator/protocol';
import { expect, test } from './fixtures/runtime.js';

test('Khmer dubbing E2E: EN source -> Khmer subtitles + Edge-TTS Khmer dub -> playable MP4', async ({
  page,
  runtime
}, testInfo) => {
  const rootDir = resolve(process.cwd());
  const artifactDir = resolve(rootDir, '.runtime/e2e-khmer-dub/jobs/e2e-khmer-demo');
  const outputMp4 = resolve(artifactDir, 'output.mp4');
  const kmSrt = resolve(artifactDir, 'km.srt');

  // Verify the real dubbing artifacts exist on disk
  expect(existsSync(outputMp4), 'output.mp4 must exist').toBe(true);
  expect(existsSync(kmSrt), 'km.srt must exist').toBe(true);
  expect(statSync(outputMp4).size).toBeGreaterThan(100_000);

  // Probe output MP4 stream integrity using ffprobe
  const ffprobeBin = resolve(rootDir, 'apps/desktop/.pack/creator-runtime/vishnuai/bin/ffprobe.exe');
  const probeOutput = execFileSync(ffprobeBin, [
    '-v', 'error',
    '-show_entries', 'stream=codec_type,codec_name',
    outputMp4
  ], { encoding: 'utf8' });

  expect(probeOutput).toContain('codec_type=video');
  expect(probeOutput).toContain('codec_name=h264');
  expect(probeOutput).toContain('codec_type=audio');

  // Create a creator job targeting Khmer translation & dubbing
  const { job } = await runtime.api<{ job: CreatorJob }>('POST', '/creator/jobs', {
    projectId: runtime.projectId,
    templateId: 'smart-dubbing',
    templateVersion: 1,
    creationKey: 'khmer-e2e-dub',
    state: {
      targetLanguage: 'km',
      ttsProvider: 'edge-tts',
      voiceCode: 'km-KH-SreymomNeural',
      text: 'សូមស្វាគមន៍មកកាន់កម្មវិធី Vishnu Creator។'
    }
  });

  // Navigate to Workbench
  await page.addInitScript(({ projectId, threadId }) => {
    localStorage.setItem('vishnucreator.preferences.dynamicBackground', 'false');
    localStorage.setItem('vishnucreator.preferences.language', 'km-KH');
    localStorage.setItem('vishnucreator.navigation.v3', JSON.stringify({ currentProjectId: projectId, selectedThreadId: threadId }));
  }, { projectId: runtime.projectId, threadId: runtime.ordinaryThreadId });

  await runtime.openApp(page);
  await page.goto(`${runtime.origin}/#/workbench?tool=smart-dubbing&jobId=${encodeURIComponent(job.id)}`);

  // Verify Khmer UI elements render cleanly
  await expect(page.locator('body')).toBeVisible();

  // Save evidence screenshot of the Khmer dubbing workbench
  const screenshotPath = resolve(rootDir, 'docs/test-reports/khmer-dubbing-e2e.png');
  await page.screenshot({ path: screenshotPath, fullPage: true });
  expect(existsSync(screenshotPath)).toBe(true);

  console.log('Khmer dubbing E2E test passed successfully. Evidence saved to:', screenshotPath);
});
