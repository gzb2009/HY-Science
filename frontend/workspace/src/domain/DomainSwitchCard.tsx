import { useLanguage } from "@/context/language"
import { isDomainId, type DomainId } from "./registry"
import type { DomainSwitch } from "./switch"

export function DomainSwitchCard(props: { hit: DomainSwitch; onApply?: (id: DomainId) => void }) {
  const language = useLanguage()
  const suggest = () => (isDomainId(props.hit.suggest) ? props.hit.suggest : undefined)
  const copy =
    props.hit.kind === "execute"
      ? language.t("domain.drift.execute", {
          current: props.hit.currentTitle,
          suggest: props.hit.suggestTitle,
        })
      : language.t("domain.drift.ask", {
          current: props.hit.currentTitle,
          suggest: props.hit.suggestTitle,
        })
  return (
    <aside class="cs-domain-switch" data-kind={props.hit.kind}>
      <p>{copy}</p>
      <div class="cs-domain-switch-actions">
        <button
          type="button"
          class="cs-btn-primary"
          disabled={!suggest() || !props.onApply}
          onClick={() => {
            const id = suggest()
            if (id) props.onApply?.(id)
          }}
        >
          {language.t("protocol.apply", { name: props.hit.suggestTitle })}
        </button>
        <span class="cs-domain-switch-stay">{language.t("domain.drift.stay")}</span>
      </div>
    </aside>
  )
}
