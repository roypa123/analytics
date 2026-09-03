import { Eye, EyeOff } from "lucide-react"
import { useState } from "react"

import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group"

// Shared by login/register (Part 8 §8.4, §8.8) — a plain `<Input type="password">`
// with a trailing reveal toggle built from `ui/input-group` (Rule C-01: no
// hand-edited `ui/` primitive for this, compose the existing ones instead).
// Props pass straight through to `InputGroupInput`, same as every other
// `<Input {...register(...)} />` call in these forms — react-hook-form's
// `ref`/`onChange`/`onBlur` need no special handling here.
export function PasswordInput(props: React.ComponentProps<typeof InputGroupInput>) {
  const [visible, setVisible] = useState(false)

  return (
    <InputGroup>
      <InputGroupInput type={visible ? "text" : "password"} {...props} />
      <InputGroupAddon align="inline-end">
        <InputGroupButton
          type="button"
          size="icon-xs"
          aria-label={visible ? "Hide password" : "Show password"}
          // Not part of the form's tab order — the field itself already is.
          tabIndex={-1}
          onClick={() => setVisible((value) => !value)}
        >
          {visible ? <EyeOff /> : <Eye />}
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  )
}
