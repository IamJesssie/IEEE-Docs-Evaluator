/* eslint-disable react/prop-types */
import { useEffect, useMemo, useState } from 'react';
import AppModal from '../common/AppModal';
import EvaluationReport from '../common/EvaluationReport';
import AnalysisProgress from '../common/AnalysisProgress';
import '../../styles/components/analysis-progress.css';

function TeacherAnalyzeModal({
  isOpen,
  file,
  aiResult,
  aiImages = [],
  isAnalyzing,
  analysisProgress = { currentStep: '', currentMessage: '', percent: 0, isRetrying: false },
  onClose,
  onRun,
  aiRuntimeSettings,
  customRules,
  setCustomRules,
  onViewHistory,
  hasPreviousEvaluation = false,
  promptTemplates = [],
}) {
  const hasResult = Boolean(aiResult) && !isAnalyzing;
  const hasHistory = Boolean(hasPreviousEvaluation);

  const [selectedTemplateId, setSelectedTemplateId] = useState('');

  useEffect(() => {
    if (isOpen) setSelectedTemplateId('');
  }, [isOpen, file?.id]);

  const providerOptions = useMemo(() => {
    if (aiRuntimeSettings?.providers?.length) return aiRuntimeSettings.providers;
    return [{ id: 'openai', label: 'OpenAI', selectedModel: '', apiKeyConfigured: false }];
  }, [aiRuntimeSettings]);

  const activeProviderId = aiRuntimeSettings?.activeProvider || providerOptions[0]?.id || 'openai';
  const selectedProvider = providerOptions.find((p) => p.id === activeProviderId) || providerOptions[0];
  const selectedModel    = selectedProvider?.selectedModel || 'Not configured';
  const hasApiKey        = Boolean(selectedProvider?.apiKeyConfigured);
  const hasProvider      = Boolean(selectedProvider?.id);

  const subtitlePrimary = hasResult
    ? 'AI evaluation complete'
    : 'Using active AI settings from System Settings';

  const subtitle = (
    <>
      <span>{subtitlePrimary}</span>
      <br />
      <span className="analyze-modal-subtitle__meta">
        <strong className="analyze-modal-subtitle__label">Provider:</strong>{' '}
        {selectedProvider?.label || activeProviderId}
        {'\u00A0\u00A0\u00A0\u00A0'}
        <strong className="analyze-modal-subtitle__label">AI Model:</strong>{' '}
        {selectedModel}
      </span>
    </>
  );

  function handleTemplateChange(e) {
    const id = e.target.value;
    setSelectedTemplateId(id);
    if (!id) { setCustomRules(''); return; }
    const template = promptTemplates.find((t) => String(t.id) === id);
    if (template) setCustomRules(template.content);
  }

  function handleEvaluate() {
    if (!selectedProvider || !hasProvider) return;
    onRun(selectedProvider.id);
  }

  const actionLabel = hasResult ? 'Re-Evaluate' : 'Evaluate';

  const footer = isAnalyzing ? null : (
    <div className="analyze-modal-footer">
      <div className="modal-actions modal-actions--end">
        {(hasHistory || hasResult) && (
          <button className="btn btn--secondary" onClick={onViewHistory} disabled={isAnalyzing}>
            View History
          </button>
        )}
        <button className="btn btn--primary" onClick={handleEvaluate} disabled={!hasProvider || isAnalyzing}>
          {actionLabel}
        </button>
      </div>
    </div>
  );

  return (
    <AppModal
      isOpen={isOpen}
      onClose={onClose}
      title={`Analyze: ${file?.name || ''}`}
      subtitle={subtitle}
      containerClassName="teacher-analyze-modal"
      footer={footer}
    >
      {/* ── Pre-run state ── */}
      {!isAnalyzing && !hasResult && (
        <p className="muted" style={{ marginBottom: '1rem' }}>
          Run evaluation to generate an AI report for this submission.
        </p>
      )}

      {!isAnalyzing && !hasApiKey && (
        <p className="muted" style={{ marginTop: '0.5rem', marginBottom: '1rem' }}>
          API key is not configured for this provider. Evaluating now will return an error.
        </p>
      )}

      {/* ── Custom rules / template selector (hidden while analyzing) ── */}
      {!isAnalyzing && (
        <div className="custom-rules-group">
          {promptTemplates.length > 0 && (
            <div style={{ marginBottom: '0.65rem' }}>
              <label htmlFor="template-select" className="custom-rules-label">
                Load from Template (Optional)
              </label>
              <select
                id="template-select"
                className="custom-rules-select"
                value={selectedTemplateId}
                onChange={handleTemplateChange}
                disabled={isAnalyzing}
              >
                <option value="">— Select a template —</option>
                {promptTemplates.map((t) => (
                  <option key={t.id} value={String(t.id)}>{t.name}</option>
                ))}
              </select>
            </div>
          )}

          <label htmlFor="custom-rules" className="custom-rules-label">
            Professor Directives (Optional)
          </label>
          <textarea
            id="custom-rules"
            className="custom-rules-textarea"
            placeholder="e.g., Be extremely strict on the Diagrams. Ensure they have include and exclude."
            value={customRules}
            onChange={(e) => {
              setCustomRules(e.target.value);
              if (selectedTemplateId) setSelectedTemplateId('');
            }}
            disabled={isAnalyzing}
            rows={hasResult ? 2 : 3}
          />
        </div>
      )}

      {/* ── Animated progress (replaces old spinner) ── */}
      {isAnalyzing && (
        <AnalysisProgress
          currentStep={analysisProgress.currentStep}
          currentMessage={analysisProgress.currentMessage}
          percent={analysisProgress.percent}
          isRetrying={analysisProgress.isRetrying}
        />
      )}

      {/* ── Permission / access error card ── */}
      {hasResult && (aiResult.startsWith('PERMISSION DENIED') || aiResult.startsWith('FILE NOT FOUND')) && (
        <div style={{
          padding: '1rem 1.2rem',
          borderRadius: '10px',
          border: '1px solid color-mix(in srgb, #ef4444 30%, var(--line-soft))',
          background: 'color-mix(in srgb, #ef4444 8%, var(--bg-surface))',
          color: 'var(--text-main)',
          marginBottom: '0.75rem',
        }}>
          <p style={{ margin: '0 0 0.4rem', fontWeight: 700, color: '#dc2626', fontSize: '0.88rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Access Error
          </p>
          <p style={{ margin: 0, fontSize: '0.92rem', lineHeight: 1.6 }}>{aiResult}</p>
          <p style={{ margin: '0.75rem 0 0', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
            To fix this: open the document in Google Drive, click <strong>Share</strong>, set access to <strong>Anyone with the link</strong>, and change the role to <strong>Editor</strong>.
          </p>
        </div>
      )}

      {/* ── Result ── */}
      {hasResult && !aiResult.startsWith('PERMISSION DENIED') && !aiResult.startsWith('FILE NOT FOUND') && (
        <EvaluationReport text={aiResult} images={aiImages} />
      )}
    </AppModal>
  );
}

export default TeacherAnalyzeModal;