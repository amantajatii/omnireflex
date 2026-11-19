export function createSWRCache<T>(
  initial: T,
  refresh: (publish: (value: T) => void) => Promise<void>,
  options: { ttl?: number; coldTimeout?: number; now?: () => number } = {},
) {
  const now = options.now ?? Date.now;
  let value = initial,
    updatedAt = 0,
    ready = false,
    flight: Promise<void> | undefined;
  let firstPublish: Promise<void>;
  let published: () => void;
  const publish = (next: T) => {
    value = next;
    ready = true;
    published?.();
  };
  return {
    async get() {
      if (!flight && (!ready || now() - updatedAt >= (options.ttl ?? 10000))) {
        firstPublish = new Promise((resolve) => {
          published = resolve;
        });
        flight = Promise.resolve()
          .then(() => refresh(publish))
          .catch(() => {
            /* Keep the last snapshot; refresh owns per-chain errors. */
          })
          .finally(() => {
            updatedAt = now();
            flight = undefined;
          });
      }
      if (!ready && flight) {
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          await Promise.race([
            flight,
            firstPublish!,
            new Promise<void>((resolve) => {
              timer = setTimeout(resolve, options.coldTimeout ?? 8000);
            }),
          ]);
        } finally {
          clearTimeout(timer);
        }
      }
      return value;
    },
  };
}
