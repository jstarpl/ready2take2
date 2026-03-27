import { QueryClient } from "@tanstack/react-query";
import { createTRPCReact } from "@trpc/react-query";
import { createTRPCClient, createWSClient, httpBatchLink, splitLink, wsLink } from "@trpc/client";
import superjson from "superjson";
import type { AppRouter } from "@/server/api/root";

export const queryClient = new QueryClient();
export const trpc = createTRPCReact<AppRouter>();
export const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? (import.meta.env.DEV ? "http://localhost:3000" : window.location.origin);

const wsClient = createWSClient({
  url: `${SERVER_URL.replace(/^http\/\//, "ws")}/trpc`,
});

export const trpcClient = createTRPCClient<AppRouter>({
  links: [
    splitLink({
      condition: (operation) => operation.type === "subscription",
      true: wsLink({
        client: wsClient,
        transformer: superjson,
      }),
      false: httpBatchLink({
        url: `${SERVER_URL}/trpc`,
        transformer: superjson,
        fetch(url, options) {
          return fetch(url, {
            ...options,
            credentials: "include",
          });
        },
      }),
    }),
  ],
});
