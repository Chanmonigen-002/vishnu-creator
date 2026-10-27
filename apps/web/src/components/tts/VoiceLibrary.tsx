import {
  AudioLines,
  CircleCheck,
  LoaderCircle,
  Mic2,
  Play,
  Plus,
  RefreshCw,
  Search,
  Star,
  Trash2,
  X
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocalizedCopy } from '../../i18n/useLocalizedCopy.js';
import type { CreatorServicesSettingsService } from '../../services/creator-services-service.js';
import { IssueList } from '../../features/issues/IssuePresenter.js';
import { usePageIssueState } from '../../features/issues/page-issue-state.js';
import './voice-library.css';

export type VoiceLibraryItem = {
  id: string;
  name: string;
  prompt: string;
  duration: number;
  createdAt: string;
  audioUrl: string;
  audioDataUrl?: string;
  consent: boolean;
};

export function VoiceLibrary(props: {
  service: Pick<CreatorServicesSettingsService, 'listVoiceDesigns' | 'saveVoiceDesign' | 'deleteVoiceDesign' | 'previewVoiceDesign'> | null;
  disabled?: boolean;
  onVoiceSaved?: (voice: VoiceLibraryItem) => void;
  onVoiceDeleted?: (voiceId: string) => void;
}) {
  const l = useLocalizedCopy();
  const [voices, setVoices] = useState<VoiceLibraryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [previewVoiceId, setPreviewVoiceId] = useState('');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [createPrompt, setCreatePrompt] = useState('');
  const [createConsent, setCreateConsent] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const audioRef = useRef<HTMLAudioElement>(null);
  const previewUrlRef = useRef('');
  const previewRequestRef = useRef(0);
  const pageIssues = usePageIssueState('voice-library');

  useEffect(() => {
    let active = true;
    if (props.service === null) {
      setVoices([]);
      setLoading(false);
      pageIssues.resolveOperation('voice-library.load');
      return () => { active = false; };
    }
    setLoading(true);
    void props.service.listVoiceDesigns()
      .then(response => {
        if (!active) return;
        setVoices(response.voices);
        pageIssues.resolveOperation('voice-library.load');
      })
      .catch(cause => {
        if (active) {
          setVoices([]);
          pageIssues.captureOperationFailure(
            'voice-library.load',
            cause,
            l('无法加载音色库，请稍后重试。', 'Could not load voice library. Please try again later.'),
            { retryable: true }
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [props.service, reloadToken, pageIssues, l]);

  useEffect(() => {
    const audio = audioRef.current;
    return () => {
      previewRequestRef.current += 1;
      if (audio?.getAttribute('src')) audio.pause();
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    };
  }, []);

  async function loadVoices() {
    if (props.service === null) return;
    setLoading(true);
    try {
      const response = await props.service.listVoiceDesigns();
      setVoices(response.voices);
      pageIssues.resolveOperation('voice-library.load');
    } catch (cause) {
      setVoices([]);
      pageIssues.captureOperationFailure(
        'voice-library.load',
        cause,
        l('无法加载音色库，请稍后重试。', 'Could not load voice library. Please try again later.'),
        { retryable: true }
      );
    } finally {
      setLoading(false);
    }
  }

  const stopPreview = useCallback(() => {
    previewRequestRef.current += 1;
    if (audioRef.current?.getAttribute('src')) {
      audioRef.current.pause();
      audioRef.current.removeAttribute('src');
    }
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = '';
    setPlaying(false);
    setPreviewing(false);
    setPreviewVoiceId('');
  }, []);

  async function preview(voice: VoiceLibraryItem) {
    if (previewVoiceId === voice.id && (playing || previewing)) {
      stopPreview();
      return;
    }
    if (props.service === null || props.disabled || loading || saving) return;
    stopPreview();
    const request = ++previewRequestRef.current;
    setPreviewVoiceId(voice.id);
    setPreviewing(true);
    try {
      const result = await props.service.previewVoiceDesign({ voiceId: voice.id });
      if (request !== previewRequestRef.current) return;
      const url = URL.createObjectURL(result.blob);
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = url;
      const audio = audioRef.current;
      if (!audio) return;
      audio.src = url;
      await audio.play();
      if (request !== previewRequestRef.current) return;
      setPlaying(true);
      pageIssues.resolveOperation('voice-library.preview');
    } catch (cause) {
      if (request !== previewRequestRef.current) return;
      pageIssues.captureOperationFailure(
        'voice-library.preview',
        cause,
        l('音色试听失败，请稍后重试。', 'Voice preview failed. Please try again later.'),
        { retryable: true }
      );
    } finally {
      if (request === previewRequestRef.current) setPreviewing(false);
    }
  }

  async function handleCreate() {
    if (!createPrompt.trim() || !createConsent || props.service === null || saving) return;
    setSaving(true);
    try {
      const voice = await props.service.saveVoiceDesign({
        prompt: createPrompt.trim(),
        consent: createConsent,
      });
      setVoices(prev => [voice, ...prev]);
      pageIssues.resolveOperation('voice-library.save');
      props.onVoiceSaved?.(voice);
      setShowCreateDialog(false);
      setCreatePrompt('');
      setCreateConsent(false);
    } catch (cause) {
      pageIssues.captureOperationFailure(
        'voice-library.save',
        cause,
        l('保存音色失败，请稍后重试。', 'Failed to save voice. Please try again later.'),
        { retryable: true }
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(voiceId: string) {
    if (props.service === null || loading || saving) return;
    const confirmed = window.confirm(
      l('确定要删除这个音色吗？此操作不可撤销。', 'Are you sure you want to delete this voice? This action cannot be undone.')
    );
    if (!confirmed) return;
    try {
      await props.service.deleteVoiceDesign({ voiceId });
      setVoices(prev => prev.filter(v => v.id !== voiceId));
      pageIssues.resolveOperation('voice-library.delete');
      props.onVoiceDeleted?.(voiceId);
    } catch (cause) {
      pageIssues.captureOperationFailure(
        'voice-library.delete',
        cause,
        l('删除音色失败，请稍后重试。', 'Failed to delete voice. Please try again later.'),
        { retryable: true }
      );
    }
  }

  function formatDuration(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  function formatDate(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function noop(): void {
    /* noop */
  }

  const retryOperations = {
    'voice-library.load': loadVoices,
    'voice-library.preview': () => { if (previewVoiceId) preview(voices.find(v => v.id === previewVoiceId)!); },
    'voice-library.save': handleCreate,
    'voice-library.delete': noop
  } as const;

  return (
    <div className="voice-library">
      <div className="voice-library-header">
        <h2><AudioLines size={18} aria-hidden="true" />{l('我的音色库', 'My Voice Library')}</h2>
        <div className="voice-library-actions">
          <button
            type="button"
            className="voice-library-refresh"
            disabled={props.disabled || loading}
            aria-label={l('刷新', 'Refresh')}
            title={l('刷新', 'Refresh')}
            onClick={() => { setReloadToken(t => t + 1); loadVoices(); }}
          >
            {loading ? <LoaderCircle className="voice-library-spinner" size={16} aria-hidden="true" /> : <RefreshCw size={16} aria-hidden="true" />}
          </button>
          <button
            type="button"
            className="voice-library-create"
            disabled={props.disabled || loading || saving}
            onClick={() => setShowCreateDialog(true)}
          >
            <Plus size={16} aria-hidden="true" />
            <span>{l('创建音色', 'Create Voice')}</span>
          </button>
        </div>
      </div>

      <IssueList
        issues={pageIssues.issues}
        actions={{
          retryOperations
        }}
        onDismiss={pageIssues.dismissIssue}
        compact
      />

      {showCreateDialog ? (
        <div className="voice-library-dialog-overlay" onClick={() => setShowCreateDialog(false)}>
          <div className="voice-library-dialog" onClick={e => e.stopPropagation()}>
            <h3>{l('创建新音色', 'Create New Voice')}</h3>
            <button className="voice-library-dialog-close" onClick={() => setShowCreateDialog(false)} aria-label={l('关闭', 'Close')}
              >
              <X size={20} aria-hidden="true" />
              </button>
            <div className="voice-library-dialog-content">
              <label className="voice-library-field">
                <span>{l('音色描述', 'Voice Description')}</span>
                <textarea
                  value={createPrompt}
                  onChange={e => setCreatePrompt(e.target.value)}
                  placeholder={l('例如：温柔的高棉语女性旁白，30岁左右', 'e.g., Warm Khmer female narrator, 30s')}
                  rows={4}
                  disabled={saving}
                  maxLength={500}
                />
                <small>{createPrompt.length}/500</small>
              </label>
              <label className="voice-library-consent">
                <input
                  type="checkbox"
                  checked={createConsent}
                  onChange={e => setCreateConsent(e.target.checked)}
                  disabled={saving}
                />
                <span>{l('我确认拥有此音色的使用权限，并同意将其存储在本地。', 'I confirm I have permission to use this voice and agree to store it locally.')}</span>
              </label>
            </div>
            <div className="voice-library-dialog-actions">
              <button
                type="button"
                className="voice-library-btn-secondary"
                onClick={() => setShowCreateDialog(false)}
                disabled={saving}
              >
                {l('取消', 'Cancel')}
              </button>
              <button
                type="button"
                className="voice-library-btn-primary"
                onClick={handleCreate}
                disabled={saving || !createPrompt.trim() || !createConsent}
              >
                {saving ? (
                  <>
                    <LoaderCircle className="voice-library-spinner" size={16} aria-hidden="true" />
                    <span>{l('保存中', 'Saving')}</span>
                  </>
                ) : (
                  <>
                    <Star size={16} aria-hidden="true" />
                    <span>{l('保存音色', 'Save Voice')}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {loading ? (
        <div className="voice-library-empty" role="status">
          <LoaderCircle className="voice-library-spinner" size={24} aria-hidden="true" />
          <span>{l('正在加载音色库', 'Loading voice library')}</span>
        </div>
      ) : voices.length === 0 ? (
        <div className="voice-library-empty" role="status">
          <AudioLines size={32} aria-hidden="true" />
          <span>{l('暂无音色，点击“创建音色”开始设计你的专属声音。', 'No voices yet. Click "Create Voice" to design your own.')}</span>
          <button
            type="button"
            className="voice-library-btn-primary"
            onClick={() => setShowCreateDialog(true)}
            disabled={props.disabled}
          >
            <Plus size={16} aria-hidden="true" />
            <span>{l('创建音色', 'Create Voice')}</span>
          </button>
        </div>
      ) : (
        <div className="voice-library-grid" role="list" aria-label={l('音色列表', 'Voice list')}>
          {voices.map(voice => (
            <article key={voice.id} className="voice-library-card" role="listitem">
              <div className="voice-library-card-header">
                <div className="voice-library-card-title">
                  <span className="voice-library-name">{voice.name}</span>
                  {voice.consent ? (
                    <CircleCheck className="voice-library-consent-badge" size={14} aria-label={l('已授权', 'Consented')} />
                  ) : (
                    <span className="voice-library-consent-badge voice-library-consent-pending" aria-label={l('待授权', 'Pending consent')}>{l('待授权', 'Pending')}</span>
                  )}
                </div>
                <button
                  type="button"
                  className="voice-library-delete"
                  disabled={props.disabled || loading}
                  aria-label={l('删除音色', 'Delete voice')}
                  title={l('删除音色', 'Delete voice')}
                  onClick={() => handleDelete(voice.id)}
                >
                  <Trash2 size={16} aria-hidden="true" />
                </button>
              </div>
              <div className="voice-library-card-prompt">
                <span>{voice.prompt}</span>
              </div>
              <div className="voice-library-card-meta">
                <span className="voice-library-duration"><AudioLines size={12} aria-hidden="true" /> {formatDuration(voice.duration)}</span>
                <span className="voice-library-date">{formatDate(voice.createdAt)}</span>
              </div>
              <div className="voice-library-card-actions">
                <button
                  type="button"
                  className="voice-library-preview"
                  disabled={props.disabled || loading || previewing}
                  onClick={() => preview(voice)}
                  aria-label={previewVoiceId === voice.id && playing ? l('暂停', 'Pause') : l('试听', 'Preview')}
                  title={previewVoiceId === voice.id && playing ? l('暂停', 'Pause') : l('试听', 'Preview')}
                >
                  {previewVoiceId === voice.id && previewing ? (
                    <LoaderCircle className="voice-library-spinner" size={18} aria-hidden="true" />
                  ) : previewVoiceId === voice.id && playing ? (
                    <span className="voice-library-pause-icon" aria-hidden="true">⏸</span>
                  ) : (
                    <Play size={18} aria-hidden="true" />
                  )}
                  <span className="voice-library-preview-label">
                    {previewVoiceId === voice.id && playing ? l('暂停', 'Pause') : l('试听', 'Preview')}
                  </span>
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      <audio ref={audioRef} hidden onEnded={stopPreview} />
    </div>
  );
}