import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import * as api from './api';

export const taskKeys = {
  all: (projectId: string) => ['projects', projectId, 'tasks'] as const,
  list: (projectId: string, params: api.ListTasksParams) => ['projects', projectId, 'tasks', 'list', params] as const,
  detail: (projectId: string, taskId: string) => ['projects', projectId, 'tasks', 'detail', taskId] as const,
};

export function useTasks(projectId: string, params: api.ListTasksParams) {
  return useQuery({ queryKey: taskKeys.list(projectId, params), queryFn: () => api.listTasks(projectId, params) });
}

export function useTask(projectId: string, taskId: string | undefined) {
  return useQuery({
    queryKey: taskKeys.detail(projectId, taskId ?? ''),
    queryFn: () => api.getTask(projectId, taskId!),
    enabled: !!taskId,
  });
}

function invalidateTasks(queryClient: ReturnType<typeof useQueryClient>, projectId: string) {
  queryClient.invalidateQueries({ queryKey: taskKeys.all(projectId) });
  // Derived read models (schedule, dashboard, timeline, calendar) consume the same tasks.
  queryClient.invalidateQueries({ queryKey: ['schedule'] });
  queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'timeline'] });
  queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'calendar'] });
}

export function useCreateTask(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: api.CreateTaskPayload) => api.createTask(projectId, payload),
    onSuccess: () => {
      invalidateTasks(queryClient, projectId);
      toast.success('Tarea creada.');
    },
  });
}

export function useUpdateTask(projectId: string, taskId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: api.UpdateTaskPayload) => api.updateTask(projectId, taskId, payload),
    onSuccess: () => {
      invalidateTasks(queryClient, projectId);
      toast.success('Tarea actualizada.');
    },
  });
}

export function useCompleteTask(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (taskId: string) => api.completeTask(projectId, taskId),
    onSuccess: () => invalidateTasks(queryClient, projectId),
  });
}

export function useReopenTask(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (taskId: string) => api.reopenTask(projectId, taskId),
    onSuccess: () => invalidateTasks(queryClient, projectId),
  });
}

export function useSetTaskAssignees(projectId: string, taskId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (assigneeIds: string[]) => api.setTaskAssignees(projectId, taskId, assigneeIds),
    onSuccess: () => {
      invalidateTasks(queryClient, projectId);
      toast.success('Asignados actualizados.');
    },
  });
}

export function useDeleteTask(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (taskId: string) => api.deleteTask(projectId, taskId),
    onSuccess: () => {
      invalidateTasks(queryClient, projectId);
      toast.success('Tarea eliminada.');
    },
  });
}
