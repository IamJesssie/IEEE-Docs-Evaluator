import { useEffect, useRef, useState } from 'react';

/**
 * Floating popover that appears at the position of a text selection.
 * Props:
 *   position     — { x, y } in viewport coordinates
 *   selectedText — the highlighted string
 *   onSave(comment) — called when the professor submits
 *   onDismiss    — called when cancelled or clicked away
 */
export default function AnnotationPopover({ position, selectedText, onSave, onDismiss }) {
    const [comment, setComment] = useState('');
    const [saving, setSaving]   = useState(false);
    const textareaRef           = useRef(null);

    // Auto-focus the textarea when the popover opens
    useEffect(() => {
        setTimeout(() => textareaRef.current?.focus(), 50);
    }, []);

    async function handleSave() {
        if (!comment.trim()) return;
        setSaving(true);
        try {
            await onSave(comment.trim());
            setComment('');
        } finally {
            setSaving(false);
        }
    }

    function handleKeyDown(e) {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleSave();
        if (e.key === 'Escape') onDismiss();
    }

    // Position the popover so it stays within the viewport
    const style = {
        position:  'fixed',
        top:       Math.min(position.y + 12, window.innerHeight - 220),
        left:      Math.min(position.x,      window.innerWidth  - 320),
        zIndex:    9000,
        width:     '300px',
        background: 'var(--bg-surface)',
        border:    '1px solid var(--line-soft)',
        borderRadius: '12px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
        padding:   '0.9rem',
        display:   'flex',
        flexDirection: 'column',
        gap:       '0.65rem',
    };

    return (
        <div style={style} onMouseDown={(e) => e.stopPropagation()}>
            {/* Selected text preview */}
            <div style={{
                fontSize: '0.78rem',
                color: 'var(--text-muted)',
                borderLeft: '3px solid var(--brand)',
                paddingLeft: '0.6rem',
                fontStyle: 'italic',
                lineHeight: 1.45,
                maxHeight: '48px',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
            }}>
                "{selectedText.length > 80 ? selectedText.slice(0, 80) + '…' : selectedText}"
            </div>

            {/* Comment input */}
            <textarea
                ref={textareaRef}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Add your comment… (Ctrl+Enter to save)"
                rows={3}
                style={{
                    width: '100%',
                    boxSizing: 'border-box',
                    border: '1px solid var(--line-soft)',
                    borderRadius: '8px',
                    padding: '0.55rem 0.65rem',
                    background: 'var(--bg-surface-2)',
                    color: 'var(--text-main)',
                    font: 'inherit',
                    fontSize: '0.88rem',
                    resize: 'none',
                    outline: 'none',
                }}
            />

            {/* Actions */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                <button
                    onClick={onDismiss}
                    style={{
                        border: '1px solid var(--line-soft)',
                        borderRadius: '8px',
                        background: 'var(--bg-surface)',
                        color: 'var(--text-muted)',
                        padding: '0.4rem 0.75rem',
                        fontSize: '0.82rem',
                        cursor: 'pointer',
                        fontWeight: 600,
                    }}
                >
                    Cancel
                </button>
                <button
                    onClick={handleSave}
                    disabled={!comment.trim() || saving}
                    style={{
                        border: 'none',
                        borderRadius: '8px',
                        background: 'var(--brand)',
                        color: '#fff',
                        padding: '0.4rem 0.85rem',
                        fontSize: '0.82rem',
                        cursor: comment.trim() ? 'pointer' : 'not-allowed',
                        fontWeight: 700,
                        opacity: comment.trim() ? 1 : 0.55,
                    }}
                >
                    {saving ? 'Saving…' : 'Save'}
                </button>
            </div>
        </div>
    );
}