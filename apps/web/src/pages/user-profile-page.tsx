import { useParams } from 'react-router-dom';
import { useSetBreadcrumb } from '@/components/layout/breadcrumb-context';
import { QueryState } from '@/components/common/query-state';
import { useUserProfile } from '@/features/profile/hooks';
import { ProfileView } from '@/features/profile/profile-view';

export function UserProfilePage() {
  const { userId } = useParams<{ userId: string }>();
  useSetBreadcrumb('Perfil de usuario');
  const profileQuery = useUserProfile(userId);

  return (
    <div className="mx-auto max-w-3xl p-4 sm:p-6">
      <QueryState query={profileQuery}>{(profile) => <ProfileView profile={profile} />}</QueryState>
    </div>
  );
}
