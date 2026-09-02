import { useMutation, useQueryClient } from "@tanstack/react-query"

import { queryKeys } from "@/api/query-keys"
import { createProperty } from "@/endpoints/properties"
import type { CreatePropertyRequest } from "@/types/api/property"

export function useCreateProperty() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (body: CreatePropertyRequest) => createProperty(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.properties.all() })
    },
  })
}
