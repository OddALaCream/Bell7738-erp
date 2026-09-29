import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import * as api from './api';

export const rbacKeys = {
  roles: ['roles'] as const,
  permissions: ['permissions'] as const,
  role: (id: string) => ['roles', id] as const,
};

export function useRoles() {
  return useQuery({ queryKey: rbacKeys.roles, queryFn: api.listRoles });
}

export function usePermissions() {
  return useQuery({ queryKey: rbacKeys.permissions, queryFn: api.listPermissions });
}

export function useRole(roleId: string | undefined) {
  return useQuery({
    queryKey: rbacKeys.role(roleId ?? ''),
    queryFn: () => api.getRole(roleId!),
    enabled: !!roleId,
  });
}

export function useCreateRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.createRole,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: rbacKeys.roles });
      toast.success('Rol creado.');
    },
  });
}

export function useUpdateRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ roleId, payload }: { roleId: string; payload: Partial<api.RolePayload> }) =>
      api.updateRole(roleId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: rbacKeys.roles });
      toast.success('Rol actualizado.');
    },
  });
}

export function useDeleteRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.deleteRole,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: rbacKeys.roles });
      toast.success('Rol eliminado.');
    },
  });
}
