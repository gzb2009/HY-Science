import type { Component, JSX } from "solid-js"
import { splitProps } from "solid-js"
import type { IconName } from "./provider-icons/types"

export type ProviderIconProps = JSX.SVGElementTags["svg"] & {
  id: IconName
}

/** Every model source uses the HY mark. The id stays for callers; it is not a vendor glyph. */
export const ProviderIcon: Component<ProviderIconProps> = (props) => {
  const [local, rest] = splitProps(props, ["id", "class", "classList", "width", "height"])
  const size = () => {
    const raw = local.width ?? local.height ?? 16
    const n = typeof raw === "number" ? raw : Number(raw)
    return Number.isFinite(n) && n > 0 ? n : 16
  }
  return (
    <svg
      data-component="provider-icon"
      data-provider={local.id}
      width={size()}
      height={size()}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      {...rest}
      classList={{
        ...(local.classList ?? {}),
        [local.class ?? ""]: !!local.class,
      }}
    >
      <rect width="24" height="24" rx="5" fill="#f2f2f0" />
      <circle cx="12" cy="12" r="10" fill="#f2f2f0" stroke="#171717" stroke-width="0.8" />
      <path d="M12 2A10 10 0 0 0 12 22C15 22 15 18.6 12 17C10 16.1 10 7.9 12 7C15 5.4 15 2 12 2Z" fill="#171717" />
      <circle cx="12" cy="12" r="7" fill="#f2f2f0" stroke="#171717" stroke-width="0.8" />
      <path
        d="m10 9-3.2 3 3.2 3M14 9l3.2 3-3.2 3M13.1 8.2l-2.2 7.6"
        stroke="#171717"
        stroke-width="1.8"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  )
}
