import { Construction } from 'lucide-react';
import { EmptyState } from './empty-state';

/** Placeholder for a route not yet implemented in the current build block. */
export function ComingSoon({ title }: { title: string }) {
  return (
    <div className="p-6">
      <EmptyState icon={Construction} title={title} description="Esta sección se implementará en un próximo bloque." />
    </div>
  );
}
