'use client';

import { useState, useEffect, useRef } from 'react';
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

  // Mirror getContainer and bounds in refs so the mousemove/mouseup
  // effect below doesn't need them in its dep array.
  //
  // Both callers (EditorPanel, ProblemWorkspace) pass these as fresh
  // values every render:
  //   getContainer: () => myRef.current   (a brand-new arrow function)
  //   bounds:       [20, 70]              (a brand-new array literal)
  //
  // Listing either in the effect deps rebinds the global window
  // mousemove/mouseup listeners on every parent re-render. The host
  // ProblemWorkspace re-renders constantly while a test run is in
  // flight (output lines arriving, sentinel events, cursor moves),
  // so without these refs we get hundreds of rebinds during a single
  // run. Worse, if the user happens to be dragging the resizer at the
  // same time as a test run streams output, the global listeners are
  // rebound MID-DRAG — every cleanup → re-add cycle opens a microtask
  // window where mouseup/mousemove can land between listeners and
  // either drop events or strand `dragging.current = true` after the
  // mouse has been released.
  const getContainerRef = useRef(getContainer);
  const boundsRef = useRef(bounds);
  getContainerRef.current = getContainer;
  boundsRef.current = bounds;

  // Restore from localStorage after hydration to avoid SSR mismatch
  useEffect(() => {
    const saved = loadUiState(storageKey, initial);
    if (saved !== initial) setSize(saved);
  }, [storageKey, initial]);

  const onMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    document.body.style.cursor = direction === 'horizontal' ? 'col-resize' : 'row-resize';
    document.body.style.userSelect = 'none';
  };

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      const el = getContainerRef.current();
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const [boundsMin, boundsMax] = boundsRef.current;
      let next: number;
      if (direction === 'horizontal') {
        next = ((e.clientX - rect.left) / rect.width) * 100;
      } else {
        next = rect.bottom - e.clientY;
      }
      next = Math.max(boundsMin, Math.min(boundsMax, next));
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
  }, [direction, storageKey]);

  return { size, onMouseDown };
}
