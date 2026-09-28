import { Link, useParams } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import { useSetBreadcrumb } from '@/components/layout/breadcrumb-context';
import { QueryState } from '@/components/common/query-state';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/features/auth/auth-context';
import { useUserProfile } from '@/features/profile/hooks';
import { isProfilePopulated } from '@/features/profile/profile-content';
import { ProfileView } from '@/features/profile/profile-view';

const UNPOPULATED_NOTE =
  'El servidor todavía no informa los roles, proyectos ni tareas en el perfil de otras personas; aparecerán aquí cuando esté disponible.';

export function UserProfilePage() {
  const { userId } = useParams<{ userId: string }>();
  const { user } = useAuth();
  useSetBreadcrumb('Perfil de usuario');
  const profileQuery = useUserProfile(userId);

  return (
    <div className="mx-auto max-w-3xl p-4 sm:p-6">
      <QueryState query={profileQuery}>
        {(profile) => (
          <ProfileView profile={profile} content={profile} note={isProfilePopulated(profile) ? undefined : UNPOPULATED_NOTE}>
            {/* Only the Owner is knowable client-side (see FRONTEND_BACKEND_GAPS.md); the API still decides. */}
            {user?.isOwner && user.id !== profile.id && (
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
