import { useCallback, useState, useRef } from 'react';

export function useToast() {
  const [toast, setToast] = useState({ show: false, message: '', type: 'success' });
  const timeoutRef = useRef(null);

  const showToast = useCallback((message, type = 'success') => {
    // Clear any existing timer so toasts don't overlap
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    
    // Show the toast and trigger the CSS animation
    setToast({ show: true, message, type });

    // CRITICAL: Only auto-hide if it's NOT an error!
    if (type !== 'error') {
      timeoutRef.current = setTimeout(() => {
        setToast((prev) => ({ ...prev, show: false }));
      }, 2800);
    }
  }, []);

  const hideToast = useCallback(() => {
    setToast((prev) => ({ ...prev, show: false }));
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
  }, []);

  return { toast, showToast, hideToast };
}