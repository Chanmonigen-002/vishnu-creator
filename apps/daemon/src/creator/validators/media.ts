import { execFile } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { stat } from 'node:fs/promises';

export type MediaProbe = {
  duration: number;
  width?: number;
  height?: number;
  hasVideo: boolean;
  hasAudio: boolean;
};

export async function validateMediaFile(
  path: string,
  ffprobe: string,
  ffprobePrefixArgs: string[] = []
): Promise<MediaProbe> {
  const info = await stat(path);
  if (!info.isFile() || info.size === 0) throw new Error('invalid_media: empty file');
  const output = await execFileText(ffprobe, [
    ...ffprobePrefixArgs,
    '-v', 'error',
    '-show_entries', 'format=duration:stream=codec_type,width,height',
    '-of', 'json',
    path
  ]);
  const parsed = JSON.parse(output) as {
    format?: { duration?: string };
    streams?: Array<{ codec_type?: string; width?: number; height?: number }>;
  };
  const duration = Number(parsed.format?.duration);
  const video = parsed.streams?.find(stream => stream.codec_type === 'video');
  const hasAudio = parsed.streams?.some(stream => stream.codec_type === 'audio') === true;
  if (!Number.isFinite(duration) || duration <= 0 || (video === undefined && !hasAudio)) {
    throw new Error('invalid_media: missing streams or duration');
  }
  return {
    duration,
    ...(video?.width === undefined ? {} : { width: video.width }),
    ...(video?.height === undefined ? {} : { height: video.height }),
    hasVideo: video !== undefined,
    hasAudio
  };
}

function execFileText(command: string, args: string[]): Promise<string> {
  const [resolvedCommand, resolvedArgs] = resolveExecutableCommand(command, args);
  return new Promise((resolve, reject) => {
    execFile(resolvedCommand, resolvedArgs, { windowsHide: true, maxBuffer: 4 * 1024 * 1024 }, (error, stdout) => {
      if (error) reject(error);
      else resolve(stdout);
    });
  });
}

function resolveExecutableCommand(command: string, args: string[]): [string, string[]] {
  if (process.platform !== 'win32' || /\.(?:exe|cmd|bat|com)$/i.test(command)) {
    return [command, args];
  }
  try {
    const firstLine = readFileSync(command, 'utf8').split(/\r?\n/, 1)[0] ?? '';
    if (firstLine.startsWith('#!')) {
      if (/\bnode\b/i.test(firstLine)) {
        return [process.execPath, [command, ...args]];
      }
      if (/\b(?:sh|bash)\b/i.test(firstLine)) {
        const gitSh = 'C:\\Program Files\\Git\\bin\\sh.exe';
        return [existsSync(gitSh) ? gitSh : 'sh', [command, ...args]];
      }
    }
  } catch {
    // Fall back to direct execution.
  }
  return [command, args];
}
