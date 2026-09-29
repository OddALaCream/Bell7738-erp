import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  "inline-flex items-center justify-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium w-fit whitespace-nowrap shrink-0 [&_svg]:size-3 [&_svg]:pointer-events-none",
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground',
        secondary: 'border-transparent bg-secondary text-secondary-foreground',
        outline: 'border-border text-foreground',
        destructive: 'border-transparent bg-destructive text-destructive-foreground',
        warning: 'border-transparent bg-warning text-warning-foreground',
        success: 'border-transparent bg-brand-600 text-white',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

export interface BadgeProps
  extends React.ComponentProps<'span'>,
    VariantProps<typeof badgeVariants> {
  asChild?: boolean;
}

function Badge({ className, variant, asChild = false, ...props }: BadgeProps) {
  const Comp = asChild ? Slot : 'span';
  return <Comp data-slot="badge" className={cn(badgeVariants({ variant, className }))} {...props} />;
}

export { Badge, badgeVariants };

/**
 * Role badge: color is presentation only (docs/PRODUCT.md — "no es una
 * fuente implícita de autoridad"). Renders the stored hex as a tinted
 * background while computing a readable foreground from its luminance.
 */
export function RoleBadge({ name, color }: { name: string; color: string }) {
  const normalized = /^#?[0-9a-fA-F]{6}$/.test(color) ? color.replace('#', '') : '6b7280';
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  const textColor = luminance > 0.6 ? '#111111' : '#ffffff';
  return (
    <span
      className="inline-flex w-fit shrink-0 items-center whitespace-nowrap rounded-md border px-2 py-0.5 text-xs font-medium"
      style={{ backgroundColor: `#${normalized}`, color: textColor, borderColor: `#${normalized}` }}
    >
      {name}
    </span>
  );
}
