"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useMemo } from "react";
import { ErrorBoundary } from "@/components/ui/error-boundary";
import { ToastProvider } from "@/components/ui/toast";
import { SessionProvider, useSession } from "@/lib/session";

export function Providers({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <ErrorBoundary><SessionProvider><SessionQueries>{children}</SessionQueries></SessionProvider></ErrorBoundary>;
}

function SessionQueries({ children }: Readonly<{ children: React.ReactNode }>) {
  const { session } = useSession();
  const actorId = session?.user.id;
  const queryClient = useMemo(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            meta: { actorId },
            refetchInterval: 60_000,
            retry: 2,
            staleTime: 30_000,
          },
          mutations: { retry: false },
        },
      }), [actorId],
  );

  return (
        <QueryClientProvider client={queryClient}>
          <ToastProvider>{children}</ToastProvider>
        </QueryClientProvider>
  );
}
