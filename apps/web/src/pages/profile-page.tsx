import { Link } from 'react-router-dom';
import { Settings } from 'lucide-react';
import { useSetBreadcrumb } from '@/components/layout/breadcrumb-context';
import { QueryState } from '@/components/common/query-state';
import { Button } from '@/components/ui/button';
import { useOwnProfile } from '@/features/profile/hooks';
import { ProfileView } from '@/features/profile/profile-view';
import { EditProfileForm } from '@/features/profile/edit-profile-form';
import { ChangePasswordCard } from '@/features/profile/change-password-card';

export function ProfilePage() {
  useSetBreadcrumb('Perfil');
  const profileQuery = useOwnProfile();

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-6">
      <QueryState query={profileQuery}>
        {(profile) => (
          <ProfileView profile={profile} content={profile} isOwner={profile.isOwner}>
            <div className="flex flex-wrap items-center gap-2">
              <EditProfileForm profile={profile} />
              <Button variant="outline" size="sm" asChild>
                <Link to="/profile/sessions">
                  <Settings /> Sesiones
                </Link>
              </Button>
            </div>
          </ProfileView>
        )}
      </QueryState>

      <ChangePasswordCard />
    </div>
  );
}
