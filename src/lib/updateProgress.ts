export interface AnimationFrameRef {
  current: number | null;
}

/**
 * Coalesce download events to one React update per animation frame.
 *
 * The progress value is intentionally read inside the frame callback.
 * Updater channels can deliver many chunks in the same frame; capturing
 * the value when the first chunk arrives would render a stale percentage.
 */
export function scheduleLatestProgressFrame(
  frameRef: AnimationFrameRef,
  readLatest: () => number | null,
  commit: (progress: number) => void,
  requestFrame: (callback: FrameRequestCallback) => number = requestAnimationFrame,
): void {
  if (frameRef.current !== null) return;

  frameRef.current = requestFrame(() => {
    frameRef.current = null;
    const progress = readLatest();
    if (progress !== null) commit(progress);
  });
}
