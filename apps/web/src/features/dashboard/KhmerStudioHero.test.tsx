import { render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import type { DubEngineRuntimeStatus } from '@vishnucreator/protocol';
import { describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../i18n/LanguageProvider.js';
import { KhmerStudioHero } from './KhmerStudioHero.js';

const base = { enabled: true, mode: 'local' as const, engineDir: 'D:/repo/services/dub-engine' };

function renderHero(service: Parameters<typeof KhmerStudioHero>[0]['service']) {
  const onTranslateAndDub = vi.fn();
  const onKhmerVoices = vi.fn();
  render(
    <LanguageProvider initialPreference="en-US">
      <KhmerStudioHero service={service} onTranslateAndDub={onTranslateAndDub} onKhmerVoices={onKhmerVoices} />
    </LanguageProvider>
  );
  return { onTranslateAndDub, onKhmerVoices };
}

describe('KhmerStudioHero', () => {
  it('opens Khmer translation and voices, and labels voice cloning as not set up', async () => {
    const user = userEvent.setup();
    const { onTranslateAndDub, onKhmerVoices } = renderHero({ getDubEngineStatus: vi.fn(async () => ({ ...base, state: 'ready' as const })) });

    expect(screen.getByRole('heading', { name: 'Khmer Dub Studio' })).toBeInTheDocument();
    expect(screen.getByText('បកប្រែ និងបញ្ចូលសំឡេងវីដេអូជាភាសាខ្មែរ')).toBeInTheDocument();
    expect(screen.getByText('Voice cloning (VoxCPM2): model not set up yet')).toBeInTheDocument();
    expect(await screen.findByText('Local dub engine: ready')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Start engine' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Translate & dub to Khmer/ }));
    await user.click(screen.getByRole('button', { name: /Khmer voices/ }));
    expect(onTranslateAndDub).toHaveBeenCalledOnce();
    expect(onKhmerVoices).toHaveBeenCalledOnce();
  });

  it('explains a missing engine without offering a start that cannot work', async () => {
    renderHero({
      getDubEngineStatus: vi.fn(async () => ({ ...base, state: 'not_installed' as const, message: 'not installed' })),
      startDubEngine: vi.fn()
    });

    expect(await screen.findByText('Local dub engine: not installed')).toBeInTheDocument();
    expect(screen.getByText(/Khmer Edge voices still work/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Start engine' })).not.toBeInTheDocument();
  });

  it('starts an installed engine and follows it from starting to ready', async () => {
    const user = userEvent.setup();
    let state: DubEngineRuntimeStatus['state'] = 'off';
    const getDubEngineStatus = vi.fn(async () => ({ ...base, state }));
    const startDubEngine = vi.fn(async () => { state = 'starting'; return { ...base, state }; });
    renderHero({ getDubEngineStatus, startDubEngine });

    await user.click(await screen.findByRole('button', { name: 'Start engine' }));
    expect(startDubEngine).toHaveBeenCalledOnce();
    expect(await screen.findByText('Local dub engine: starting')).toBeInTheDocument();

    state = 'ready';
    await waitFor(() => expect(screen.getByText('Local dub engine: ready')).toBeInTheDocument(), { timeout: 4_000 });
  });

  it('shows a failed start with its reason and lets the user retry', async () => {
    renderHero({
      getDubEngineStatus: vi.fn(async () => ({ ...base, state: 'error' as const, message: 'Engine did not become healthy' })),
      startDubEngine: vi.fn()
    });

    expect(await screen.findByText('Local dub engine: failed to start')).toBeInTheDocument();
    expect(screen.getByText('Engine did not become healthy')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start engine' })).toBeInTheDocument();
  });
});
