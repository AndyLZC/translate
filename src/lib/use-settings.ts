import { useEffect, useState } from 'react';
import { getSettings, updateSettings, watchSettings, type Settings } from './settings';

export function useSettings() {
  const [settings, setSettings] = useState<Settings | null>(null);
  useEffect(() => {
    void getSettings().then(setSettings);
    return watchSettings(setSettings);
  }, []);
  const update = async (patch: Partial<Settings>) => setSettings(await updateSettings(patch));
  return [settings, update] as const;
}
