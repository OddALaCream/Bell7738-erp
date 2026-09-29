import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { NotFoundState } from '@/components/common/error-state';

export function NotFoundPage() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6">
      <NotFoundState title="Página no encontrada" className="border-none" />
      <Button asChild>
        <Link to="/">Volver al dashboard</Link>
      </Button>
    </div>
  );
}
