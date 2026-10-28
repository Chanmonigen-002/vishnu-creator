import type { ReactNode } from 'react';
import CreatorCollaborationPanel, {
  type CreatorPanelQuickAction
} from './CreatorCollaborationPanel.js';
import { videoTranslationPanelAdapter } from './creator-panel-adapters.js';

export type VideoTranslationAgentQuickAction = CreatorPanelQuickAction;

export default function VideoTranslationAgentPanel(props: {
  stepLabel: string;
  contextSummary: string;
  taskSummary?: ReactNode;
  promptHint?: string;
  currentIssue?: string;
  quickActions?: VideoTranslationAgentQuickAction[];
  onCancelTask?(): void;
  onPauseTask?(): void;
  onResumeTask?(): void;
  taskControlPending?: 'canceling' | 'resuming' | 'pausing';
}) {
  return (
    <CreatorCollaborationPanel
      {...props}
      adapter={videoTranslationPanelAdapter}
    />
  );
}
