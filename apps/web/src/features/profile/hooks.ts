import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useAuth } from '@/features/auth/auth-context';
import * as api from './api';

export const profileKeys = {
  own: ['profile', 'me'] as const,
  user: (id: string) => ['profile', 'user', id] as const,
};

export function useOwnProfile() {
  return useQuery({ queryKey: profileKeys.own, queryFn: api.getOwnProfile });
}

export function useUserProfile(userId: string | undefined) {
  return useQuery({
    queryKey: profileKeys.user(userId ?? ''),
    queryFn: () => api.getUserProfile(userId!),
    enabled: !!userId,
  });
}

export function useUpdateOwnProfile() {
  const queryClient = useQueryClient();
  const { refreshUser } = useAuth();
  return useMutation({
    mutationFn: api.updateOwnProfile,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: profileKeys.own });
      await refreshUser();
      toast.success('Perfil actualizado.');
    },
  });
}

export function useChangePassword() {
  return useMutation({
    mutationFn: ({ currentPassword, newPassword }: { currentPassword: string; newPassword: string }) =>
      api.changePassword(currentPassword, newPassword),
  });
}
