'use client';

import React, { createContext, useState, useContext, ReactNode } from 'react';

export interface ProgressItem {
  label: string;
  current: number;
  total: number;
}

// Define the possible states of a progress operation
type ProgressStatus = 'running' | 'complete' | 'error';

interface ProgressState {
  toastId: string | number | null;
  title: string;
  message?: string;
  items: ProgressItem[];
  status: ProgressStatus;
}

interface ProgressContextType {
  state: ProgressState;
  show: (options: {
    title: string;
    message?: string;
    items: ProgressItem[];
  }) => void;
  update: (items: ProgressItem[]) => void;
  complete: () => void;
  fail: (options?: { message: string }) => void;
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
  }: {
    title: string;
    message?: string;
    items: ProgressItem[];
  }) => {
    const newToastId = Date.now();
    setState({ toastId: newToastId, title, message, items, status: 'running' });
  };

  // Updates the progress bars
  const update = (items: ProgressItem[]) => {
    setState((prevState) => ({ ...prevState, items }));
  };

  // Marks the operation as successfully completed
  const complete = () => {
    setState((prevState) => ({ ...prevState, status: 'complete' }));
  };

  // Marks the operation as failed
  const fail = (options?: { message: string }) => {
    setState((prevState) => ({
      ...prevState,
      status: 'error',
      message: options?.message || 'An unexpected error occurred.',
    }));
  };

  // Resets the context to its initial state
  const hide = () => {
    setState({
      toastId: null,
      title: '',
      message: '',
      items: [],
      status: 'running',
    });
  };

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
