'use client';

import React, {
  createContext,
  useCallback,
  useState,
  useContext,
  ReactNode,
} from 'react';

export interface ProgressItem {
  label: string;
  current: number;
  total: number;
  isApproximateTotal?: boolean;
}

// Define the possible states of a progress operation
type ProgressStatus = 'running' | 'complete' | 'error';

interface ProgressState {
  toastId: string | number | null;
  title: string;
  message?: string;
  items: ProgressItem[];
  status: ProgressStatus;
  /** Extra lines shown on failure, e.g. the logins that failed. */
  details?: string[];
  /** When set, the toast offers a Cancel action while running. */
  onCancel?: () => void;
}

interface ProgressContextType {
  state: ProgressState;
  show: (options: {
    title: string;
    message?: string;
    items: ProgressItem[];
    onCancel?: () => void;
  }) => void;
  update: (items: ProgressItem[], message?: string) => void;
  complete: (options?: { message?: string }) => void;
  fail: (options?: { message: string; details?: string[] }) => void;
  hide: () => void; // Will be used internally by the indicator
}

const ProgressContext = createContext<ProgressContextType | undefined>(
  undefined
);

export const ProgressProvider = ({ children }: { children: ReactNode }) => {
  const [state, setState] = useState<ProgressState>({
    toastId: null,
    title: '',
    message: '',
    items: [],
    status: 'running',
  });

  // Begins a new progress operation
  const show = ({
    title,
    message,
    items,
    onCancel,
  }: {
    title: string;
    message?: string;
    items: ProgressItem[];
    onCancel?: () => void;
  }) => {
    const newToastId = Date.now();
    setState({
      toastId: newToastId,
      title,
      message,
      items,
      status: 'running',
      onCancel,
    });
  };

  // Updates the progress bars (and optionally the status line)
  const update = (items: ProgressItem[], message?: string) => {
    setState((prevState) => ({
      ...prevState,
      items,
      message: message ?? prevState.message,
    }));
  };

  // Marks the operation as successfully completed
  const complete = (options?: { message?: string }) => {
    setState((prevState) => ({
      ...prevState,
      status: 'complete',
      message: options?.message,
      onCancel: undefined,
    }));
  };

  // Marks the operation as failed. Failures stay on screen until dismissed.
  const fail = (options?: { message: string; details?: string[] }) => {
    setState((prevState) => ({
      ...prevState,
      status: 'error',
      message: options?.message || 'An unexpected error occurred.',
      details: options?.details,
      onCancel: undefined,
    }));
  };

  // Resets the context to its initial state
  const hide = useCallback(() => {
    setState({
      toastId: null,
      title: '',
      message: '',
      items: [],
      status: 'running',
    });
  }, []);

  return (
    <ProgressContext.Provider
      value={{ state, show, update, complete, fail, hide }}
    >
      {children}
    </ProgressContext.Provider>
  );
};

export const useProgress = () => {
  const context = useContext(ProgressContext);
  if (context === undefined) {
    throw new Error('useProgress must be used within a ProgressProvider');
  }
  return context;
};
