import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import * as api from './api';

export const userKeys = {
  all: ['users'] as const,
  list: (params: api.ListUsersParams) => ['users', 'list', params] as const,
  detail: (id: string) => ['users', 'detail', id] as const,
  team: (params: api.ListTeamParams) => ['team', params] as const,
};

export function useUsers(params: api.ListUsersParams) {
  return useQuery({ queryKey: userKeys.list(params), queryFn: () => api.listUsers(params) });
}

export function useUser(userId: string | undefined) {
  return useQuery({
    queryKey: userKeys.detail(userId ?? ''),
    queryFn: () => api.getUser(userId!),
    enabled: !!userId,
  });
}

export function useTeam(params: api.ListTeamParams) {
  return useQuery({ queryKey: userKeys.team(params), queryFn: () => api.listTeam(params) });
}

function useUserMutation(mutationFn: (userId: string) => Promise<unknown>, successMessage: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: userKeys.all });
      toast.success(successMessage);
    },
  });
}

export function useSuspendUser() {
  return useUserMutation(api.suspendUser, 'Usuario suspendido.');
}

export function useReactivateUser() {
  return useUserMutation(api.reactivateUser, 'Usuario reactivado.');
}

export function useDisableUser() {
  return useUserMutation(api.disableUser, 'Usuario deshabilitado.');
}

export function useUpdateUser(userId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: api.UpdateUserPayload) => api.updateUser(userId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: userKeys.all });
      toast.success('Usuario actualizado.');
    },
  });
}

export function useAssignUserRoles(userId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (roleIds: string[]) => api.assignUserRoles(userId, roleIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: userKeys.all });
      toast.success('Roles actualizados.');
    },
  });
}
