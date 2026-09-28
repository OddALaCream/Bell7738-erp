import { api, http } from '@/lib/api-client';
import type { ApiCollectionResponse } from '@/lib/api-types';
import type { ProjectDocument } from '@/types/domain';

export interface ListDocumentsParams {
  search?: string;
  page?: number;
  pageSize?: number;
  sort?: 'createdAt' | 'originalName';
  order?: 'asc' | 'desc';
}

export async function listDocuments(projectId: string, params: ListDocumentsParams = {}) {
  const { data } = await http.get<ApiCollectionResponse<ProjectDocument>>(`/projects/${projectId}/documents`, { params });
  return data;
}

/** Multipart with a single `file` part — the API rejects any other field. */
export function uploadDocument(
  projectId: string,
  file: File,
  onProgress?: (percent: number) => void,
): Promise<ProjectDocument> {
  const body = new FormData();
  body.append('file', file);
  return api.post<ProjectDocument>(`/projects/${projectId}/documents`, body, {
    onUploadProgress: (event) => {
      if (onProgress && event.total) onProgress(Math.round((event.loaded / event.total) * 100));
    },
  });
}

/**
 * Downloads through the authorized endpoint (which re-checks access each time)
 * as a blob, because the request needs the bearer token; a plain link couldn't carry it.
 */
export async function downloadDocument(projectId: string, documentId: string): Promise<Blob> {
  const { data } = await http.get<Blob>(`/projects/${projectId}/documents/${documentId}/download`, {
    responseType: 'blob',
  });
  return data;
}

export async function deleteDocument(projectId: string, documentId: string): Promise<void> {
  await http.delete(`/projects/${projectId}/documents/${documentId}`);
}
