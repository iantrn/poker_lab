/** Browser-safe factory so Vite emits the typed postflop Worker as its own bundle. */
export function createTypedPostflopWorker(): Worker {
  return new Worker(new URL("./postflop.worker.ts", import.meta.url), {type:"module"});
}
