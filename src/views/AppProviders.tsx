"use client";

import { useState, type ReactElement, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

interface AppProvidersProps {
  readonly children: ReactNode;
}

function buildQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Reads may retry (idempotent); writes never do — a blind retry after
        // a silent failure could double-book (TRD §6.5).
        retry: 2,
        refetchOnWindowFocus: true,
      },
      mutations: { retry: false },
    },
  });
}

export function AppProviders({ children }: AppProvidersProps): ReactElement {
  const [queryClient] = useState(buildQueryClient);
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
