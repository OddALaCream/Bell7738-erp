import { Link } from 'react-router-dom';
import { Settings } from 'lucide-react';
import { useSetBreadcrumb } from '@/components/layout/breadcrumb-context';
import { QueryState } from '@/components/common/query-state';
import { Button } from '@/components/ui/button';
import { useProjects } from '@/features/projects/hooks';
import { useOwnProfile } from '@/features/profile/hooks';
import { buildOwnProfileContent } from '@/features/profile/profile-content';
import { ProfileView, type SectionState } from '@/features/profile/profile-view';
import { EditProfileForm } from '@/features/profile/edit-profile-form';
import { ChangePasswordCard } from '@/features/profile/change-password-card';
import { useMySchedule } from '@/features/schedule/hooks';

function sectionState(query: { isPending: boolean; isError: boolean }): SectionState {
  return query.isError ? 'error' : query.isPending ? 'loading' : 'ready';
}

export function ProfilePage() {
  useSetBreadcrumb('Perfil');
  const profileQuery = useOwnProfile();
  // `/me/profile` returns empty project/task lists today, so those come from endpoints that do have data.
  const tasksQuery = useMySchedule({ kind: 'task' });
  const projectsQuery = useProjects({ pageSize: 100 });

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-6">
      <QueryState query={profileQuery}>
        {(profile) => (
          <ProfileView
            profile={profile}
            content={buildOwnProfileContent(
              tasksQuery.data ?? [],
              projectsQuery.data?.data ?? [],
              profile.isOwner ? ['Owner', ...profile.roles] : profile.roles,
            )}
            tasksState={sectionState(tasksQuery)}
            projectsState={sectionState(projectsQuery)}
          >
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
