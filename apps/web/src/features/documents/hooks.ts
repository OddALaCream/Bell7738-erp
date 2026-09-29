import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import * as api from './api';

export const documentKeys = {
  all: (projectId: string) => ['projects', projectId, 'documents'] as const,
  list: (projectId: string, params: api.ListDocumentsParams) => ['projects', projectId, 'documents', 'list', params] as const,
};

export function useDocuments(projectId: string, params: api.ListDocumentsParams) {
  return useQuery({
    queryKey: documentKeys.list(projectId, params),
    queryFn: () => api.listDocuments(projectId, params),
    placeholderData: keepPreviousData,
  });
}

export function useDeleteDocument(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (documentId: string) => api.deleteDocument(projectId, documentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: documentKeys.all(projectId) });
      queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'activity'] });
      toast.success('Documento eliminado.');
    },
  });
}
