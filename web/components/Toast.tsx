'use client';

import { createContext, useContext, useCallback, useState, useRef } from 'react';

type ToastType = 'success' | 'error' | 'info';

interface Toast {
  id: number;
  message: string;
  type: ToastType;
}

interface ToastContextValue {
  toast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue>({ toast: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idRef = useRef(0);

  const toast = useCallback((message: string, type: ToastType = 'info') => {
    const id = ++idRef.current;
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3000);
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {/* Toast container */}
      {toasts.length > 0 && (
        <div className="fixed bottom-10 right-4 z-50 flex flex-col gap-2 pointer-events-none">
          {toasts.map(t => (
            <div
              key={t.id}
              className={`pointer-events-auto animate-slide-up px-4 py-2.5 rounded-lg text-[12px] font-medium shadow-lg backdrop-blur-sm border flex items-center gap-2 max-w-[320px] ${
                t.type === 'success'
                  ? 'bg-good/15 text-good border-good/20'
                  : t.type === 'error'
                    ? 'bg-fail/15 text-fail border-fail/20'
                    : 'bg-bg-3/90 text-text-base border-border-soft'
              }`}
              role="alert"
            >
              {t.type === 'success' && (
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="shrink-0">
                  <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.2" />
                  <path d="M4 7.2L6 9.2L10 5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
              {t.type === 'error' && (
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="shrink-0">
                  <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.2" />
                  <path d="M5 5L9 9M9 5L5 9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                </svg>
              )}
              {t.type === 'info' && (
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="shrink-0">
                  <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.2" />
                  <path d="M7 6V10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                  <circle cx="7" cy="4.5" r="0.5" fill="currentColor" />
                </svg>
              )}
              {t.message}
            </div>
          ))}
        </div>
      )}
    </ToastContext.Provider>
  );
}
