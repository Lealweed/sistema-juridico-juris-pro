import { clsx, type ClassValue } from "clsx"
import { extendTailwindMerge, validators } from "tailwind-merge"

const merge = extendTailwindMerge({
  extend: { classGroups: {
    "space-y": [{ "legacy-space-y": [validators.isNumber] }],
    "space-x": [{ "legacy-space-x": [validators.isNumber] }],
  } },
})

export function cn(...inputs: ClassValue[]) {
  return merge(clsx(inputs))
}
