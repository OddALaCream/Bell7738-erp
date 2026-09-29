import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

/** Previous/next for the API's page-based lists; renders nothing when there is a single page. */
export function Pagination({
  page,
  totalPages,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}) {
  if (totalPages <= 1) return null;
  return (
    <nav aria-label="Paginación" className="flex items-center justify-between gap-2">
      <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
        <ChevronLeft /> Anterior
      </Button>
      <p className="text-xs text-muted-foreground">
        Página {page} de {totalPages}
      </p>
      <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>
        Siguiente <ChevronRight />
      </Button>
    </nav>
  );
}
