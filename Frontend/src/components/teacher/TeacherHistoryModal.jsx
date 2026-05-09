import { useState } from 'react';
import AppModal from '../common/AppModal';
import EvaluationReport from '../common/EvaluationReport';
import AnnotatedReport from '../common/AnnotatedReport';
import { useAnnotations } from '../../hooks/useAnnotations';

const TABS = [
  { key: 'view',     label: 'View' },
  { key: 'edit',     label: 'Edit' },
  { key: 'preview',  label: 'Preview' },
  { key: 'annotate', label: 'Annotate' },
];

function TeacherHistoryModal({
  item,
  images,
  isEditing,
  isLoading = false,
  editedText,
  editedFeedback,
  onEditToggle,
  onEditText,
  onEditFeedback,
  onSave,
  onSend,
  onCopy,
  onReturn,
  onClose,
}) {
  const [activeTab, setActiveTab] = useState('view');
  const { annotations, addAnnotation, removeAnnotation } = useAnnotations(item?.id);

  // Reset to view tab when a new item opens
  const itemId = item?.id;

  const hasFeedback = item?.teacherFeedback?.trim();
  const displayText = editedText || item?.evaluationResult || '';

  // ── Tab content ───────────────────────────────────────────────────────────

  function renderTabContent() {
    switch (activeTab) {

      case 'view':
        return (
          <div className="report-view-container">
            <EvaluationReport text={displayText} images={images || []} />
            {hasFeedback && (
              <div className="eval-card eval-card--feedback" style={{ marginTop: '1rem' }}>
                <div className="eval-card__header">
                  <span className="eval-card__heading">Teacher Feedback</span>
                </div>
                <div className="eval-card__body">
                  <p className="eval-card__note" style={{ fontStyle: 'normal', whiteSpace: 'pre-wrap' }}>
                    {item.teacherFeedback}
                  </p>
                </div>
              </div>
            )}
            {annotations.length > 0 && (
              <AnnotationPanel annotations={annotations} />
            )}
          </div>
        );

      case 'edit':
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {/* Sticky save bar */}
            <div style={{
              position: 'sticky', top: 0, zIndex: 10,
              display: 'flex', justifyContent: 'flex-end', gap: '0.5rem',
              padding: '0.6rem 0',
              background: 'var(--bg-surface)',
              borderBottom: '1px solid var(--line-soft)',
              marginBottom: '0.5rem',
            }}>
              <span style={{ flex: 1, fontSize: '0.82rem', color: 'var(--text-muted)', alignSelf: 'center' }}>
                Editing AI evaluation — changes are saved locally until you click Save.
              </span>
              <button className="btn" onClick={() => { onEditToggle(false); setActiveTab('view'); }}>
                Cancel
              </button>
              <button className="btn btn--primary" onClick={() => { onSave(); setActiveTab('view'); }}>
                Save Changes
              </button>
            </div>

            {/* AI Evaluation textarea */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <label style={{
                fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase',
                letterSpacing: '0.06em', color: 'var(--brand)',
              }}>
                AI Evaluation
              </label>
              <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.45 }}>
                Edit the AI-generated evaluation text. Use the Preview tab to see how it will look rendered.
                Markdown formatting is supported — use <code>**bold**</code>, <code>* bullet</code>, etc.
              </p>
              <textarea
                className="report-textarea"
                value={editedText}
                onChange={(e) => onEditText(e.target.value)}
                style={{ minHeight: '320px', fontFamily: 'monospace', fontSize: '0.85rem' }}
              />
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'right' }}>
                {(editedText || '').length.toLocaleString()} characters
              </span>
            </div>

            {/* Teacher Feedback textarea */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <label style={{
                fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase',
                letterSpacing: '0.06em', color: '#db2777',
              }}>
                Teacher Feedback
              </label>
              <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.45 }}>
                Add a personal note to the student. This appears as a separate section below the AI evaluation.
                Plain text only — no markdown needed.
              </p>
              <textarea
                className="report-textarea report-textarea--feedback"
                value={editedFeedback}
                onChange={(e) => onEditFeedback(e.target.value)}
                placeholder="Add your personal feedback to the student here…"
                style={{ minHeight: '140px' }}
              />
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'right' }}>
                {(editedFeedback || '').length.toLocaleString()} characters
              </span>
            </div>
          </div>
        );

      case 'preview':
        return (
          <div className="report-view-container">
            <div style={{
              padding: '0.55rem 0.85rem', marginBottom: '0.75rem',
              borderRadius: '8px',
              background: 'color-mix(in srgb, #22c55e 8%, var(--bg-surface))',
              border: '1px solid color-mix(in srgb, #22c55e 22%, var(--line-soft))',
              fontSize: '0.82rem', color: '#16a34a', fontWeight: 600,
            }}>
              Preview — this is how the report will look to the student after saving.
            </div>
            <EvaluationReport text={displayText} images={images || []} />
            {editedFeedback?.trim() && (
              <div className="eval-card eval-card--feedback" style={{ marginTop: '1rem' }}>
                <div className="eval-card__header">
                  <span className="eval-card__heading">Teacher Feedback</span>
                </div>
                <div className="eval-card__body">
                  <p className="eval-card__note" style={{ fontStyle: 'normal', whiteSpace: 'pre-wrap' }}>
                    {editedFeedback}
                  </p>
                </div>
              </div>
            )}
          </div>
        );

      case 'annotate':
        return (
          <AnnotatedReport
            text={displayText}
            images={images || []}
            annotations={annotations}
            canAnnotate={true}
            onAddAnnotation={addAnnotation}
            onDeleteAnnotation={removeAnnotation}
          />
        );

      default:
        return null;
    }
  }

  // ── Footer ────────────────────────────────────────────────────────────────

  const footer = activeTab === 'edit' ? null : (
    <div className="modal-actions modal-actions--end">
      <button className="btn" onClick={() => onCopy(displayText)}>Copy Text</button>
      <button className="btn" onClick={() => { onEditToggle(true); setActiveTab('edit'); }}>Edit</button>
      <button className="btn btn--secondary" onClick={onReturn}>Return</button>
      <button className="btn btn--primary" onClick={onSend}>
        {item?.isSent ? 'Resend to Student' : 'Send Result'}
      </button>
    </div>
  );

  return (
    <AppModal
      isOpen={Boolean(item) || isLoading}
      onClose={isLoading ? () => {} : onClose}
      title={isLoading ? 'Loading Report...' : 'Saved Evaluation Report'}
      subtitle={item && !isLoading ? `File: ${item.fileName}` : ''}
      containerClassName="submission-history-modal"
      footer={isLoading ? null : footer}
      showCloseButton={!isLoading}
      isLoading={isLoading} /* <--- THIS TRIGGERS THE ELEGANT SPINNER! */
    >
      {/* Only render the tabs and content if we are NOT loading */}
      {!isLoading && (
        <>
          {/* ── Tab strip ── */}
          <div style={{
            display: 'flex', gap: '0.35rem',
            borderBottom: '1px solid var(--line-soft)',
            marginBottom: '1rem',
            paddingBottom: '0',
          }}>
            {TABS.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => { setActiveTab(key); if (key !== 'edit') onEditToggle(false); }}
                style={{
                  border: 'none',
                  borderBottom: activeTab === key
                    ? '2px solid var(--brand)'
                    : '2px solid transparent',
                  borderRadius: 0,
                  background: 'none',
                  color: activeTab === key ? 'var(--brand)' : 'var(--text-muted)',
                  fontWeight: activeTab === key ? 700 : 500,
                  padding: '0.55rem 0.9rem',
                  cursor: 'pointer',
                  fontSize: '0.88rem',
                  transition: 'color 0.15s, border-color 0.15s',
                }}
              >
                {label}
                {key === 'annotate' && annotations.length > 0 && (
                  <span style={{
                    marginLeft: '0.4rem',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    width: '18px', height: '18px', borderRadius: '50%',
                    background: '#f59e0b', color: '#fff',
                    fontSize: '0.68rem', fontWeight: 800,
                  }}>
                    {annotations.length}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* ── Tab content ── */}
          <div style={{ maxHeight: 'calc(100vh - 280px)', overflowY: 'auto', overflowX: 'hidden', paddingRight: '4px' }}>
            {renderTabContent()}
          </div>
        </>
      )}
    </AppModal>
  );
}

