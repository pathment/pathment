'use client';

import { useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider, QueryCache, MutationCache } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { toast } from 'sonner';
import { extractApiErrorMessage } from '@/lib/utils/api-error';

function makeQueryClient(): QueryClient {
  return new QueryClient({
    // Global error handling, so individual hooks don't each reimplement toasting.
    // Queries: only toast when cached data is already on screen and a background
    // refetch failed (otherwise silent) — first-load errors are owned by the page's
    // inline error state / ErrorBoundary (see throwOnError below), so no double report.
    queryCache: new QueryCache({
      onError: (error, query) => {
        if (query.state.data !== undefined) toast.error(extractApiErrorMessage(error));
      },
    }),
    // Mutations rarely have an inline error region, so always toast.
    mutationCache: new MutationCache({
      onError: (error) => toast.error(extractApiErrorMessage(error)),
    }),
    defaultOptions: {
      queries: {
        // Data is considered fresh for 2 min — no refetch on remount within this window.
        staleTime: 2 * 60 * 1000,
        // Keep unused/inactive cache entries for 5 min before garbage collection.
        gcTime: 5 * 60 * 1000,
        retry: 1,
        // Bubble fresh-data errors to an error boundary; when cached data is still
        // available, keep showing it and rely on the toast above instead.
        throwOnError: (_error, query) => typeof query.state.data === 'undefined',
      },
    },
  });
}

interface QueryProviderProps {
  children: ReactNode;
}

export function QueryProvider({ children }: QueryProviderProps) {
  // useState ensures a single QueryClient instance survives re-renders on the
  // client, while each SSR pass gets its own (no cross-request cache sharing).
  const [queryClient] = useState(makeQueryClient);

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      {process.env.NODE_ENV === 'development' && <ReactQueryDevtools initialIsOpen={false} />}
    </QueryClientProvider>
  );
}
