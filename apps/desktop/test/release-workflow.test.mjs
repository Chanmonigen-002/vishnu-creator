import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const releaseWorkflow = readFileSync(
  resolve(process.cwd(), '../../.github/workflows/desktop-release.yml'),
  'utf8'
);
const ciWorkflow = readFileSync(
  resolve(process.cwd(), '../../.github/workflows/ci.yml'),
  'utf8'
);

describe('Desktop release workflow', () => {
  it('uses VishnuCreator as the release name', () => {
    expect(releaseWorkflow).toContain('name: VishnuCreator Release');
    expect(releaseWorkflow).toContain('--title "VishnuCreator $TAG"');
    expect(releaseWorkflow).not.toContain('--title "VishnuAI $TAG"');
  });

  it('runs CI on demand, for pull requests, and for master pushes', () => {
    expect(ciWorkflow).toContain('workflow_dispatch:');
    expect(ciWorkflow).toContain('pull_request:');
    expect(ciWorkflow).toContain('\n  push:');
    expect(ciWorkflow).toContain('      - master');
    expect(ciWorkflow).toContain('cancel-in-progress: true');
    expect(ciWorkflow).toContain('classify:');
    expect(ciWorkflow).toContain('release-checks:');
    expect(ciWorkflow).toContain('unit:');
    expect(ciWorkflow).toContain('compile:');
    expect(ciWorkflow).toContain('web-parity:');
    expect(ciWorkflow).toContain("needs.classify.outputs.release-only == 'true'");
    expect(ciWorkflow).toContain('--status success');
    expect(ciWorkflow).toContain("--jq '.[0].headSha // empty'");
    expect(ciWorkflow).toContain('name: Prepare generated build inputs');
  });

  it('runs the network audit before expensive verification steps', () => {
    const auditCommand =
      'pnpm audit --audit-level high --ignore-registry-errors';
    expect(ciWorkflow).toContain(auditCommand);
    expect(ciWorkflow.indexOf(auditCommand)).toBeLessThan(
      ciWorkflow.indexOf('pnpm test')
    );
  });

  it('uses the release Environment and requires macOS signing secrets', () => {
    expect(releaseWorkflow).toContain('environment: release');
    expect(releaseWorkflow).toContain('name: Verify macOS production signing credentials');
    expect(releaseWorkflow).toContain('secrets.MACOS_CERTIFICATE');
    expect(releaseWorkflow).toContain('secrets.MACOS_CERTIFICATE_PASSWORD');
    expect(releaseWorkflow).toContain('secrets.APPLE_ID');
    expect(releaseWorkflow).toContain('secrets.APPLE_APP_SPECIFIC_PASSWORD');
    expect(releaseWorkflow).toContain('secrets.APPLE_TEAM_ID');
    expect(releaseWorkflow).toContain(
      'release Environment is missing macOS signing Secret'
    );
  });

  it('builds signed macOS packages and unsigned Windows packages', () => {
    expect(releaseWorkflow).toContain("if: matrix.platform == 'darwin'");
    expect(releaseWorkflow).toContain(
      'pnpm desktop:release 2>&1 | tee desktop-release.log'
    );
    expect(releaseWorkflow).toContain("if: matrix.platform == 'win32'");
    expect(releaseWorkflow).toContain('run: pnpm desktop:dist');
    expect(releaseWorkflow).not.toContain('secrets.WINDOWS_CERTIFICATE');
    expect(releaseWorkflow).toContain(
      '"artifact":"vishnucreator-desktop-windows-x64-unsigned"'
    );
    expect(releaseWorkflow).not.toContain('WINDOWS-UNSIGNED.txt');
  });

  it('provides GitHub API authentication to both desktop packaging steps', () => {
    const macStep = releaseWorkflow.split('name: Generate macOS production signed installer')[1]
      .split('name: Generate Windows unsigned installer')[0];
    const windowsStep = releaseWorkflow.split('name: Generate Windows unsigned installer')[1]
      .split('name: Verify packaged application')[0];
    for (const step of [macStep, windowsStep]) {
      expect(step).toContain('GH_TOKEN: ${{ github.token }}');
    }
  });

  it('reuses the successful master CI instead of repeating all tests', () => {
    expect(releaseWorkflow).toContain('name: Verify CI passed for the same commit');
    expect(releaseWorkflow).toContain('--workflow ci.yml');
    expect(releaseWorkflow).toContain('--event push');
    expect(releaseWorkflow).toContain('--status success');
    expect(releaseWorkflow).toContain('Please wait for CI to pass');
    expect(releaseWorkflow).not.toContain('run: pnpm test');
    expect(releaseWorkflow).not.toContain('run: pnpm typecheck');
    expect(releaseWorkflow).not.toContain('run: pnpm build');
  });

  it('cancels sibling package jobs while preserving failure diagnostics', () => {
    expect(releaseWorkflow).toContain('fail-fast: true');
    expect(releaseWorkflow).toContain('tail -n 80 desktop-release.log');
    expect(releaseWorkflow).toContain(
      '::error title=macOS release failure details::'
    );
    expect(releaseWorkflow).toContain('desktop-release.log');
  });

  it('supports single-platform validation and only marks complete all-platform candidates', () => {
    expect(releaseWorkflow).toContain('target:');
    expect(releaseWorkflow).toContain('default: all');
    expect(releaseWorkflow).toContain("TARGET: ${{ inputs.target || 'all' }}");
    expect(releaseWorkflow).toContain('matrix: ${{ fromJSON(needs.verify.outputs.matrix) }}');
    expect(releaseWorkflow).toContain(
      '{"include":[{"name":"macos-x64"'
    );
    expect(releaseWorkflow).toContain(
      '{"include":[{"name":"windows-x64"'
    );
    expect(releaseWorkflow).toContain("candidate-ready:");
    expect(releaseWorkflow).toContain("inputs.target == 'all'");
    expect(releaseWorkflow).toContain('e2e:package:smoke');
    expect(releaseWorkflow).not.toContain("matrix.name == 'macos-arm64'");
    expect(releaseWorkflow).toContain('vishnucreator-release-candidate-${{ steps.build-input.outputs.digest }}');
  });

  it('promotes an immutable successful master candidate instead of rebuilding a tag', () => {
    expect(releaseWorkflow).toContain("if: github.event_name == 'workflow_dispatch'");
    expect(releaseWorkflow).toContain('name: Find reusable complete candidate build');
    expect(releaseWorkflow).toContain('release-build-input.mjs digest');
    expect(releaseWorkflow).toContain('repos/$GH_REPO/compare/$candidate_sha...$RELEASE_SHA');
    expect(releaseWorkflow).toContain('comparison_status');
    expect(releaseWorkflow).toContain('CANDIDATE_BUILD_INPUT_DIGEST');
    expect(releaseWorkflow).toContain('candidate.schemaVersion === 2');
    expect(releaseWorkflow).toContain('candidate.buildInputDigest');
    expect(releaseWorkflow).toContain('No reusable complete candidate build for current tag');
    expect(releaseWorkflow).toContain('run-id: ${{ steps.candidate.outputs.run-id }}');
    expect(releaseWorkflow).toContain('name: ${{ steps.candidate.outputs.name }}');
    expect(releaseWorkflow).toContain('EXPECTED_SHA: ${{ steps.candidate.outputs.sha }}');
    expect(releaseWorkflow).toContain('name: Verify candidate package credentials');
    expect(releaseWorkflow).toContain('needs: verify');
    expect(releaseWorkflow).not.toContain("startsWith(github.ref, 'refs/tags/') || inputs.target == 'all'");
  });

  it('republishes an existing tag only from master with matching inputs and successful CI', () => {
    expect(releaseWorkflow).toContain('          - publish');
    expect(releaseWorkflow).toContain('release_tag:');
    expect(releaseWorkflow).toContain('promotion-target "$RELEASE_TAG"');
    expect(releaseWorkflow).toContain('"$GITHUB_REF" != refs/heads/master');
    expect(releaseWorkflow).toContain("inputs.target != 'publish'");
    expect(releaseWorkflow).toContain('TAG: ${{ needs.verify.outputs.release-tag }}');
    expect(releaseWorkflow).toContain('RELEASE_SHA: ${{ needs.verify.outputs.release-sha }}');
    expect(releaseWorkflow).toContain('"$GITHUB_SHA" "$RELEASE_SHA"');
    expect(releaseWorkflow).toContain('pnpm install --filter @vishnucreator/daemon --frozen-lockfile --ignore-scripts');
    expect(releaseWorkflow).not.toContain('git tag -f');
    expect(releaseWorkflow).not.toContain('git push --force');
  });

  it('keeps build diagnostics separate from validated public release assets', () => {
    expect(releaseWorkflow).toContain(
      'vishnucreator-desktop-build-manifest-${{ matrix.platform }}-${{ matrix.arch }}.json'
    );
    expect(releaseWorkflow).toContain('pattern: vishnucreator-desktop-*');
    expect(releaseWorkflow).toContain('merge-multiple: true');
    expect(releaseWorkflow).toContain('name: desktop-build-diagnostics-${{ matrix.name }}');
    expect(releaseWorkflow).toContain('path: ${{ env.VISHNUCREATOR_DESKTOP_RELEASE_ASSETS }}/*');
    expect(releaseWorkflow).toContain('pattern: vishnuai-release-*');
    expect(releaseWorkflow).toContain('path: ${{ env.VISHNUCREATOR_VISHNUAI_RELEASE_ASSETS }}/*');
    expect(releaseWorkflow).toContain('release-assets.mjs artifacts');
    expect(releaseWorkflow).not.toContain('apps/desktop/release/*.exe');
    expect(releaseWorkflow).not.toContain('apps/desktop/release/vishnuai-*');
    expect(releaseWorkflow).toContain('--verify-tag --draft');
    expect(releaseWorkflow).toContain('--draft=false --latest');
  });

  it('publishes separate VishnuAI Server and CLI packages for desktop and Linux targets', () => {
    expect(releaseWorkflow).toContain('run: pnpm vishnuai:package');
    expect(releaseWorkflow).toContain(
      'VISHNUCREATOR_VISHNUAI_TARGET_PLATFORM: ${{ matrix.platform }}'
    );
    expect(releaseWorkflow).toContain(
      'VISHNUCREATOR_VISHNUAI_TARGET_ARCH: ${{ matrix.arch }}'
    );
    expect(releaseWorkflow).toContain('vishnuai-linux-package:');
    expect(releaseWorkflow).toContain('for arch in x64 arm64; do');
    expect(releaseWorkflow).toContain(
      'node scripts/package-vishnuai-release.mjs'
    );
    expect(releaseWorkflow).toContain('name: vishnuai-release-linux');
    const linuxJob = releaseWorkflow.split('\n  vishnuai-linux-package:')[1].split('\n  candidate-ready:')[0];
    const install = linuxJob.indexOf('pnpm install --filter @vishnucreator/daemon --frozen-lockfile --ignore-scripts');
    expect(linuxJob).toContain('uses: pnpm/action-setup@v4');
    expect(install).toBeGreaterThan(0);
    expect(install).toBeLessThan(linuxJob.indexOf('node scripts/package-vishnuai-release.mjs'));
  });

  it('invalidates the Desktop cache when Creator Runtime releases change', () => {
    expect(releaseWorkflow).toContain(
      "'apps/desktop/scripts/creator-runtime-releases.mjs'"
    );
    expect(releaseWorkflow).toContain(
      "'apps/desktop/packaging/daemon-runtime/pnpm-lock.yaml'"
    );
  });

  it('restores reusable tools and caches the version-bound Chromium download', () => {
    expect(releaseWorkflow).toContain(
      'ELECTRON_CACHE: ${{ github.workspace }}/apps/desktop/.cache/electron'
    );
    expect(releaseWorkflow.indexOf('key: desktop-tools-')).toBeLessThan(
      releaseWorkflow.indexOf('run: pnpm install --frozen-lockfile')
    );
    expect(releaseWorkflow).toContain(
      'restore-keys: |\n            desktop-tools-${{ runner.os }}-${{ matrix.arch }}-'
    );
    expect(releaseWorkflow).toContain(
      'restore-keys: |\n            codex-runtime-${{ runner.os }}-${{ matrix.arch }}-'
    );
    expect(releaseWorkflow).toContain(
      'path: .runtime/vendor/stickman-runtime/${{ matrix.platform }}-${{ matrix.arch }}'
    );
    expect(releaseWorkflow).toContain(
      "key: stickman-browser-${{ runner.os }}-${{ matrix.arch }}-${{ hashFiles('apps/desktop/scripts/prepare-stickman-runtime.mjs') }}"
    );
  });

  it('uploads compressed release archives without recompressing them', () => {
    expect(releaseWorkflow.match(/compression-level: 0/g)).toHaveLength(3);
  });
});
