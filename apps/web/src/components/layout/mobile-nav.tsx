import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetClose } from '@/components/ui/sheet';
import { useAuth } from '@/features/auth/auth-context';
import { adminNavItems, mainNavItems } from './nav-config';

const bottomItems = mainNavItems.filter((item) => item.primary);

export function MobileNav() {
  const [moreOpen, setMoreOpen] = useState(false);
  const { user } = useAuth();

  return (
    <>
      <nav
        className="fixed inset-x-0 bottom-0 z-30 flex h-16 items-stretch border-t border-border bg-background lg:hidden"
        aria-label="Navegación principal"
      >
        {bottomItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              cn(
                'touch-target flex flex-1 flex-col items-center justify-center gap-1 text-xs font-medium',
                isActive ? 'text-primary' : 'text-muted-foreground',
              )
            }
          >
            <item.icon className="size-5" aria-hidden="true" />
            {item.label}
          </NavLink>
        ))}
        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          className="touch-target flex flex-1 flex-col items-center justify-center gap-1 text-xs font-medium text-muted-foreground"
        >
          <Menu className="size-5" aria-hidden="true" />
          Más
        </button>
      </nav>

      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="bottom" className="max-h-[70vh]">
          <SheetHeader>
            <SheetTitle>Más opciones</SheetTitle>
          </SheetHeader>
          <nav className="mt-2 flex flex-col gap-1">
            {user?.isOwner &&
              adminNavItems.map((item) => (
                <SheetClose asChild key={item.to}>
                  <NavLink
                    to={item.to}
                    className={({ isActive }) =>
                      cn(
                        'touch-target flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium',
                        isActive ? 'bg-accent text-accent-foreground' : 'text-foreground hover:bg-accent',
                      )
                    }
                  >
                    <item.icon className="size-4" aria-hidden="true" />
                    {item.label}
                  </NavLink>
                </SheetClose>
              ))}
          </nav>
          <SheetClose asChild>
            <button
              type="button"
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-md border border-border py-2 text-sm font-medium"
            >
              <X className="size-4" /> Cerrar
            </button>
          </SheetClose>
        </SheetContent>
      </Sheet>
    </>
  );
}
