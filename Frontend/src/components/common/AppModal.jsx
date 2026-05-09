import '../../styles/components/modal.css';

const spinnerStyle = `
  @keyframes modal-spin {
    to { transform: rotate(360deg); }
  }
`;

function AppModal({ isOpen, title, subtitle, onClose, children, footer, containerClassName = '', isLoading = false }) {
  if (!isOpen) return null;

  return (
    <div
      className="app-modal__overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !isLoading) {
          onClose();
        }
      }}
    >
      <style>{spinnerStyle}</style>

      <div className={`app-modal__container ${containerClassName}`.trim()}>
        <header className="app-modal__header">
          <div>
            <h2 className="app-modal__title">{title}</h2>
            {subtitle && <p className="app-modal__subtitle">{subtitle}</p>}
          </div>
          {!isLoading && (
            <button
              className="app-modal__close"
              onClick={onClose}
              aria-label="Close"
            >
              &times;
            </button>
          )}
        </header>

        {isLoading ? (
          <section className="app-modal__body" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.75rem', minHeight: '260px' }}>
            <div style={{
              width: '40px',
              height: '40px',
              border: '3px solid color-mix(in srgb, var(--brand) 25%, transparent)',
              borderTopColor: 'var(--brand)',
              borderRadius: '50%',
              animation: 'modal-spin 0.75s linear infinite',
            }} />
            <span style={{
              fontSize: '0.88rem',
              fontWeight: 600,
              color: 'var(--text-muted)',
            }}>
              Loading report...
            </span>
          </section>
        ) : (
          <>
            <section className="app-modal__body">{children}</section>
            {footer && <footer className="app-modal__footer">{footer}</footer>}
          </>
        )}
      </div>
    </div>
  );
}

export default AppModal;