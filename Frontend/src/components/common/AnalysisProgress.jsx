import { memo, useRef } from 'react';

// ── Step definitions — ordered as they appear in the UI ───────────────────────
const STEPS = [
  { key: 'RECEIVED',        label: 'Request Accepted',        icon: '01', description: 'Queued for processing' },
  { key: 'EXTRACTING',      label: 'Extracting Document',     icon: '02', description: 'Downloading and reading text from Google Drive' },
  { key: 'RENDERING',       label: 'Rendering Pages',         icon: '03', description: 'Converting pages to images for diagram analysis' },
  { key: 'DETECTING',       label: 'Detecting Document Type', icon: '04', description: 'Identifying SRS / SDD / SPMP / STD' },
  { key: 'BUILDING_PROMPT', label: 'Building Prompt',         icon: '05', description: 'Assembling rubric, class context, and step instructions' },
  { key: 'SENDING_TO_AI',   label: 'Sending to AI',           icon: '06', description: 'Dispatching text and images to the model' },
  { key: 'PROCESSING',      label: 'AI Responding',           icon: '07', description: 'Waiting for the model to complete evaluation' },
  { key: 'SAVING',          label: 'Saving Result',           icon: '08', description: 'Persisting evaluation to the database' },
  { key: 'COMPLETE',        label: 'Complete',                icon: '09', description: 'Evaluation finished successfully' },
];

const STEP_KEYS = STEPS.map((s) => s.key);

// CRITICAL FIX: Pass the lastValidStep dynamically instead of hardcoding it
function stepStatus(stepKey, currentStep, lastValidStep) {
  if (currentStep === 'RETRYING') {
    const retryIdx = STEP_KEYS.indexOf(lastValidStep);
    const thisIdx  = STEP_KEYS.indexOf(stepKey);
    if (thisIdx < retryIdx)  return 'done';
    if (thisIdx === retryIdx) return 'retrying';
    return 'pending';
  }
  const currentIdx = STEP_KEYS.indexOf(currentStep);
  const thisIdx    = STEP_KEYS.indexOf(stepKey);
  if (thisIdx < currentIdx)  return 'done';
  if (thisIdx === currentIdx) return 'active';
  return 'pending';
}

function AnalysisProgress({ currentStep, currentMessage, percent, isRetrying }) {
  // Remember the last step so we know exactly where we failed
  const lastValidStepRef = useRef('RECEIVED');
  if (currentStep && currentStep !== 'RETRYING') {
    lastValidStepRef.current = currentStep;
  }

  return (
    <div className="ap-root">

      {/* ── Retry banner ── */}
      {isRetrying && (
        <div className="ap-retry-banner">
          <span className="ap-retry-icon ap-retry-icon--warn">!</span>
          <span>The AI model returned a transient error. Retrying automatically…</span>
        </div>
      )}

      {/* ── Progress bar ── */}
      <div className="ap-bar-wrap" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
        <div className="ap-bar-track">
          <div className="ap-bar-fill" style={{ width: `${percent}%` }} />
        </div>
        <span className="ap-bar-label">{percent}%</span>
      </div>

      {/* ── Current message ── */}
      {currentMessage && (
        <p className="ap-current-message">{currentMessage}</p>
      )}

      {/* ── Step cards ── */}
      <div className="ap-steps">
        {STEPS.map(({ key, label, icon, description }) => {
          // Pass our tracked last valid step to the status calculator
          const status = stepStatus(key, currentStep, lastValidStepRef.current);
          return (
            <StepCard
              key={key}
              icon={icon}
              label={label}
              description={description}
              status={status}
            />
          );
        })}
      </div>

      {/* ── Warning ── */}
      <div className="ap-warning">
        <strong>Please do not refresh the page.</strong>
        {' '}Heavy documents with many diagrams can take up to 5 minutes.
      </div>
    </div>
  );
}

const StepCard = memo(function StepCard({ icon, label, description, status }) {
  return (
    <div className={`ap-step ap-step--${status}`}>
      <div className="ap-step__icon-wrap">
        {status === 'active' ? (
          <span className="ap-step__spinner" aria-hidden="true" />
        ) : status === 'done' ? (
          <span className="ap-step__check">✓</span>
        ) : status === 'retrying' ? (
          <span className="ap-step__retry-icon">↺</span>
        ) : (
          <span className="ap-step__icon">{icon}</span>
        )}
      </div>
      <div className="ap-step__body">
        <span className="ap-step__label">{label}</span>
        {status === 'active' && (
          <span className="ap-step__description">{description}</span>
        )}
      </div>
      {status === 'done' && <span className="ap-step__done-pill">Done</span>}
      {status === 'active' && <span className="ap-step__active-pill">In progress</span>}
    </div>
  );
});

export default AnalysisProgress;