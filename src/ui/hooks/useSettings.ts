import { useCallback, useEffect, useMemo } from 'react';
import type { ExtensionSettings } from '../../shared/types/Settings';
import { DEFAULT_SETTINGS } from '../../shared/constants/StorageDefaults';
import { makeBackgroundCall } from './useAsyncTask';
import { useBoundResource, type BoundResource } from './useBoundResource';

const fetchSettings = makeBackgroundCall(() => ({ type: 'settings/get' }) as const);

const patchSettings = makeBackgroundCall((patch: Partial<ExtensionSettings>) => ({
  type: 'settings/update',
  patch,
}) as const);

const resetSettings = makeBackgroundCall(() => ({ type: 'settings/reset' }) as const);

export interface SettingsApi extends BoundResource<ExtensionSettings> {
  settings: ExtensionSettings;
  update: (patch: Partial<ExtensionSettings>) => Promise<ExtensionSettings | null>;
  reset: () => Promise<ExtensionSettings | null>;
}

/**
 * Settings accessor.
 *
 * `settings` is never null: callers get the compiled-in defaults until the
 * stored blob arrives, which keeps every input controlled and avoids a flash of
 * empty form fields on open.
 */
export function useSettings(): SettingsApi {
  const resource = useBoundResource<ExtensionSettings>(fetchSettings);
  const settings = useMemo(() => resource.data ?? DEFAULT_SETTINGS, [resource.data]);

  // Theme and reduced-motion live on <html> so the whole document reacts
  // without threading a CSS class through every component.
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = settings.theme;
    root.dataset.reduceMotion = String(settings.reduceMotion);
  }, [settings.theme, settings.reduceMotion]);

  const update = useCallback(
    async (patch: Partial<ExtensionSettings>) => {
      const next = await patchSettings(patch);
      resource.mutate(next);
      return next;
    },
    [resource],
  );

  const reset = useCallback(async () => {
    const next = await resetSettings();
    resource.mutate(next);
    return next;
  }, [resource]);

  return { ...resource, settings, update, reset };
}
