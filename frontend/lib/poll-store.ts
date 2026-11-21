export type PollSnapshot<T> = { data?: T; error?: unknown };
export type PollEnvironment = {
  setInterval: (tick: () => void, ms: number) => () => void;
  isHidden: () => boolean;
  onVisibility: (listener: () => void) => () => void;
  onRefresh: (listener: () => void) => () => void;
};

export function createPollStore<T>(
  fetcher: (signal: AbortSignal) => Promise<T>,
  intervalMs: number,
  environment: PollEnvironment,
) {
  let snapshot: PollSnapshot<T> = {};
  const listeners = new Set<() => void>();
  let controller: AbortController | undefined;
  let stopTimer: (() => void) | undefined;
  let stopVisibility: (() => void) | undefined;
  let stopRefresh: (() => void) | undefined;

  const read = async () => {
    if (!listeners.size || environment.isHidden() || controller) return;
    const request = new AbortController();
    controller = request;
    try {
      const data = await fetcher(request.signal);
      if (!request.signal.aborted) snapshot = { data };
    } catch (error) {
      if (!request.signal.aborted) snapshot = { ...snapshot, error };
    } finally {
      if (controller === request) controller = undefined;
    }
    if (!request.signal.aborted) listeners.forEach((listener) => listener());
  };
  const visibility = () => {
    stopTimer?.();
    stopTimer = undefined;
    if (!environment.isHidden()) {
      void read();
      stopTimer = environment.setInterval(() => void read(), intervalMs);
    }
  };
  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      if (listeners.size === 1) {
        stopVisibility = environment.onVisibility(visibility);
        stopRefresh = environment.onRefresh(() => void read());
        visibility();
      }
      return () => {
        listeners.delete(listener);
        if (listeners.size) return;
        stopTimer?.();
        stopTimer = undefined;
        stopVisibility?.();
        stopRefresh?.();
        controller?.abort();
        controller = undefined;
      };
    },
  };
}
