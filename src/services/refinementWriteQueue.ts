let pending = Promise.resolve()

export function trackRefinementWrite<T>(task: Promise<T>): Promise<T> {
  const tracked = pending.then(() => task)
  pending = tracked.then(() => undefined, () => undefined)
  return tracked
}

export async function waitForRefinementWrites(): Promise<void> {
  await pending
}
