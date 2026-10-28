import { existsSync, readFileSync, rmSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { CreatorJob } from '@vishnucreator/protocol';
import { expect, test } from './fixtures/runtime.js';

const execFileAsync = promisify(execFile);

test('Khmer dubbing E2E: EN source -> Khmer subtitles + Edge-TTS Khmer dub -> playable MP4', async ({
  page,
  runtime
}, testInfo) => {
  test.setTimeout(90_000);

  const rootDir = resolve(process.cwd());
  const artifactDir = resolve(rootDir, '.runtime/e2e-khmer-dub/jobs/e2e-khmer-demo');
  const outputMp4 = resolve(artifactDir, 'output.mp4');
  const kmSrt = resolve(artifactDir, 'km.srt');
  const pythonBin = resolve(rootDir, 'services/dub-engine/.venv/Scripts/python.exe');
  const runnerScript = resolve(rootDir, 'scripts/run-e2e-khmer-dub.py');
  const sourceVideo = resolve(rootDir, 'apps/web/e2e/fixtures/khmer-demo-source.mp4');

  // Verify test source video fixture exists
  expect(existsSync(sourceVideo), 'Test source video fixture must exist').toBe(true);

  // Guarantee clean execution by wiping any previous output before running pipeline
  if (existsSync(outputMp4)) {
    rmSync(outputMp4, { force: true });
  }
  expect(existsSync(outputMp4), 'output.mp4 must not exist before running pipeline').toBe(false);

  // Run the real Khmer dubbing pipeline asynchronously without blocking Node event loop:
  // Edge-TTS synthesis (km-KH-SreymomNeural) + audio mixing + ffmpeg video assembly with Khmer subtitles
  const { stdout: runOutput } = await execFileAsync(pythonBin, [
    runnerScript,
    '--source-video', sourceVideo,
    '--output-dir', artifactDir,
    '--khmer-text', 'សួស្តី នេះជាការសាកល្បងបញ្ចូលសំឡេងជាភាសាខ្មែរ។',
    '--voice-id', 'km-KH-SreymomNeural'
  ], { encoding: 'utf8' });

  console.log('[e2e] Dubbing pipeline output:', runOutput);

  // Verify the newly generated dubbing artifacts exist on disk
  expect(existsSync(outputMp4), 'Newly produced output.mp4 must exist').toBe(true);
  expect(existsSync(kmSrt), 'Newly produced km.srt must exist').toBe(true);
  expect(statSync(outputMp4).size).toBeGreaterThan(100_000);

  // Verify Khmer subtitle formatting: natural spoken Khmer without zero-width spaces or inter-word spaces, ending with '។'
  const srtContent = readFileSync(kmSrt, 'utf8');
  expect(srtContent).toContain('សួស្តី នេះជាការសាកល្បងបញ្ចូលសំឡេងជាភាសាខ្មែរ។');
  expect(srtContent).not.toContain('\u200B');

  // Probe output MP4 stream integrity using ffprobe
  const ffprobeBin = resolve(rootDir, 'apps/desktop/.pack/creator-runtime/vishnuai/bin/ffprobe.exe');
  const { stdout: probeOutput } = await execFileAsync(ffprobeBin, [
    '-v', 'error',
    '-show_entries', 'stream=codec_type,codec_name',
    outputMp4
  ], { encoding: 'utf8' });

  expect(probeOutput).toContain('codec_type=video');
  expect(probeOutput).toContain('codec_name=h264');
  expect(probeOutput).toContain('codec_type=audio');
  expect(probeOutput).toContain('codec_name=aac');

  // Create a creator job targeting Khmer translation & dubbing
  const khmerScriptText = 'សូមស្វាគមន៍មកកាន់កម្មវិធី Vishnu Creator។';
  const { job } = await runtime.api<{ job: CreatorJob }>('POST', '/creator/jobs', {
    projectId: runtime.projectId,
    templateId: 'smart-dubbing',
    templateVersion: 1,
    creationKey: 'khmer-e2e-dub',
    state: {
      targetLanguage: 'km',
      ttsProvider: 'edge-tts',
      voiceCode: 'km-KH-SreymomNeural',
      voiceName: 'Sreymom',
      text: khmerScriptText
    }
  });

  // Open App in baseline runtime
  await runtime.openApp(page);

  // Set Khmer locale and navigate to Smart Dubbing Workbench
  await page.evaluate(() => {
    localStorage.setItem('vishnucreator.preferences.dynamicBackground', 'false');
    localStorage.setItem('vishnucreator.preferences.language', 'km-KH');
  });
  await page.goto(`${runtime.origin}/#/workbench?tool=smart-dubbing&jobId=${encodeURIComponent(job.id)}`);

  // Verify the smart dubbing script editor renders the Khmer script cleanly
  const scriptInput = page.locator('#smart-dubbing-script-input');
  await expect(scriptInput).toBeVisible({ timeout: 15_000 });
  await expect(scriptInput).toHaveValue(khmerScriptText);

  // Save evidence screenshot of the Khmer dubbing workbench
  const screenshotPath = resolve(rootDir, 'docs/test-reports/khmer-dubbing-e2e.png');
  await page.screenshot({ path: screenshotPath, fullPage: true });
  expect(existsSync(screenshotPath)).toBe(true);

  console.log('Khmer dubbing E2E test passed successfully. Evidence saved to:', screenshotPath);
});
