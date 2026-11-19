'use client';
import { useEffect, useRef, type MouseEvent } from 'react';
export function useModal(open: boolean, close: () => void) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const node = ref.current;
    if (!open || !node) return;
    const opener = document.activeElement as HTMLElement | null;
    node.showModal();
    return () => {
      node.close();
      opener?.focus();
    };
  }, [open]);
  const onClick = (event: MouseEvent<HTMLDialogElement>) => {
    if (event.target !== event.currentTarget) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (
      event.clientX < rect.left ||
      event.clientX > rect.right ||
      event.clientY < rect.top ||
      event.clientY > rect.bottom
    )
      close();
  };
  return { ref, onClick, onCancel: close };
}
