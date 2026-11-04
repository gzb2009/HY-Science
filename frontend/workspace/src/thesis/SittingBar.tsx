import { For } from "solid-js"
import { face, seatedCatalog } from "@hysci/util/seat"

export function SittingBar(props: {
  locale: string
  members: string[]
  mark: string
  hint: string
  onChange: (members: string[]) => void
}) {
  const hearth = () => face("research", props.locale)
  const on = (key: string) => props.members.includes(key)
  const toggle = (key: string) => {
    const next = on(key) ? props.members.filter((item) => item !== key) : [...props.members, key]
    props.onChange(next)
  }

  return (
    <div class="cs-sitting">
      <span class="cs-sitting-hearth" title={hearth().office}>
        {hearth().primary}
        <small>{hearth().secondary}</small>
      </span>
      <span class="cs-sitting-mark" title={props.hint}>
        {props.mark}
      </span>
      <For each={seatedCatalog()}>
        {(item) => {
          const named = () => face(item.key, props.locale)
          return (
            <button
              type="button"
              class="cs-sitting-seat"
              data-on={on(item.key) ? "true" : "false"}
              style={{ "--seat": item.color }}
              title={named().office}
              aria-pressed={on(item.key)}
              onClick={() => toggle(item.key)}
            >
              <span>{named().primary}</span>
              <small>{named().secondary}</small>
            </button>
          )
        }}
      </For>
    </div>
  )
}