// ── Annotation panel (view/student mode) ─────────────────────────────────────

function AnnotationPanel({ annotations }) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div style={{
      marginTop: '1.5rem',
      border: '1px solid color-mix(in srgb, #f59e0b 30%, var(--line-soft))',
      borderRadius: '12px',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <button
        onClick={() => setCollapsed((p) => !p)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0.75rem 1rem',
          background: 'color-mix(in srgb, #f59e0b 10%, var(--bg-surface-2))',
          border: 'none', cursor: 'pointer',
          borderBottom: collapsed ? 'none' : '1px solid color-mix(in srgb, #f59e0b 20%, var(--line-soft))',
        }}
      >
        <span style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: '20px', height: '20px', borderRadius: '50%',
            background: '#f59e0b', color: '#fff', fontSize: '0.7rem', fontWeight: 800,
          }}>
            {annotations.length}
          </span>
          Professor Annotations
        </span>
        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 700 }}>
          {collapsed ? 'Show' : 'Hide'}
        </span>
      </button>

      {/* List */}
      {!collapsed && (
        <div style={{ padding: '0.75rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          {annotations.map((ann, idx) => (
            <div key={ann.id} style={{
              display: 'flex', gap: '0.65rem',
              padding: '0.7rem 0.85rem',
              borderRadius: '8px',
              border: '1px solid color-mix(in srgb, #f59e0b 18%, var(--line-soft))',
              background: 'var(--bg-surface)',
            }}>
              <div style={{
                flexShrink: 0, width: '20px', height: '20px', borderRadius: '50%',
                background: '#f59e0b', color: '#fff',
                fontSize: '0.68rem', fontWeight: 800,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                marginTop: '2px',
              }}>
                {idx + 1}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{
                  margin: '0 0 0.3rem',
                  fontSize: '0.76rem', color: 'var(--text-muted)',
                  fontStyle: 'italic', lineHeight: 1.4,
                  borderLeft: '2px solid #f59e0b', paddingLeft: '0.45rem',
                }}>
                  "{ann.selectedText.length > 100 ? ann.selectedText.slice(0, 100) + '…' : ann.selectedText}"
                </p>
                <p style={{ margin: 0, fontSize: '0.87rem', color: 'var(--text-main)', lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>
                  {ann.comment}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default TeacherHistoryModal;