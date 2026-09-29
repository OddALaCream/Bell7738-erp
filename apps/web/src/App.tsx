import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router-dom';
import { Toaster } from 'sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { queryClient } from '@/lib/query-client';
import { AuthProvider } from '@/features/auth/auth-provider';
import { PwaPrompts } from '@/features/pwa/pwa-prompts';
import { router } from '@/routes/router';

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider delayDuration={300}>
          <RouterProvider router={router} />
          <PwaPrompts />
          <Toaster position="top-right" richColors closeButton />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
