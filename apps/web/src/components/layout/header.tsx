import { Link } from 'react-router-dom';
import { LogOut, Settings, ShieldAlert, UserCircle } from 'lucide-react';
import { useAuth } from '@/features/auth/auth-context';
import { NotificationBell } from '@/features/notifications/notification-bell';
import { UserAvatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { fullName } from '@/lib/utils';
import { SidebarTrigger } from './sidebar';

export function Header({ breadcrumb }: { breadcrumb?: React.ReactNode }) {
  const { user, logout } = useAuth();
  if (!user) return null;

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b border-border bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <SidebarTrigger className="hidden lg:inline-flex" />
      <div className="min-w-0 flex-1 text-sm font-medium text-muted-foreground [&_a:hover]:text-foreground [&_a]:text-foreground">
        {breadcrumb}
      </div>
      <NotificationBell />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="h-9 gap-2 px-2">
            <UserAvatar firstName={user.firstName} lastName={user.lastName} className="size-7" />
            <span className="hidden max-w-32 truncate text-sm font-medium sm:inline">{user.firstName}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="font-normal">
            <p className="truncate text-sm font-medium">{fullName(user)}</p>
            <p className="truncate text-xs text-muted-foreground">{user.email}</p>
            {user.isOwner && (
              <p className="mt-1 flex items-center gap-1 text-xs text-brand-600">
                <ShieldAlert className="size-3" /> Organization Owner
              </p>
            )}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link to="/profile">
              <UserCircle /> Mi perfil
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link to="/profile/sessions">
              <Settings /> Sesiones
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => void logout()}>
            <LogOut /> Cerrar sesión
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
