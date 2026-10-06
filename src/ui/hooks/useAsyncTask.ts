import { useCallback, useEffect, useRef, useState } from 'react';
import { BackgroundTransportError, sendToBackground } from '../../shared/messaging/MessageBus';
import type {
  BackgroundRequest,
  BackgroundResponse,
  ResponsePayloadMap,
} from '../../shared/types/Messages';

export interface AsyncTaskState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  /** True once a run has completed at least once. */
  settled: boolean;
}

export interface AsyncTask<TArgs extends unknown[], TResult>
  extends AsyncTaskState<TResult> {
  run: (...args: TArgs) => Promise<TResult | null>;
  reset: () => void;
  /** Kept in a ref so effect cleanup can check without re-subscribing. */
  isMounted: () => boolean;
}

/**
 * Minimal async state machine for UI actions.
 *
 * Two details matter here:
 *  - `run` never throws. Every failure becomes `error`, so a caller can wire it
 *    straight into a button without a try/catch in JSX.
 *  - results from a superseded run are discarded, so rapid re-clicks cannot
 *    paint a stale response over a newer one.
 */
export function useAsyncTask<TArgs extends unknown[], TResult>(
  task: (...args: TArgs) => Promise<TResult>,
): AsyncTask<TArgs, TResult> {
  const [state, setState] = useState<AsyncTaskState<TResult>>({
    data: null,
    error: null,
    loading: false,
    settled: false,
  });

  const runIdRef = useRef(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const run = useCallback(
    async (...args: TArgs): Promise<TResult | null> => {
      runIdRef.current += 1;
      const runId = runIdRef.current;

      setState((previous) => ({ ...previous, loading: true, error: null }));

      try {
        const result = await task(...args);
        if (mountedRef.current && runId === runIdRef.current) {
          setState({ data: result, error: null, loading: false, settled: true });
        }
        return result;
      } catch (error) {
        const message =
          error instanceof BackgroundTransportError
            ? error.message
            : error instanceof Error
              ? error.message
              : 'Something went wrong.';

        if (mountedRef.current && runId === runIdRef.current) {
          setState((previous) => ({ ...previous, error: message, loading: false, settled: true }));
        }
        return null;
      }
    },
    [task],
  );

  const reset = useCallback(() => {
    runIdRef.current += 1;
    setState({ data: null, error: null, loading: false, settled: false });
  }, []);

  const isMounted = useCallback(() => mountedRef.current, []);

  return { ...state, run, reset, isMounted };
}

/**
 * Types a background call and returns it ready for `useAsyncTask`.
 * Keeps the request/response pairing in one place instead of repeating the
 * generic dance at every call site.
 */
export function backgroundCall<TType extends BackgroundRequest['type']>(
  request: Extract<BackgroundRequest, { type: TType }>,
): () => Promise<ResponsePayloadMap[TType]> {
  return async () => {
    const response = (await sendToBackground(request)) as BackgroundResponse<
      ResponsePayloadMap[TType]
    >;

    if (!response.ok) throw new BackgroundTransportError(response.error);
    return response.data;
  };
}

/** Same as {@link backgroundCall} but accepts arguments for parameterised calls. */
export function makeBackgroundCall<TType extends BackgroundRequest['type'], TArgs extends unknown[]>(
  build: (...args: TArgs) => Extract<BackgroundRequest, { type: TType }>,
): (...args: TArgs) => Promise<ResponsePayloadMap[TType]> {
  return async (...args: TArgs) => {
    const response = (await sendToBackground(
      build(...args),
    )) as BackgroundResponse<ResponsePayloadMap[TType]>;

    if (!response.ok) throw new BackgroundTransportError(response.error);
    return response.data;
  };
}
