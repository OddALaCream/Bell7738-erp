import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { ProjectRole } from '@/types/domain';
import * as api from './api';

export const projectKeys = {
  all: ['projects'] as const,
  list: (params: api.ListProjectsParams) => ['projects', 'list', params] as const,
  detail: (id: string) => ['projects', 'detail', id] as const,
  members: (id: string) => ['projects', id, 'members'] as const,
};

export function useProjects(params: api.ListProjectsParams) {
  return useQuery({ queryKey: projectKeys.list(params), queryFn: () => api.listProjects(params) });
}

export function useProject(projectId: string | undefined) {
  return useQuery({
    queryKey: projectKeys.detail(projectId ?? ''),
    queryFn: () => api.getProject(projectId!),
    enabled: !!projectId,
  });
}

export function useCreateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.createProject,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: projectKeys.all });
      toast.success('Proyecto creado.');
    },
  });
}

export function useUpdateProject(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: Parameters<typeof api.updateProject>[1]) => api.updateProject(projectId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: projectKeys.all });
      toast.success('Proyecto actualizado.');
    },
  });
}

export function useDeleteProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.deleteProject,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: projectKeys.all });
      toast.success('Proyecto eliminado.');
    },
  });
}

export function useProjectMembers(projectId: string) {
  return useQuery({ queryKey: projectKeys.members(projectId), queryFn: () => api.listProjectMembers(projectId) });
}

export function useAddProjectMember(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: ProjectRole }) =>
      api.addProjectMember(projectId, userId, role),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: projectKeys.members(projectId) });
      toast.success('Miembro añadido.');
    },
  });
}

export function useUpdateProjectMemberRole(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: ProjectRole }) =>
      api.updateProjectMemberRole(projectId, userId, role),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: projectKeys.members(projectId) });
      toast.success('Rol actualizado.');
    },
  });
}

export function useRemoveProjectMember(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => api.removeProjectMember(projectId, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: projectKeys.members(projectId) });
      toast.success('Miembro retirado.');
    },
  });
}
