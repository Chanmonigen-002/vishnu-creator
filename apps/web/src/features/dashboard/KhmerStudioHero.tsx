import { useCallback, useEffect, useState } from 'react';
import type { DubEngineRuntimeStatus } from '@vishnucreator/protocol';
import { ArrowRight, AudioLines, CircleAlert, CircleCheck, LoaderCircle, Mic2, Play, PowerOff } from 'lucide-react';
import { useLocalizedCopy } from '../../i18n/useLocalizedCopy.js';
import type { CreatorServicesSettingsService } from '../../services/creator-services-service.js';

type EngineService = Pick<CreatorServicesSettingsService, 'getDubEngineStatus' | 'startDubEngine'>;

/**
 * Khmer Dub Studio (T6.5/T6.6/T6.7): the combined pipeline built from the
 * ZastTranslate-style dub engine and VoxCPM, shown first on the dashboard.
 */
export function KhmerStudioHero(props: {
  service: EngineService | null | undefined;
  onTranslateAndDub(): void;
  onKhmerVoices(): void;
}) {
  const l = useLocalizedCopy();
  const [status, setStatus] = useState<DubEngineRuntimeStatus>();
  const [statusError, setStatusError] = useState(false);
  const [starting, setStarting] = useState(false);
  const getStatus = props.service?.getDubEngineStatus;
  const startEngine = props.service?.startDubEngine;

  const refresh = useCallback(async () => {
    if (getStatus === undefined) return;
    try {
      setStatus(await getStatus());
      setStatusError(false);
    } catch {
      setStatusError(true);
    }
  }, [getStatus]);

  useEffect(() => {
    void refresh();
    // Settings or another window may have changed the engine meanwhile.
    const onFocus = () => { void refresh(); };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [refresh]);
  // While the engine boots, check again until it settles.
  useEffect(() => {
    if (status?.state !== 'starting') return;
    const timer = setInterval(() => { void refresh(); }, 2_000);
    return () => clearInterval(timer);
  }, [refresh, status?.state]);

  const start = async () => {
    if (startEngine === undefined) return;
    setStarting(true);
    try {
      setStatus(await startEngine());
      setStatusError(false);
    } catch {
      setStatusError(true);
    } finally {
      setStarting(false);
    }
  };

  const steps = [
    { label: l('语音识别与字幕整理', 'Speech recognition and subtitle cleanup'), engine: true },
    { label: l('高棉语翻译规则', 'Khmer translation rules'), engine: false },
    { label: l('配音对齐字幕时间', 'Timing synced to subtitles'), engine: true },
    { label: l('高棉语音色 Sreymom、Piseth', 'Khmer voices Sreymom and Piseth'), engine: false },
    { label: l('声音克隆 VoxCPM2：模型尚未配置', 'Voice cloning (VoxCPM2): model not set up yet'), engine: true, pending: true }
  ];

  return (
    <section className="khmer-studio" aria-labelledby="khmer-studio-title">
      <div className="khmer-studio-art" aria-hidden="true">
        <span>ក</span>
        <span>ខ្មែរ</span>
        <AudioLines size={42} strokeWidth={1.4} />
      </div>
      <div className="khmer-studio-body">
        <p className="khmer-studio-tagline" lang="km">បកប្រែ និងបញ្ចូលសំឡេងវីដេអូជាភាសាខ្មែរ</p>
        <h2 id="khmer-studio-title">{l('高棉语配音工作室', 'Khmer Dub Studio')}</h2>
        <p className="khmer-studio-description">
          {l(
            '粘贴视频链接，获得高棉语字幕和高棉语配音，在这台电脑上完成。',
            'Paste a video link and get Khmer subtitles and a Khmer voice, made on this computer.'
          )}
        </p>
        <div className="khmer-studio-actions">
          <button type="button" className="khmer-studio-primary" onClick={props.onTranslateAndDub}>
            {l('翻译并配音为高棉语', 'Translate & dub to Khmer')}
            <ArrowRight size={16} aria-hidden="true" />
          </button>
          <button type="button" className="khmer-studio-secondary" onClick={props.onKhmerVoices}>
            <Mic2 size={15} aria-hidden="true" />
            {l('高棉语音色', 'Khmer voices')}
          </button>
        </div>
        <ul className="khmer-studio-steps" aria-label={l('包含的功能', 'What it does')}>
          {steps.map(step => (
            <li key={step.label} data-pending={step.pending === true ? 'true' : undefined}>
              {step.pending ? <CircleAlert size={13} aria-hidden="true" /> : <CircleCheck size={13} aria-hidden="true" />}
              {step.label}
            </li>
          ))}
        </ul>
      </div>
      {getStatus === undefined ? null : (
        <EngineStatus status={status} error={statusError} starting={starting} onStart={startEngine === undefined ? undefined : start} />
      )}
    </section>
  );
}

function EngineStatus(props: {
  status: DubEngineRuntimeStatus | undefined;
  error: boolean;
  starting: boolean;
  onStart?: () => void;
}) {
  const l = useLocalizedCopy();
  const state = props.error ? 'error' : props.starting ? 'starting' : props.status?.state;
  const label = state === 'ready' ? l('本地配音引擎：已就绪', 'Local dub engine: ready')
    : state === 'starting' ? l('本地配音引擎：正在启动', 'Local dub engine: starting')
    : state === 'not_installed' ? l('本地配音引擎：未安装', 'Local dub engine: not installed')
    : state === 'error' ? l('本地配音引擎：启动失败', 'Local dub engine: failed to start')
    : state === 'off' ? l('本地配音引擎：已关闭', 'Local dub engine: off')
    : l('本地配音引擎：检查中', 'Local dub engine: checking');
  const Icon = state === 'ready' ? CircleCheck : state === 'starting' || state === undefined ? LoaderCircle : state === 'off' ? PowerOff : CircleAlert;
  const canStart = props.onStart !== undefined && (state === 'off' || state === 'error');
  return (
    <div className="khmer-studio-engine" data-state={state ?? 'checking'} role="status">
      <span className="khmer-studio-engine-label">
        <Icon size={15} aria-hidden="true" className={state === 'starting' || state === undefined ? 'khmer-studio-spin' : undefined} />
        {label}
      </span>
      {state === 'not_installed' || state === 'error' ? (
        <span className="khmer-studio-engine-note">
          {state === 'not_installed'
            ? l('高棉语 Edge 配音仍可使用；本地引擎用于字幕整理、时间对齐和声音克隆。', 'Khmer Edge voices still work; the local engine adds subtitle cleanup, timing sync and voice cloning.')
            : props.status?.message ?? l('无法连接本地配音引擎。', 'Could not reach the local dub engine.')}
        </span>
      ) : null}
      {canStart ? (
        <button type="button" onClick={props.onStart}>
          <Play size={13} aria-hidden="true" />
          {l('启动引擎', 'Start engine')}
        </button>
      ) : null}
    </div>
  );
}
