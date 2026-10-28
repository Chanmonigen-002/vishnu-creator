import { useCallback, useEffect, useState } from 'react';
import {
  ArrowLeft,
  AudioLines,
  CheckCircle2,
  CircleAlert,
  LoaderCircle,
  Mic2,
  Play,
  Square,
  Settings,
  Sparkles,
  Volume2,
  ExternalLink
} from 'lucide-react';
import type { DubEngineRuntimeStatus } from '@vishnucreator/protocol';
import { useLocalizedCopy } from '../../i18n/useLocalizedCopy.js';
import type { CreatorServicesSettingsService } from '../../services/creator-services-service.js';
import './khmer-voices.css';

export type KhmerVoiceInfo = {
  id: string;
  name: string;
  nativeName: string;
  gender: 'female' | 'male';
  provider: 'edge-tts' | 'azure' | 'voxcpm';
  recommended?: boolean;
  sampleText: string;
  description: string;
  status: 'ready' | 'needs_config' | 'pending_weights';
};

export const KHMER_VOICES_CATALOG: KhmerVoiceInfo[] = [
  {
    id: 'km-KH-SreymomNeural',
    name: 'Sreymom',
    nativeName: 'ស្រីមុំ',
    gender: 'female',
    provider: 'edge-tts',
    recommended: true,
    sampleText: 'សួស្តី! ខ្ញុំជាសំឡេងស្រីមុំ ភាសាខ្មែរ សម្រាប់បញ្ចូលក្នុងវីដេអូ និងការអានព័ត៌មាន។',
    description: 'សំឡេងស្រីច្បាស់ ពិរោះ ធម្មជាតិ ស័ក្តិសមសម្រាប់អានព័ត៌មាន ភាពយន្តឯកសារ និងវីដេអូខ្លី។',
    status: 'ready'
  },
  {
    id: 'km-KH-PisethNeural',
    name: 'Piseth',
    nativeName: 'ពិសិដ្ឋ',
    gender: 'male',
    provider: 'edge-tts',
    sampleText: 'សួស្តី! ខ្ញុំជាសំឡេងពិសិដ្ឋ ភាសាខ្មែរ សម្រាប់អានអត្ថបទ និងបញ្ចូលសំឡេងរឿង។',
    description: 'សំឡេងប្រុសមាំ ច្បាស់ និងមានទំនុកចិត្ត ស័ក្តិសមសម្រាប់អានអត្ថបទ និងបញ្ចូលសំឡេងរឿង។',
    status: 'ready'
  }
];

