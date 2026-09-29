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

function channelLuminance(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** WCAG relative luminance of an sRGB color. */
function relativeLuminance(r: number, g: number, b: number): number {
  return 0.2126 * channelLuminance(r) + 0.7152 * channelLuminance(g) + 0.0722 * channelLuminance(b);
}

const DARK_TEXT = '#111111';
const DARK_TEXT_LUMINANCE = relativeLuminance(17, 17, 17);

/** Whichever of white or near-black text reads better on the given background (WCAG contrast ratio). */
export function readableTextColor(hex: string): string {
  const normalized = /^#?[0-9a-fA-F]{6}$/.test(hex) ? hex.replace('#', '') : '6b7280';
  const luminance = relativeLuminance(
    parseInt(normalized.slice(0, 2), 16),
    parseInt(normalized.slice(2, 4), 16),
    parseInt(normalized.slice(4, 6), 16),
  );
  const withWhite = 1.05 / (luminance + 0.05);
  const withDark = (luminance + 0.05) / (DARK_TEXT_LUMINANCE + 0.05);
  return withWhite >= withDark ? '#ffffff' : DARK_TEXT;
}

/**
 * Role badge: color is presentation only (docs/PRODUCT.md — "no es una
 * fuente implícita de autoridad"). Renders the stored hex as the background
 * and picks the text color with the higher contrast, so any admin-chosen
 * color stays as legible as it can be.
 */
export function RoleBadge({ name, color }: { name: string; color: string }) {
  const normalized = /^#?[0-9a-fA-F]{6}$/.test(color) ? color.replace('#', '') : '6b7280';
  const textColor = readableTextColor(normalized);
  return (
    <span
      className="inline-flex w-fit shrink-0 items-center whitespace-nowrap rounded-md border px-2 py-0.5 text-xs font-medium"
      style={{ backgroundColor: `#${normalized}`, color: textColor, borderColor: `#${normalized}` }}
    >
      {name}
    </span>
  );
}
