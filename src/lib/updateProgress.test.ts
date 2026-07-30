import { describe, expect, it, vi } from 'vitest';
import { scheduleLatestProgressFrame } from './updateProgress';

describe('scheduleLatestProgressFrame', () => {
  it('commits the latest accumulated progress when several chunks arrive in one frame', () => {
    let downloaded = 10;
    const total = 100;
    const scheduledFrames: FrameRequestCallback[] = [];
    const commit = vi.fn();
    const frameRef = { current: null as number | null };
    const requestFrame = vi.fn((callback: FrameRequestCallback) => {
      scheduledFrames.push(callback);
      return 42;
    });

    scheduleLatestProgressFrame(frameRef, () => downloaded / total, commit, requestFrame);
    downloaded += 60;
    scheduleLatestProgressFrame(frameRef, () => downloaded / total, commit, requestFrame);

    expect(requestFrame).toHaveBeenCalledTimes(1);
    expect(scheduledFrames).toHaveLength(1);
    scheduledFrames[0](0);

    expect(commit).toHaveBeenCalledWith(0.7);
    expect(frameRef.current).toBeNull();
  });

  it('does not commit when a total size is unavailable', () => {
    const scheduledFrames: FrameRequestCallback[] = [];
    const commit = vi.fn();
    const frameRef = { current: null as number | null };

    scheduleLatestProgressFrame(
      frameRef,
      () => null,
      commit,
      (callback) => {
        scheduledFrames.push(callback);
        return 1;
      },
    );
    scheduledFrames[0](0);

    expect(commit).not.toHaveBeenCalled();
  });
});
