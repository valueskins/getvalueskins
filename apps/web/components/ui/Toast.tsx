'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Icon } from './Icon';

type ToastTone = 'ok' | 'info' | 'error';

interface ToastItem {
  id: number;
  tone: ToastTone;
  title: string;
  text?: string;
}

interface ToastApi {
  show: (toast: Omit<ToastItem, 'id'>) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

/** Success and info leave after 6 seconds. Errors stay until closed. */
export const TOAST_MS = 6000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const next = useRef(1);

  const dismiss = useCallback((id: number) => {
    setItems((list) => list.filter((t) => t.id !== id));
  }, []);

  const show = useCallback(
    (toast: Omit<ToastItem, 'id'>) => {
      const id = next.current++;
      setItems((list) => [...list, { ...toast, id }]);
      if (toast.tone !== 'error') window.setTimeout(() => dismiss(id), TOAST_MS);
    },
    [dismiss],
  );

  const api = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toasts" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className="toast" role={t.tone === 'error' ? 'alert' : 'status'}>
            <span
              className={
                t.tone === 'error'
                  ? 'text-danger'
                  : t.tone === 'ok'
                    ? 'text-success'
                    : 'text-ink-muted'
              }
            >
              <Icon
                name={
                  t.tone === 'error' ? 'warningCircle' : t.tone === 'ok' ? 'checkCircle' : 'info'
                }
              />
            </span>
            <div className="toast-body">
              <p className="toast-title">{t.title}</p>
              {t.text ? <p className="toast-text">{t.text}</p> : null}
            </div>
            <button
              type="button"
              className="btn btn-ghost btn-icon btn-sm"
              aria-label="Close"
              onClick={() => dismiss(t.id)}
            >
              <Icon name="x" size={16} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast needs a ToastProvider');
  return ctx;
}
