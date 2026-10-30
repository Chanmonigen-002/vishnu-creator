import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

export function packagedExecutable(desktopDir: string): string {
  const packageRoot = resolvePackageRoot(desktopDir);
  if (process.platform === 'darwin') {
    const macCandidates = [
      join(packageRoot, 'Contents', 'MacOS', 'Vishnu Creator'),
      join(packageRoot, 'Contents', 'MacOS', 'VishnuCreator')
    ];
    return macCandidates.find(existsSync) ?? macCandidates[0]!;
  }
  if (process.platform === 'win32') {
    const winCandidates = [
      join(packageRoot, 'Vishnu Creator.exe'),
      join(packageRoot, 'VishnuCreator.exe')
    ];
    return winCandidates.find(existsSync) ?? winCandidates[0]!;
  }
  const linuxCandidates = [
    join(packageRoot, 'vishnucreator'),
    join(packageRoot, 'Vishnu Creator')
  ];
  return linuxCandidates.find(existsSync) ?? linuxCandidates[0]!;
}

function resolvePackageRoot(desktopDir: string): string {
  const explicit = process.env.VISHNUCREATOR_DESKTOP_PACKAGE_ROOT;
  if (explicit !== undefined && explicit.trim().length > 0) {
    return resolve(explicit);
  }
  const manifestPath = resolve(
    process.env.VISHNUCREATOR_DESKTOP_BUILD_MANIFEST
      ?? join(desktopDir, 'release', 'vishnucreator-desktop-build-manifest.json')
  );
  if (!existsSync(manifestPath)) {
    throw new Error(
      `Desktop 构建清单不存在：${manifestPath}。`
      + '请先执行 package，或设置 VISHNUCREATOR_DESKTOP_PACKAGE_ROOT。'
    );
  }
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
    platform?: string;
    arch?: string;
    packageRoot?: string;
  };
  if (typeof manifest.packageRoot !== 'string') {
    throw new Error(`Desktop 构建清单缺少 packageRoot：${manifestPath}`);
  }
  if (manifest.platform !== process.platform || manifest.arch !== process.arch) {
    throw new Error(
      `Desktop 构建产物不是当前原生平台：`
      + `${String(manifest.platform)}/${String(manifest.arch)}，`
      + `当前为 ${process.platform}/${process.arch}`
    );
  }
  return resolve(manifest.packageRoot);
}
