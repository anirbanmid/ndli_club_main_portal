import { useEffect, useRef } from 'react';

/**
 * S1 interaction polish — shared behaviour for every dialog overlay:
 *  - Escape closes the dialog
 *  - backdrop click closes the dialog (wired at the overlay in JSX)
 *  - page scroll is locked while a dialog is open
 *  - focus moves into the dialog on open and returns to the trigger on close
 *
 * Usage: call unconditionally near the top of the component (before any
 * early `return null`), passing `open` and the close callback. The callback
 * may be an inline arrow — effects subscribe to `open` only and read the
 * latest callback through a ref, so re-renders never re-trigger focus.
 */
export function useModalBehavior(open: boolean, onClose: () => void): void {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Escape closes
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  // Lock body scroll while open (restore previous value on close)
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  // Focus the first focusable element inside the topmost dialog on open;
  // return focus to the previously focused element on close.
  useEffect(() => {
    if (!open) return;
    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialogs = document.querySelectorAll('[role="dialog"]');
    const dialog = dialogs.item(dialogs.length - 1) as HTMLElement | null;
    if (dialog) {
      const focusable = dialog.querySelector<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      (focusable ?? dialog).focus();
    }
    return () => {
      if (previouslyFocused && document.contains(previouslyFocused)) {
        previouslyFocused.focus();
      }
    };
  }, [open]);
}
