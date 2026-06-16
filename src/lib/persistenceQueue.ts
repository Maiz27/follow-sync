/**
 * App-wide serializer for cache (gist) writes. Follow/unfollow, bulk actions,
 * ghost removal and settings saves can all trigger a persist concurrently;
 * without serialization their read-modify-write cycles race, clobber each other,
 * and can even spawn duplicate gists. Chaining every write guarantees each one
 * observes the previous write's resulting gist id.
 *
 * This is intentionally a module-level singleton: the chain must be shared
 * across every hook instance and component, not per-render.
 */
let writeChain: Promise<unknown> = Promise.resolve();

/**
 * Enqueues a persistence task, running it only after every previously enqueued
 * task has settled (success or failure). Returns a promise that resolves/rejects
 * with the task's own result, so callers still see their individual outcome.
 */
export const enqueuePersist = <T>(task: () => Promise<T>): Promise<T> => {
  const run = writeChain.then(task, task);
  // Swallow result/error for the chain pointer so one failed write doesn't
  // reject every subsequent enqueue — each caller still gets `run`.
  writeChain = run.then(
    () => undefined,
    () => undefined
  );
  return run;
};
