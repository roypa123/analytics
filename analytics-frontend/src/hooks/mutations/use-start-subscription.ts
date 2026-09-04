import { useMutation } from "@tanstack/react-query"

import { startSubscription } from "@/endpoints/billing"

export function useStartSubscription() {
  return useMutation({
    mutationFn: startSubscription,
  })
}
