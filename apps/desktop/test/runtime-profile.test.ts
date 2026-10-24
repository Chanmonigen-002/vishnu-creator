import { describe, expect, it } from 'vitest';
import { resolveDesktopUserDataPath } from '../src/main/runtime-profile.js';

describe('Desktop runtime profile', () => {
  it('keeps the installed userData directory unchanged', () => {
    expect(resolveDesktopUserDataPath(
      '/Users/demo/Library/Application Support/VishnuCreator',
      false
    )).toBe('/Users/demo/Library/Application Support/VishnuCreator');
  });

  it('isolates development Electron state from the installed app', () => {
    expect(resolveDesktopUserDataPath(
      '/Users/demo/Library/Application Support/VishnuCreator',
      true
    )).toBe('/Users/demo/Library/Application Support/VishnuCreator Development');
  });
});
