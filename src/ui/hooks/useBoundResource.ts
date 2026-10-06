import { useCallback, useEffect, useRef, useState } from 'react';
import { BackgroundTransportError } from '../../shared/messaging/MessageBus';

export interface ResourceState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  /** Settles the first load so the UI can tell "empty" from "not yet loaded". */
  loaded: boolean;
}

export interface BoundResource<T> extends ResourceState<T> {
  reload: () => Promise<void>;
  /** Optimistic local write; the next `reload` reconciles with the source. */
  set: (updater: T | ((current: T | null) => T | null)) => void;
  mutate: (next: T) => void;
}

/**
 * Reads a background-backed resource on mount and keeps it refreshable.
 *
 * The hook's whole job is to make "load it, then let the user act on it"
 * safe: an unmounted component never receives a state update, and a slow
 * first load cannot overwrite the result of a newer reload.
 */
export function useBoundResource<T>(
  loader: () => Promise<T>,
  options: { auto?: boolean } = {},
): BoundResource<T> {
  const { auto = true } = options;

  const [state, setState] = useState<ResourceState<T>>({
    data: null,
    error: null,
    loading: auto,
    loaded: false,
  });

  const mountedRef = useRef(true);
  const loadIdRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const reload = useCallback(async () => {
    loadIdRef.current += 1;
    const loadId = loadIdRef.current;

    setState((previous) => ({ ...previous, loading: true, error: null }));

    try {
      const data = await loader();
      if (mountedRef.current && loadId === loadIdRef.current) {
        setState({ data, error: null, loading: false, loaded: true });
      }
    } catch (error) {
      const message =
        error instanceof BackgroundTransportError
          ? error.message
          : error instanceof Error
            ? error.message
            : 'Could not load data.';

      if (mountedRef.current && loadId === loadIdRef.current) {
        setState((previous) => ({ ...previous, error: message, loading: false, loaded: true }));
      }
    }
  }, [loader]);

  useEffect(() => {
    if (auto) void reload();
  }, [auto, reload]);

  const set = useCallback(
    (updater: T | ((current: T | null) => T | null)) => {
      setState((previous) => {
        const next =
          typeof updater === 'function'
            ? (updater as (current: T | null) => T | null)(previous.data)
            : updater;
        return { ...previous, data: next };
      });
    },
    [],
  );

  const mutate = useCallback((next: T) => set(next), [set]);

  return { ...state, reload, set, mutate };
}
