import { useMutation } from "@tanstack/react-query"

import { changePassword } from "@/endpoints/auth"
import type { ChangePasswordRequest } from "@/types/api/auth"

// No cache invalidation needed — a password change doesn't alter any
// queried data, just the credential used to obtain new sessions. The
// backend also revokes every other refresh-token session (Part 8 §8.4);
// this tab's access token keeps working until its own short TTL expires.
export function useChangePassword() {
  return useMutation({
    mutationFn: (body: ChangePasswordRequest) => changePassword(body),
  })
}
