import { QueryClient } from "@tanstack/react-query"

import { isApiError } from "@/api/errors"
import { STALE_TIME } from "@/config/query-config"

// Part 7 §7.5 — defaults tuned for analytics specifically: data is not
// live, so refetch-on-focus would make numbers flicker mid-analysis, and
// retrying a 4xx (bad request, forbidden) is pointless.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: STALE_TIME.liveRange,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        if (isApiError(error) && error.status !== null && error.status < 500) {
          return false
        }
        return failureCount < 1
      },
    },
  },
})
