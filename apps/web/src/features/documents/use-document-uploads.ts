import { useCallback, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { env } from '@/lib/env';
import * as api from './api';
import { documentKeys } from './hooks';
import { describeUploadFailure } from './upload-errors';
import { validateUploadFile } from './upload-rules';

export interface UploadItem {
  id: string;
  name: string;
  size: number;
  status: 'uploading' | 'done' | 'error';
  /** 0–100, from the browser's upload events. */
  progress: number;
  error?: string;
  retryable: boolean;
}

const RULES = { maxBytes: env.maxUploadBytes, extensions: env.documentExtensions };

/**
 * Per-file upload state (docs/UI-UX.md): each file succeeds or fails on its
 * own, "done" is only set after the API confirms, and a rejected file never
 * stops the others. Files are sent one after another to keep progress and
 * server load predictable.
 */
export function useDocumentUploads(projectId: string) {
  const queryClient = useQueryClient();
  const [items, setItems] = useState<UploadItem[]>([]);
  const files = useRef(new Map<string, File>());
  const counter = useRef(0);

  const patch = useCallback((id: string, changes: Partial<UploadItem>) => {
    setItems((current) => current.map((item) => (item.id === id ? { ...item, ...changes } : item)));
  }, []);

  const send = useCallback(
    async (id: string) => {
      const file = files.current.get(id);
      if (!file) return;
      patch(id, { status: 'uploading', progress: 0, error: undefined, retryable: false });
      try {
        await api.uploadDocument(projectId, file, (progress) => patch(id, { progress }));
        files.current.delete(id);
        patch(id, { status: 'done', progress: 100 });
        queryClient.invalidateQueries({ queryKey: documentKeys.all(projectId) });
        queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'activity'] });
      } catch (error) {
        const failure = describeUploadFailure(error);
        patch(id, { status: 'error', error: failure.message, retryable: failure.retryable });
      }
    },
    [patch, projectId, queryClient],
  );

  const addFiles = useCallback(
    async (selected: File[]) => {
      const created: UploadItem[] = selected.map((file) => {
        counter.current += 1;
        const id = `upload-${counter.current}`;
        const problem = validateUploadFile(file, RULES);
        if (!problem) files.current.set(id, file);
        return {
          id,
          name: file.name,
          size: file.size,
          status: problem ? 'error' : 'uploading',
          progress: 0,
          error: problem ?? undefined,
          retryable: false,
        };
      });
      setItems((current) => [...current, ...created]);
      for (const item of created) {
        if (item.status === 'uploading') await send(item.id);
      }
    },
    [send],
  );

  const retry = useCallback((id: string) => send(id), [send]);

  const dismiss = useCallback((id: string) => {
    files.current.delete(id);
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  /** Removes the given (finished) entries; the caller decides which, so nothing in flight is dropped. */
  const dismissMany = useCallback((ids: string[]) => {
    for (const id of ids) files.current.delete(id);
    const remove = new Set(ids);
    setItems((current) => current.filter((item) => !remove.has(item.id)));
  }, []);

  return { items, addFiles, retry, dismiss, dismissMany };
}
