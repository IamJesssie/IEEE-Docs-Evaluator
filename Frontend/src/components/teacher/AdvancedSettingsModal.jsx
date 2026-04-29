/* eslint-disable react/prop-types */
import { useState } from 'react';
import AppModal from '../common/AppModal';

// ── Field definitions — label, key, unit, description, recommended range ─────
const RETRY_FIELDS = [
  {
    key: 'ANALYZE_MAX_ATTEMPTS',
    label: 'Max Retry Attempts',
    unit: 'attempts',
    type: 'integer',
    recommended: '3 – 10',
    description:
      'How many times the backend will retry a failed AI call before giving up. ' +
      'Each retry waits longer than the last (exponential backoff). ' +
      'Setting this too low means a single transient error causes a visible failure. ' +
      'Setting it too high means the professor waits a long time before seeing an error.',
  },
  {
    key: 'RETRY_INITIAL_DELAY_MIN_MS',
    label: 'Initial Retry Delay — Minimum',
    unit: 'ms',
    type: 'integer',
    recommended: '1000 – 3000',
    description:
      'The lower bound of the randomised wait before the first retry. ' +
      'Jitter (randomness) prevents multiple concurrent requests from all retrying at the same moment, ' +
      'which would overwhelm the AI provider. Must be less than the Maximum.',
  },
  {
    key: 'RETRY_INITIAL_DELAY_MAX_MS',
    label: 'Initial Retry Delay — Maximum',
    unit: 'ms',
    type: 'integer',
    recommended: '3000 – 8000',
    description:
      'The upper bound of the randomised wait before the first retry. ' +
      'The actual delay is picked randomly between the Minimum and this value. ' +
      'Must be greater than the Minimum.',
  },
  {
    key: 'RETRY_BACKOFF_MAX_DELAY_MS',
    label: 'Backoff Ceiling',
    unit: 'ms',
    type: 'integer',
    recommended: '15000 – 60000',
    description:
      'The hard maximum wait time between any two retries regardless of how many attempts have occurred. ' +
      'Without this ceiling, exponential backoff would keep doubling the wait indefinitely. ' +
      'For example, attempt 6 might otherwise wait 160 seconds — this caps it at your chosen value.',
  },
  {
    key: 'RETRY_TIME_LIMIT_MS',
    label: 'Total Retry Time Limit',
    unit: 'ms',
    type: 'integer',
    recommended: '120000 – 300000 (2 – 5 min)',
    description:
      'The maximum total wall-clock time allowed for all retry attempts combined. ' +
      'If the cumulative time spent retrying exceeds this limit, the backend stops immediately ' +
      'and returns an error to the professor — even if attempts remain. ' +
      'This prevents a single evaluation from hanging indefinitely.',
  },
];

function msToReadable(ms) {
  const n = parseInt(ms, 10);
  if (isNaN(n)) return '';
  if (n >= 60000) return `≈ ${(n / 60000).toFixed(1)} min`;
  if (n >= 1000)  return `≈ ${(n / 1000).toFixed(1)} s`;
  return `${n} ms`;
}

export default function AdvancedSettingsModal({ settings = [], editedSettings = {}, onSettingChange, onSave, isSaving }) {
  const [isOpen, setIsOpen] = useState(false);

  // Prefer the in-progress edited value, fall back to the saved DB value
  function getValue(key) {
    if (key in editedSettings) return editedSettings[key];
    return settings.find((s) => s.key === key)?.value || '';
  }

  const footer = (
    <div className="modal-actions modal-actions--end">
      <button className="btn" onClick={() => setIsOpen(false)}>Cancel</button>
      <button
        className="btn btn--primary"
        onClick={() => { onSave(); setIsOpen(false); }}
        disabled={isSaving}
      >
        {isSaving ? 'Saving…' : 'Save Advanced Settings'}
      </button>
    </div>
  );

  return (
    <>
      <button
        className="ssp-btn ssp-btn--ghost"
        type="button"
        onClick={() => setIsOpen(true)}
      >
        Advanced Settings
      </button>

      <AppModal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title="Advanced Settings"
        subtitle="Retry behaviour and time limits for AI evaluation calls"
        footer={footer}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', padding: '0.25rem 0' }}>
          {RETRY_FIELDS.map(({ key, label, unit, recommended, description }) => {
            const raw       = getValue(key);
            const readable  = unit === 'ms' ? msToReadable(raw) : '';

            return (
              <div key={key} style={{
                border: '1px solid var(--line-soft)',
                borderRadius: '12px',
                padding: '1rem',
                background: 'var(--bg-surface-2)',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.55rem',
              }}>
                {/* Label row */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
                  <label
                    htmlFor={`adv-${key}`}
                    style={{ fontWeight: 700, fontSize: '0.92rem', color: 'var(--text-main)' }}
                  >
                    {label}
                  </label>
                  <span style={{
                    fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase',
                    letterSpacing: '0.04em', color: 'var(--text-muted)',
                    padding: '0.15rem 0.55rem', borderRadius: '999px',
                    border: '1px solid var(--line-soft)', background: 'var(--bg-surface)',
                  }}>
                    {unit}
                  </span>
                </div>

                {/* Description */}
                <p style={{ margin: 0, fontSize: '0.83rem', color: 'var(--text-muted)', lineHeight: 1.55 }}>
                  {description}
                </p>

                {/* Recommended */}
                <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--brand)', fontWeight: 600 }}>
                  Recommended: {recommended}
                </p>

                {/* Input row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                  <input
                    id={`adv-${key}`}
                    className="ssp-input"
                    type="number"
                    min="1"
                    value={raw}
                    onChange={(e) => onSettingChange(key, e.target.value)}
                    style={{ maxWidth: '180px' }}
                  />
                  {readable && (
                    <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                      {readable}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </AppModal>
    </>
  );
}