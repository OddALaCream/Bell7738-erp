import { Link, useParams } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import { useSetBreadcrumb } from '@/components/layout/breadcrumb-context';
import { QueryState } from '@/components/common/query-state';
import { Button } from '@/components/ui/button';
import { canAny } from '@/lib/permissions';
import { useAuth } from '@/features/auth/auth-context';
import { useUserProfile } from '@/features/profile/hooks';
import { ProfileView } from '@/features/profile/profile-view';

export function UserProfilePage() {
  const { userId } = useParams<{ userId: string }>();
  const { user, can } = useAuth();
  useSetBreadcrumb('Perfil de usuario');
  const profileQuery = useUserProfile(userId);

  // A shortcut for people who administer users; the admin screen and the API still decide.
  const canAdminister =
    can('USERS_VIEW') && canAny(can, 'USERS_UPDATE', 'USERS_ROLES_MANAGE', 'USERS_DISABLE');

  return (
    <div className="mx-auto max-w-3xl p-4 sm:p-6">
      <QueryState query={profileQuery}>
        {(profile) => (
          <ProfileView profile={profile} content={profile}>
            {canAdminister && user?.id !== profile.id && (
              <Button variant="outline" size="sm" asChild>
                <Link to={`/admin/users?search=${encodeURIComponent(profile.email)}`}>
                  <ShieldCheck /> Administrar usuario y roles
                </Link>
              </Button>
            )}
          </ProfileView>
        )}
      </QueryState>
    </div>
  );
}
