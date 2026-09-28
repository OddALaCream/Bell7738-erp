import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import * as api from './api';

export const invitationKeys = {
  list: (params: api.ListInvitationsParams) => ['invitations', 'list', params] as const,
  all: ['invitations'] as const,
};

export function useInvitations(params: api.ListInvitationsParams) {
  return useQuery({ queryKey: invitationKeys.list(params), queryFn: () => api.listInvitations(params) });
}

export function useCreateInvitation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.createInvitation,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: invitationKeys.all });
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
  });
}

export function useResendInvitation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.resendInvitation,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: invitationKeys.all });
    },
  });
}

export function useRevokeInvitation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.revokeInvitation,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: invitationKeys.all });
      toast.success('Invitación revocada.');
    },
  });
}
