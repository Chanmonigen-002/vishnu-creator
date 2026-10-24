import { afterEach, describe, expect, it } from 'vitest';
import { readJsonFromStorage } from './browser-storage.js';

describe('browser storage', () => {
  afterEach(() => {
    window.localStorage.clear();
  });

  it('returns null and removes corrupt JSON values', () => {
    window.localStorage.setItem('vishnucreator.web.connection.v1', '{bad json');

    expect(readJsonFromStorage('vishnucreator.web.connection.v1')).toBeNull();
    expect(window.localStorage.getItem('vishnucreator.web.connection.v1')).toBeNull();
  });
});
