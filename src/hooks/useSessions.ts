import { useCallback, useEffect, useState } from 'react';
import {
  clampOffsetMs,
  DEFAULT_EXPORT_OPTIONS,
  type ExportOptions,
  type ExportProgress,
  type ExportResult,
  type SessionInfo,
  type StorageInfo,
} from '../native/session';
import {
  cancelExportRun,
  loadSessions,
  readExportProgress,
  readStorage,
  removeRawFiles,
  removeSession,
  runExport,
  saveSessionFile,
} from '../native/sessions';

/** The recorded sessions and their exports. Raw files stay until you delete them. */
export function useSessions(active: boolean) {
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [storage, setStorage] = useState<StorageInfo | null>(null);
  const [options, setOptions] = useState<Record<string, ExportOptions>>({});
  const [exportingId, setExportingId] = useState<string | null>(null);
  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const [results, setResults] = useState<Record<string, ExportResult>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<Record<string, string>>({});

  const refresh = useCallback(async () => {
    const list = await loadSessions();
    if (list !== null) {
      setSessions(list);
    }
    setStorage(await readStorage());
  }, []);

  useEffect(() => {
    if (active) {
      refresh();
    }
  }, [active, refresh]);

  // While an export runs, read its progress.
  useEffect(() => {
    if (exportingId === null) {
      return undefined;
    }
    const id = setInterval(async () => {
      const p = await readExportProgress();
      if (p !== null) {
        setProgress(p);
      }
    }, 500);
    return () => clearInterval(id);
  }, [exportingId]);

  const optionsFor = useCallback(
    (id: string): ExportOptions => options[id] ?? DEFAULT_EXPORT_OPTIONS,
    [options],
  );

  const setOption = useCallback((id: string, patch: Partial<ExportOptions>) => {
    setOptions(prev => {
      const next = { ...(prev[id] ?? DEFAULT_EXPORT_OPTIONS), ...patch };
      return {
        ...prev,
        [id]: { ...next, videoLatencyMs: clampOffsetMs(next.videoLatencyMs), backingOffsetMs: clampOffsetMs(next.backingOffsetMs) },
      };
    });
  }, []);

  const exportOne = useCallback(
    async (id: string) => {
      if (exportingId !== null) {
        return;
      }
      setExportingId(id);
      setProgress({ stage: 'prepare', percent: 0, exporting: true });
      setErrors(prev => ({ ...prev, [id]: '' }));
      const result = await runExport(id, optionsFor(id));
      setExportingId(null);
      setProgress(null);
      if (result.ok) {
        setResults(prev => ({ ...prev, [id]: result.result }));
      } else {
        setErrors(prev => ({ ...prev, [id]: result.message }));
      }
      await refresh();
    },
    [exportingId, optionsFor, refresh],
  );

  const cancel = useCallback(async () => {
    await cancelExportRun();
  }, []);

  const saveFile = useCallback(async (id: string, path: string) => {
    const result = await saveSessionFile(path);
    if (result.ok) {
      setSaved(prev => ({ ...prev, [id]: result.location }));
    } else {
      setErrors(prev => ({ ...prev, [id]: result.message }));
    }
  }, []);

  const deleteRaw = useCallback(
    async (id: string) => {
      await removeRawFiles(id);
      await refresh();
    },
    [refresh],
  );

  const deleteSession = useCallback(
    async (id: string) => {
      await removeSession(id);
      await refresh();
    },
    [refresh],
  );

  return { sessions, storage, exportingId, progress, results, errors, saved, optionsFor, setOption, refresh, exportOne, cancel, saveFile, deleteRaw, deleteSession };
}

export type SessionsState = ReturnType<typeof useSessions>;