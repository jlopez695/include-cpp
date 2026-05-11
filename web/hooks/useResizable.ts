'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { loadUiState, saveUiState } from '@/lib/storage';

export function useResizable(
  storageKey: string,
  initial: number,
  direction: 'horizontal' | 'vertical',
  getContainer: () => HTMLElement | null,
  bounds: [number, number],
) {
  const [size, setSize] = useState<number>(initial);
  const dragging = useRef(false);
  const sizeRef = useRef(size);
  sizeRef.current = size;

  // Restore from localStorage after hydration to avoid SSR mismatch
  useEffect(() => {
    const saved = loadUiState(storageKey, initial);
    if (saved !== initial) setSize(saved);
  }, [storageKey, initial]);

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dragging.current = true;
      document.body.style.cursor = direction === 'horizontal' ? 'col-resize' : 'row-resize';
      document.body.style.userSelect = 'none';
    },
    [direction],
  );

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      const el = getContainer();
      if (!el) return;
      const rect = el.getBoundingClientRect();
      let next: number;
      if (direction === 'horizontal') {
        next = ((e.clientX - rect.left) / rect.width) * 100;
      } else {
        next = rect.bottom - e.clientY;
      }
      next = Math.max(bounds[0], Math.min(bounds[1], next));
      setSize(next);
    };

    const onUp = () => {
      if (!dragging.current) return;
      dragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      saveUiState(storageKey, sizeRef.current);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [direction, getContainer, bounds, storageKey]);

  return { size, onMouseDown };
}
