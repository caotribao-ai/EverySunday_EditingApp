/** Mutable scope bridge so lazy-loaded editor chunk can access StudioApp state. */
export const studioScope: Record<string, unknown> = {};

export function useStudioScope<T extends Record<string, unknown> = Record<string, unknown>>() {
  return studioScope as T;
}
