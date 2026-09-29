import { keepPreviousData, useQuery } from '@tanstack/react-query';
import * as api from './api';

export function useAuditLog(params: api.ListAuditParams) {
  return useQuery({
    queryKey: ['audit', 'list', params],
    queryFn: () => api.listAudit(params),
    placeholderData: keepPreviousData,
  });
}
