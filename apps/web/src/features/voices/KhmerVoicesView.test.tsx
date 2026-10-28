import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { KhmerVoicesView, KHMER_VOICES_CATALOG } from './KhmerVoicesView.js';
import { LanguageProvider } from '../../i18n/LanguageProvider.js';

describe('KhmerVoicesView', () => {
  const baseService = {
    getDubEngineStatus: vi.fn().mockResolvedValue({ state: 'ready', port: 8765 }),
    startDubEngine: vi.fn().mockResolvedValue({ state: 'ready', port: 8765 }),
    stopDubEngine: vi.fn().mockResolvedValue({ state: 'off', port: 8765 }),
    getConfig: vi.fn().mockResolvedValue({
      config: {
        tts: {
          azure: { apiKey: 'test-azure-key' }
        }
      }
    })
  } as any;

  function renderView(overrides: Partial<Parameters<typeof KhmerVoicesView>[0]> = {}, lang = 'en-US') {
    const props = {
      creatorServicesService: baseService,
      onBackToDashboard: vi.fn(),
      onUseVoice: vi.fn(),
      onOpenSettings: vi.fn(),
      ...overrides
    };

    const result = render(
      <LanguageProvider initialPreference={lang as any}>
        <KhmerVoicesView {...props} />
      </LanguageProvider>
    );

    return { ...result, props };
  }

  it('renders all catalog voices including Sreymom and Piseth', () => {
    renderView();

    expect(screen.getAllByText(/Sreymom/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Piseth/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByTestId('voice-card-km-KH-SreymomNeural')).toBeInTheDocument();
    expect(screen.getByTestId('voice-card-km-KH-PisethNeural')).toBeInTheDocument();
  });

  it('displays honest VoxCPM2 availability without fake completion', () => {
    renderView();

    const statusNote = screen.getByTestId('voxcpm-honest-status');
    expect(statusNote).toBeInTheDocument();
    expect(statusNote.textContent).toMatch(/T5\.1/);
  });

  it('invokes onUseVoice when clicking use voice button', () => {
    const { props } = renderView();

    const useBtn = screen.getByTestId('use-btn-km-KH-SreymomNeural');
    fireEvent.click(useBtn);

    expect(props.onUseVoice).toHaveBeenCalledWith('km-KH-SreymomNeural', 'video-translation');
  });

  it('navigates back to dashboard when clicking back button', () => {
    const { props } = renderView();

    const backBtn = screen.getByLabelText(/Back to Dashboard/i);
    fireEvent.click(backBtn);

    expect(props.onBackToDashboard).toHaveBeenCalledTimes(1);
  });

  it('detects Azure configuration and allows opening settings', async () => {
    const { props } = renderView();

    await waitFor(() => {
      expect(screen.getAllByText(/Configured/i).length).toBeGreaterThanOrEqual(1);
    });

    const settingsBtn = screen.getByRole('button', { name: /Settings/i });
    fireEvent.click(settingsBtn);

    expect(props.onOpenSettings).toHaveBeenCalledWith('ai-services', 'tts');
  });

  it('interacts with Dub Engine status and start/stop controls', async () => {
    const { props } = renderView();

    await waitFor(() => {
      expect(screen.getByText(/Engine Ready/i)).toBeInTheDocument();
    });

    const stopBtn = screen.getByRole('button', { name: /Stop Engine/i });
    fireEvent.click(stopBtn);

    expect(props.creatorServicesService?.stopDubEngine).toHaveBeenCalled();
  });

  it('allows initiating VoxCPM2 weights download when uninstalled', async () => {
    const downloadDubModel = vi.fn().mockResolvedValue({
      modelId: 'voxcpm2-khmer',
      status: 'downloading',
      bytesDownloaded: 100000,
      totalBytes: 1240000000,
      percent: 0.1,
      speedBytesPerSec: 15000000
    });
    const listDubModels = vi.fn().mockResolvedValue({
      modelsRoot: 'D:\\.vishnucreator\\models',
      availableDiskFreeBytes: 50000000000,
      models: [
        {
          id: 'voxcpm2-khmer',
          name: 'VoxCPM2 Khmer Voice Model',
          category: 'tts',
          description: 'VoxCPM2 model',
          sizeBytes: 1240000000,
          expectedSha256: 'abc',
          sourceUrl: 'https://example.com',
          filename: 'model.safetensors',
          targetSubdir: 'voxcpm2',
          recommendedForTier: ['T1'],
          installed: false
        }
      ]
    });

    const { props } = renderView({
      creatorServicesService: {
        ...baseService,
        listDubModels,
        downloadDubModel
      }
    });

    await waitFor(() => {
      expect(screen.getByTestId('download-voxcpm-btn')).toBeInTheDocument();
    });

    const downloadBtn = screen.getByTestId('download-voxcpm-btn');
    fireEvent.click(downloadBtn);

    await waitFor(() => {
      expect(downloadDubModel).toHaveBeenCalledWith({ modelId: 'voxcpm2-khmer' });
    });
  });

  it('renders clone and design actions when VoxCPM2 weights are installed', async () => {
    const listDubModels = vi.fn().mockResolvedValue({
      modelsRoot: 'D:\\.vishnucreator\\models',
      availableDiskFreeBytes: 50000000000,
      models: [
        {
          id: 'voxcpm2-khmer',
          name: 'VoxCPM2 Khmer Voice Model',
          category: 'tts',
          description: 'VoxCPM2 model',
          sizeBytes: 1240000000,
          expectedSha256: 'abc',
          sourceUrl: 'https://example.com',
          filename: 'model.safetensors',
          targetSubdir: 'voxcpm2',
          recommendedForTier: ['T1'],
          installed: true
        }
      ]
    });

    renderView({
      creatorServicesService: {
        ...baseService,
        listDubModels
      }
    });

    await waitFor(() => {
      expect(screen.getByTestId('open-clone-modal-btn')).toBeInTheDocument();
      expect(screen.getByTestId('open-design-modal-btn')).toBeInTheDocument();
    });

    // Opening clone modal
    fireEvent.click(screen.getByTestId('open-clone-modal-btn'));
    expect(screen.getAllByText(/Zero-Shot Voice Cloning/i).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText(/Voice Reference Audio/i)).toBeInTheDocument();

    // Closing modal
    const closeBtn = screen.getByLabelText(/Close/i);
    fireEvent.click(closeBtn);

    // Opening design modal
    fireEvent.click(screen.getByTestId('open-design-modal-btn'));
    expect(screen.getAllByText(/Prompt Timbre Design/i).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText(/Voice Description Prompt/i)).toBeInTheDocument();
  });
});
