import '../../styles/components/toast.css';

function ToastMessage({ toast, onClose }) {
  return (
    <div className={`toast ${toast.show ? 'toast--visible' : ''} toast--${toast.type}`}>
      <span className="toast__icon">{toast.type === 'success' ? 'OK' : '!'}</span>
      <span>{toast.message}</span>
      
      {/* ── Add the close button specifically for errors ── */}
      {toast.type === 'error' && onClose && (
        <button 
          onClick={onClose} 
          aria-label="Close error message"
          style={{
            background: 'none', border: 'none', color: 'inherit', 
            marginLeft: '12px', cursor: 'pointer', fontWeight: 'bold', 
            fontSize: '1.25rem', padding: '0 4px', lineHeight: 1
          }}
        >
          &times;
        </button>
      )}
    </div>
  );
}

export default ToastMessage;