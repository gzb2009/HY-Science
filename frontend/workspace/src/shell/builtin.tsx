import { For, Show, createMemo, type JSX } from "solid-js"
import { Dynamic } from "solid-js/web"
import { ArtifactLightbox } from "@/thesis/ArtifactLightbox"
import { uiStore } from "@/thesis/store/ui"
import { IconBookOpen, IconGitBranch, IconTerminal } from "@/thesis/shared/Icon"
import { NowTab } from "@/thesis/RightPane/NowTab"
import { EvidenceTab } from "@/thesis/RightPane/EvidenceTab"
import { RunTab } from "@/thesis/RightPane/RunTab"
import { AgentsTab } from "@/thesis/RightPane/AgentsTab"
import { FilesCenter } from "./files-center"
import { ImcDock } from "./imc-dock"
import { registerSlot, slotEntries, type SlotName, type SlotProps } from "./slots"

function LightboxSlot(): JSX.Element {
  return (
    <Show when={uiStore.imagePreview()}>
      {(artifact) => <ArtifactLightbox artifact={artifact()} onClose={() => uiStore.setImagePreview(undefined)} />}
    </Show>
  )
}

registerSlot({ id: "message.lightbox", slot: "message", order: 0, component: LightboxSlot })
registerSlot({ id: "center.files", slot: "center", order: 0, component: FilesCenter })
registerSlot({
  id: "now",
  slot: "inspector",
  order: 0,
  labelKey: "rightpane.tab.now",
  icon: (props) => <IconBookOpen size={props.size ?? 13} strokeWidth={props.strokeWidth ?? 1.6} />,
  component: NowTab,
})
registerSlot({
  id: "evidence",
  slot: "inspector",
  order: 1,
  labelKey: "rightpane.tab.evidence",
  icon: (props) => <IconBookOpen size={props.size ?? 13} strokeWidth={props.strokeWidth ?? 1.6} />,
  component: (props) => <EvidenceTab sessionID={props.sessionID} />,
})
registerSlot({
  id: "run",
  slot: "inspector",
  order: 2,
  labelKey: "rightpane.tab.run",
  icon: (props) => <IconTerminal size={props.size ?? 13} strokeWidth={props.strokeWidth ?? 1.6} />,
  component: RunTab,
})
registerSlot({
  id: "agents",
  slot: "inspector",
  order: 3,
  gated: true,
  labelKey: "rightpane.tab.agents",
  icon: (props) => <IconGitBranch size={props.size ?? 13} strokeWidth={props.strokeWidth ?? 1.6} />,
  component: AgentsTab,
})
registerSlot({ id: "composer.imc", slot: "composer.extra", order: 0, component: ImcDock })

export function SlotViews(props: { slot: SlotName } & SlotProps): JSX.Element {
  const list = createMemo(() => slotEntries(props.slot))
  return <For each={list()}>{(entry) => <Dynamic component={entry.component} {...props} />}</For>
}
