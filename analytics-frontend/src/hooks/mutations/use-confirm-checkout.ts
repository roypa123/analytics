import { useMutation, useQueryClient } from "@tanstack/react-query"

import { queryKeys } from "@/api/query-keys"
import { confirmCheckout } from "@/endpoints/billing"
import type { ConfirmCheckoutRequest } from "@/types/api/billing"

export function useConfirmCheckout() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (body: ConfirmCheckoutRequest) => confirmCheckout(body),
    onSuccess: (status) => {
      queryClient.setQueryData(queryKeys.billing.status(), status)
    },
  })
}
