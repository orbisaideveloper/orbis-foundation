import { useCallback, useEffect, useRef } from "react";

/**
 * Threshold (ms) a pointer must remain down, without significant movement,
 * before the interaction is treated as a "long press".
 */
const DEFAULT_THRESHOLD_MS = 500;

/**
 * Movement (px) beyond which a held pointer is treated as a scroll/drag
 * gesture instead of a long press, and the pending long press is cancelled.
 */
const DEFAULT_MOVE_TOLERANCE_PX = 10;

export interface UseLongPressOptions {
  /** Called once the hold threshold is reached without cancellation. */
  onLongPress: (event: React.PointerEvent) => void;
  /** Ms to hold before the long press fires. Defaults to 500ms. */
  thresholdMs?: number;
  /** Px of movement allowed before the press is cancelled (scroll guard). */
  moveToleranceMs?: number;
  /** Disable the gesture entirely (e.g. menu already open). */
  disabled?: boolean;
}

export interface LongPressHandlers {
  onPointerDown: (event: React.PointerEvent) => void;
  onPointerMove: (event: React.PointerEvent) => void;
  onPointerUp: (event: React.PointerEvent) => void;
  onPointerCancel: (event: React.PointerEvent) => void;
  onPointerLeave: (event: React.PointerEvent) => void;
  onContextMenu: (event: React.MouseEvent) => void;
}

/**
 * Pointer-based long-press gesture. Intentionally uses pointer events (not
 * touch-specific ones) so it works uniformly across touch and mouse, and
 * cooperates with native scrolling by cancelling on movement past a small
 * tolerance rather than calling preventDefault on touchstart.
 */
export function useLongPress({
  onLongPress,
  thresholdMs = DEFAULT_THRESHOLD_MS,
  moveToleranceMs = DEFAULT_MOVE_TOLERANCE_PX,
  disabled = false,
}: UseLongPressOptions): LongPressHandlers {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startPointRef = useRef<{ x: number; y: number } | null>(null);
  const firedRef = useRef(false);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    startPointRef.current = null;
  }, []);

  // Always clear any pending timer on unmount.
  useEffect(() => clearTimer, [clearTimer]);

  const onPointerDown = useCallback(
    (event: React.PointerEvent) => {
      if (disabled) return;
      // Only primary button / primary touch contact triggers a long press.
      if (event.button !== undefined && event.button !== 0) return;

      firedRef.current = false;
      startPointRef.current = { x: event.clientX, y: event.clientY };

      const persistedEvent = event;
      timerRef.current = setTimeout(() => {
        firedRef.current = true;
        onLongPress(persistedEvent);
        clearTimer();
      }, thresholdMs);
    },
    [disabled, onLongPress, thresholdMs, clearTimer],
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent) => {
      const start = startPointRef.current;
      if (!start) return;
      const dx = Math.abs(event.clientX - start.x);
      const dy = Math.abs(event.clientY - start.y);
      if (dx > moveToleranceMs || dy > moveToleranceMs) {
        // Treat as a scroll/drag: cancel the pending long press.
        clearTimer();
      }
    },
    [moveToleranceMs, clearTimer],
  );

  const onPointerUp = useCallback(() => {
    clearTimer();
  }, [clearTimer]);

  const onPointerCancel = useCallback(() => {
    clearTimer();
  }, [clearTimer]);

  const onPointerLeave = useCallback(() => {
    clearTimer();
  }, [clearTimer]);

  const onContextMenu = useCallback(
    (event: React.MouseEvent) => {
      // Reuse the browser's native right-click / long-press-on-desktop
      // context menu trigger to open the same action menu, instead of
      // duplicating the gesture logic for desktop.
      if (disabled) return;
      event.preventDefault();
      onLongPress(event as unknown as React.PointerEvent);
    },
    [disabled, onLongPress],
  );

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    onPointerLeave,
    onContextMenu,
  };
}
