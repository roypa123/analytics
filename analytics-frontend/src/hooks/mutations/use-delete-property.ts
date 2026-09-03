import { useMutation, useQueryClient } from "@tanstack/react-query"

import { queryKeys } from "@/api/query-keys"
import { deleteProperty } from "@/endpoints/properties"

export function useDeleteProperty() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (propertyId: number) => deleteProperty(propertyId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.properties.all() })
    },
  })
}
