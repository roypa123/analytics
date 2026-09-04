import { useMutation } from "@tanstack/react-query"

import { startCheckout } from "@/endpoints/billing"

export function useStartCheckout() {
  return useMutation({
    mutationFn: startCheckout,
  })
}