export function KhmerVoicesView(props: {
  creatorServicesService?: CreatorServicesSettingsService | null;
  onBackToDashboard(): void;
  onUseVoice(voiceCode: string, workspace?: 'video-translation' | 'smart-dubbing'): void;
  onOpenSettings?(tab?: string, section?: string): void;
}) {
  const l = useLocalizedCopy();
  const [azureConfigured, setAzureConfigured] = useState<boolean | null>(null);
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
  const [engineStatus, setEngineStatus] = useState<DubEngineRuntimeStatus>();
  const [engineStarting, setEngineStarting] = useState(false);

  const getStatus = props.creatorServicesService?.getDubEngineStatus;
  const startEngine = props.creatorServicesService?.startDubEngine;
  const stopEngine = props.creatorServicesService?.stopDubEngine;

  const refreshEngine = useCallback(async () => {
    if (getStatus === undefined) return;
    try {
      const status = await getStatus();
      setEngineStatus(status);
    } catch {
      // Ignore network errors on polling
    }
  }, [getStatus]);

  // Load Azure config status and dub engine status
  useEffect(() => {
    let active = true;
    void refreshEngine();

    if (props.creatorServicesService?.getConfig) {
      props.creatorServicesService.getConfig().then(resp => {
        if (!active) return;
        const azureKey = (resp.config?.tts as Record<string, unknown> | undefined)?.azure as Record<string, unknown> | undefined;
        setAzureConfigured(typeof azureKey?.apiKey === 'string' && azureKey.apiKey.trim().length > 0);
      }).catch(() => {
        if (active) setAzureConfigured(false);
      });
    }

    return () => {
      active = false;
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, [props.creatorServicesService, refreshEngine]);

  const togglePlaySample = (voice: KhmerVoiceInfo) => {
    if (playingVoiceId === voice.id) {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      setPlayingVoiceId(null);
      return;
    }

    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(voice.sampleText);
      utterance.lang = 'km-KH';
      utterance.rate = 1.0;
      utterance.onend = () => setPlayingVoiceId(null);
      utterance.onerror = () => setPlayingVoiceId(null);
      setPlayingVoiceId(voice.id);
      window.speechSynthesis.speak(utterance);
    } else {
      setPlayingVoiceId(voice.id);
      setTimeout(() => setPlayingVoiceId(null), 3000);
    }
  };

  const handleStartEngine = async () => {
    if (!startEngine) return;
    setEngineStarting(true);
    try {
      const updated = await startEngine();
      setEngineStatus(updated);
    } finally {
      setEngineStarting(false);
    }
  };

  const handleStopEngine = async () => {
    if (!stopEngine) return;
    try {
      const updated = await stopEngine();
      setEngineStatus(updated);
    } catch {
      // Ignore
    }
  };

  return (
    <div className="khmer-voices-view" data-testid="khmer-voices-view">
      <header className="khmer-voices-header">
        <button
          type="button"
          className="khmer-voices-back-btn"
          onClick={props.onBackToDashboard}
          aria-label={l('返回工作台', 'Back to Dashboard')}
        >
          <ArrowLeft size={16} />
          <span>{l('返回工作台', 'Back to Dashboard')}</span>
        </button>
        <div className="khmer-voices-title-block">
          <div className="khmer-voices-title-badge">
            <AudioLines size={18} className="khmer-voices-icon" />
            <span lang="km">ភាសាខ្មែរ</span>
          </div>
          <h1 className="khmer-voices-title">{l('高棉语音色库', 'Khmer Voice Studio')}</h1>
          <p className="khmer-voices-subtitle">
            {l(
              '一站式管理高棉语配音声色：Edge-TTS 零配置即开即用、Azure 高保真云端神经网络、以及 VoxCPM2 本地克隆。',
              'Catalog of Khmer spoken voices for video dubbing and narration: Edge-TTS zero GPU built-in, Azure Cognitive Speech, and VoxCPM2 cloning.'
            )}
          </p>
        </div>
      </header>

      <main className="khmer-voices-content">
        {/* Section 1: Edge-TTS Built-in Voices */}
        <section className="khmer-voices-section" aria-labelledby="section-built-in">
          <div className="khmer-voices-section-header">
            <div>
              <h2 id="section-built-in" className="khmer-voices-section-title">
                {l('内置开箱即用音色 (Edge-TTS · 零配置免 GPU)', 'Available Now — Edge-TTS (Built-in, Zero GPU)')}
              </h2>
              <p className="khmer-voices-section-desc">
                {l(
                  '无需 GPU 算力，无需配置密钥，开箱即用，支持高质量高棉语自然语音合成。',
                  'Free and ready to use without API keys or GPU. Natural Khmer narration.'
                )}
              </p>
            </div>
            <span className="khmer-voices-ready-tag">
              <CheckCircle2 size={14} />
              {l('已就绪 · 随时可用', 'Ready')}
            </span>
          </div>

          <div className="khmer-voices-grid">
            {KHMER_VOICES_CATALOG.map(voice => (
              <div key={voice.id} className="khmer-voice-card" data-testid={`voice-card-${voice.id}`}>
                <div className="khmer-voice-card-top">
                  <div className="khmer-voice-avatar">
                    <Mic2 size={20} />
                  </div>
                  <div className="khmer-voice-meta">
                    <div className="khmer-voice-name-row">
                      <strong className="khmer-voice-name">{voice.name} ({voice.nativeName})</strong>
                      {voice.recommended ? (
                        <span className="khmer-voice-badge recommended">{l('推荐', 'Recommended')}</span>
                      ) : null}
                    </div>
                    <span className="khmer-voice-id">{voice.id}</span>
                  </div>
                </div>

                <div className="khmer-voice-tags">
                  <span className="khmer-voice-pill">{voice.gender === 'female' ? l('女声', 'Female', 'ស្រី') : l('男声', 'Male', 'ប្រុស')}</span>
                  <span className="khmer-voice-pill">Edge-TTS</span>
                  <span className="khmer-voice-pill">{l('自然口语', 'Natural')}</span>
                </div>

                <p className="khmer-voice-desc">{voice.description}</p>

                <div className="khmer-voice-sample-box">
                  <span className="khmer-voice-sample-label">{l('试听样句：', 'Sample text:')}</span>
                  <p className="khmer-voice-sample-text" lang="km">{voice.sampleText}</p>
                </div>

                <div className="khmer-voice-card-actions">
                  <button
                    type="button"
                    className="khmer-voice-listen-btn"
                    onClick={() => togglePlaySample(voice)}
                    data-testid={`listen-btn-${voice.id}`}
                  >
                    {playingVoiceId === voice.id ? (
                      <>
                        <Square size={14} />
                        <span>{l('停止试听', 'Stop')}</span>
                      </>
                    ) : (
                      <>
                        <Volume2 size={14} />
                        <span>{l('试听音色', 'Play sample')}</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    className="khmer-voice-use-btn"
                    onClick={() => props.onUseVoice(voice.id, 'video-translation')}
                    data-testid={`use-btn-${voice.id}`}
                  >
                    <Sparkles size={14} />
                    <span>{l('用于视频翻译配音', 'Use in Video Translation')}</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Section 2: Azure Cognitive Speech Service */}
        <section className="khmer-voices-section" aria-labelledby="section-azure">
          <div className="khmer-voices-section-header">
            <div>
              <h2 id="section-azure" className="khmer-voices-section-title">
                {l('微软 Azure 神经网络语音 (Azure Speech)', 'Azure Speech Service (Khmer Neural)')}
              </h2>
              <p className="khmer-voices-section-desc">
                {l(
                  '高精度 Azure 神经网络语音：km-KH-SreymomNeural 和 km-KH-PisethNeural，提供高码率与超低时延。',
                  'High fidelity Microsoft Azure Neural voices for production broadcasts.'
                )}
              </p>
            </div>
            {azureConfigured ? (
              <span className="khmer-voices-ready-tag">
                <CheckCircle2 size={14} />
                {l('已配置 API Key', 'Configured')}
              </span>
            ) : (
              <span className="khmer-voices-unconfigured-tag">
                <CircleAlert size={14} />
                {l('尚未配置', 'Not configured')}
              </span>
            )}
          </div>

          <div className="khmer-azure-card">
            <div className="khmer-azure-info">
              <div className="khmer-azure-badge">Azure Cognitive Services</div>
              <h3>Microsoft Azure Khmer TTS</h3>
              <p>
                {azureConfigured
                  ? l('已成功在系统配置中检测到 Azure 语音服务凭据，随时可在视频翻译配音中使用。', 'Azure Speech credentials configured. Ready for translation & dubbing.')
                  : l('尚未配置 Azure API Key。在设置中填入东南亚 (southeastasia) 或全球区域密钥即可启用。', 'Azure Speech API key is not configured. Configure in AI Services Settings to enable.')}
              </p>
            </div>
            <button
              type="button"
              className="khmer-azure-btn"
              onClick={() => props.onOpenSettings?.('ai-services', 'tts')}
            >
              <Settings size={15} />
              <span>{azureConfigured ? l('管理 Azure 配置', 'Manage in Settings') : l('前往设置配置 Azure', 'Configure in Settings')}</span>
            </button>
          </div>
        </section>

        {/* Section 3: VoxCPM2 Voice Cloning & Design */}
        <section className="khmer-voices-section" aria-labelledby="section-voxcpm">
          <div className="khmer-voices-section-header">
            <div>
              <h2 id="section-voxcpm" className="khmer-voices-section-title">
                {l('声音克隆与音色定制 (VoxCPM2 声学模型)', 'Voice Cloning & Timbre Design (VoxCPM2)')}
              </h2>
              <p className="khmer-voices-section-desc">
                {l(
                  '基于 VoxCPM2 本地高棉语音色微调模型，支持 3-10 秒音频零样本声音克隆与提示词设计音色。',
                  'Zero-shot voice cloning from 3-10s audio reference and text-prompt timbre design.'
                )}
              </p>
            </div>
            <span className="khmer-voices-pending-tag" data-testid="voxcpm-honest-status">
              <CircleAlert size={14} />
              {l('模型尚未配置 (Phase 5 / T5.1 待下载权重)', 'Weights not set up yet (T5.1)')}
            </span>
          </div>

          <div className="khmer-voxcpm-grid">
            <div className="khmer-voxcpm-card">
              <h4>🎯 {l('零样本声音克隆 (Zero-Shot Clone)', 'Zero-Shot Voice Cloning')}</h4>
              <p>
                {l(
                  '上传一段 3-10 秒清晰的人声样本，即可提取并复刻音色，用于高棉语全篇配音。',
                  'Upload 3-10 seconds of speech reference to clone the timbre for Khmer video dubbing.'
                )}
              </p>
              <div className="khmer-voxcpm-status-note">
                <span>{l('状态：待下载模型权重 (T5.1)', 'Status: Requires model weights (T5.1)')}</span>
              </div>
            </div>

            <div className="khmer-voxcpm-card">
              <h4>🎨 {l('提示词音色设计 (Prompt Timbre Design)', 'Prompt Voice Design')}</h4>
              <p>
                {l(
                  '通过自然语言描述音色特征（例如“温暖慈祥的高棉语长辈女声”），由 AI 生成全新音色。',
                  'Describe desired voice characteristics to generate unique bespoke Khmer vocal timbres.'
                )}
              </p>
              <div className="khmer-voxcpm-status-note">
                <span>{l('状态：待下载模型权重 (T5.1)', 'Status: Requires model weights (T5.1)')}</span>
              </div>
            </div>
          </div>
        </section>

        {/* Section 4: Dub Engine Runtime Controller */}
        {getStatus !== undefined ? (
          <section className="khmer-voices-section" aria-labelledby="section-engine">
            <div className="khmer-voices-section-header">
              <div>
                <h2 id="section-engine" className="khmer-voices-section-title">
                  {l('本地配音引擎状态 (Dub Engine Runtime)', 'Local Dub Engine Status')}
                </h2>
                <p className="khmer-voices-section-desc">
                  {l(
                    '管理本地 FastWhisper ASR、時間對齊 (Time-Sync) 与音频合并服务。',
                    'Controls the local dubbing engine process on port 8765.'
                  )}
                </p>
              </div>
              <span className={`khmer-voices-engine-badge state-${engineStatus?.state ?? 'off'}`}>
                {engineStatus?.state === 'ready' ? (
                  <>
                    <CheckCircle2 size={14} />
                    {l('引擎运行中', 'Engine Ready')}
                  </>
                ) : engineStarting ? (
                  <>
                    <LoaderCircle size={14} className="khmer-studio-spin" />
                    {l('正在启动…', 'Starting…')}
                  </>
                ) : (
                  <>
                    <CircleAlert size={14} />
                    {l('引擎已停止', 'Engine Off')}
                  </>
                )}
              </span>
            </div>

            <div className="khmer-engine-card">
              <div className="khmer-engine-info">
                <strong>{l('Dub Engine 后台服务', 'Dub Engine Service')}</strong>
                <span>
                  {engineStatus?.state === 'ready'
                    ? l('服务正常监听中 (http://127.0.0.1:8765)，支持字幕整理与时间对齐。', 'Listening on http://127.0.0.1:8765 with time-sync enabled.')
                    : l('引擎当前处于待机状态。启动后可加速视频字幕提取与智能时间轴微调。', 'Engine is idle. Start it to enable automatic time synchronization.')}
                </span>
              </div>
              <div className="khmer-engine-controls">
                {engineStatus?.state === 'ready' ? (
                  <button type="button" className="khmer-engine-stop-btn" onClick={handleStopEngine}>
                    <Square size={14} />
                    <span>{l('停止引擎', 'Stop Engine')}</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    className="khmer-engine-start-btn"
                    disabled={engineStarting}
                    onClick={handleStartEngine}
                  >
                    <Play size={14} />
                    <span>{engineStarting ? l('正在启动…', 'Starting…') : l('启动引擎', 'Start Engine')}</span>
                  </button>
                )}
              </div>
            </div>
          </section>
        ) : null}
      </main>
    </div>
  );
}
