import { describe, expect, it } from 'vitest';
import { createVishnuCreatorServicesCapabilities } from '../../src/creator/vishnu/capabilities.js';

describe('VishnuAI transcription capabilities', () => {
  it('offers WhisperKit only on Apple Silicon macOS', () => {
    const capabilities = createVishnuCreatorServicesCapabilities('darwin', 'arm64');

    expect(capabilities.transcription.providers).toEqual(expect.arrayContaining([
      expect.objectContaining({
        provider: 'openai',
        kind: 'cloud',
        available: true
      }),
      expect.objectContaining({
        provider: 'aliyun',
        kind: 'cloud',
        available: true
      }),
      expect.objectContaining({
        provider: 'volcengine',
        kind: 'cloud',
        available: true
      }),
      expect.objectContaining({
        provider: 'whisperkit',
        kind: 'local',
        available: true,
        models: ['large-v2']
      }),
      expect.objectContaining({
        provider: 'faster-whisper',
        available: false
      }),
      expect.objectContaining({
        provider: 'whisper.cpp',
        available: false
      })
    ]));
  });

  it('offers Whisper.cpp on Windows x64 while keeping unsupported local providers disabled', () => {
    const capabilities = createVishnuCreatorServicesCapabilities('win32', 'x64');
    const localProviders = capabilities.transcription.providers.filter(
      provider => provider.kind === 'local'
    );

    expect(localProviders.filter(provider => provider.available).map(provider => provider.provider)).toEqual(['whisper.cpp']);
    expect(localProviders).toEqual(expect.arrayContaining([
      expect.objectContaining({
        provider: 'faster-whisper',
        available: false,
        unavailableReason: 'installer_unavailable'
      }),
      expect.objectContaining({
        provider: 'whisper.cpp',
        available: true,
        gpuAcceleration: false,
        models: ['tiny', 'medium', 'large-v2', 'large-v3-turbo'],
        modelDetails: expect.objectContaining({
          'large-v3-turbo': { diskBytes: 1624555275 }
        })
      }),
      expect.objectContaining({
        provider: 'whisperkit',
        available: false,
        unavailableReason: 'unsupported_platform'
      })
    ]));
  });

  it('keeps Whisper.cpp unavailable on unsupported Windows architectures', () => {
    const provider = createVishnuCreatorServicesCapabilities('win32', 'arm64')
      .transcription.providers.find(candidate => candidate.provider === 'whisper.cpp');

    expect(provider).toMatchObject({
      available: false,
      unavailableReason: 'unsupported_platform'
    });
  });
});
