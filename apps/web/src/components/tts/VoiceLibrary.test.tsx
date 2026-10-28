import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../i18n/LanguageProvider.js';
import { VoiceLibrary, type VoiceLibraryItem } from './VoiceLibrary.js';

describe('VoiceLibrary', () => {
  const sampleVoice: VoiceLibraryItem = {
    id: 'voice-custom-1',
    name: 'Khmer Female Narrator',
    prompt: 'Warm storytelling female voice in Khmer',
    duration: 3.5,
    createdAt: '2026-10-28T10:00:00Z',
    audioUrl: 'blob:http://localhost/voice-custom-1.wav',
    consent: true
  };

  function createMockService(voices: VoiceLibraryItem[] = [sampleVoice]) {
    return {
      listVoiceDesigns: vi.fn(async () => ({ voices: [...voices] })),
      saveVoiceDesign: vi.fn(async ({ prompt, consent }: { prompt: string; consent: boolean }) => ({
        id: `voice-${Date.now()}`,
        name: prompt.slice(0, 20),
        prompt,
        duration: 2.0,
        createdAt: new Date().toISOString(),
        audioUrl: 'blob:http://localhost/new-voice.wav',
        consent
      })),
      deleteVoiceDesign: vi.fn(async () => {}),
      previewVoiceDesign: vi.fn(async () => ({ blob: new Blob(['fake audio'], { type: 'audio/wav' }) }))
    };
  }

  beforeEach(() => {
    vi.restoreAllMocks();
    window.HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
    window.HTMLMediaElement.prototype.pause = vi.fn();
    window.URL.createObjectURL = vi.fn(() => 'blob:mock-preview-url');
    window.URL.revokeObjectURL = vi.fn();
  });

  it('renders voices from listVoiceDesigns', async () => {
    const service = createMockService();
    render(
      <LanguageProvider initialPreference="en-US">
        <VoiceLibrary service={service} />
      </LanguageProvider>
    );

    expect(await screen.findByText('Khmer Female Narrator')).toBeInTheDocument();
    expect(screen.getByText('Warm storytelling female voice in Khmer')).toBeInTheDocument();
    expect(service.listVoiceDesigns).toHaveBeenCalledOnce();
  });

  it('triggers preview when play button is clicked', async () => {
    const service = createMockService();
    render(
      <LanguageProvider initialPreference="en-US">
        <VoiceLibrary service={service} />
      </LanguageProvider>
    );

    const playBtn = await screen.findByRole('button', { name: /Preview|试听/i });
    await userEvent.click(playBtn);

    await waitFor(() => {
      expect(service.previewVoiceDesign).toHaveBeenCalledWith({ voiceId: 'voice-custom-1' });
    });
  });

  it('opens new voice dialog and enforces consent before saving', async () => {
    const service = createMockService();
    const onSaved = vi.fn();
    render(
      <LanguageProvider initialPreference="en-US">
        <VoiceLibrary service={service} onVoiceSaved={onSaved} />
      </LanguageProvider>
    );

    await screen.findByText('Khmer Female Narrator');
    const newBtn = screen.getByRole('button', { name: /Create Voice|创建音色/i });
    await userEvent.click(newBtn);

    // Dialog should be open
    const promptInput = screen.getByRole('textbox');
    await userEvent.type(promptInput, 'Energetic Khmer News Reader');

    const saveBtn = screen.getByRole('button', { name: /Save Voice|保存音色/i });
    // Without consent checkbox checked, save should be disabled
    expect(saveBtn).toBeDisabled();

    // Check consent checkbox
    const consentCheckbox = screen.getByRole('checkbox');
    await userEvent.click(consentCheckbox);
    expect(saveBtn).toBeEnabled();

    // Click save
    await userEvent.click(saveBtn);

    await waitFor(() => {
      expect(service.saveVoiceDesign).toHaveBeenCalledWith({
        prompt: 'Energetic Khmer News Reader',
        consent: true
      });
      expect(onSaved).toHaveBeenCalled();
    });
  });

  it('deletes a voice item upon confirmation', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const service = createMockService();
    const onDeleted = vi.fn();
    render(
      <LanguageProvider initialPreference="en-US">
        <VoiceLibrary service={service} onVoiceDeleted={onDeleted} />
      </LanguageProvider>
    );

    await screen.findByText('Khmer Female Narrator');
    const deleteBtn = screen.getByRole('button', { name: /Delete|删除/i });
    await userEvent.click(deleteBtn);

    await waitFor(() => {
      expect(service.deleteVoiceDesign).toHaveBeenCalledWith({ voiceId: 'voice-custom-1' });
      expect(onDeleted).toHaveBeenCalledWith('voice-custom-1');
    });
  });
});
