const CODE = /\.(py|ipynb|r|sh)$/i

export function isNotebookPath(path: string) {
  return CODE.test(path)
}

export function planMark(statuses: string[]) {
  if (!statuses.length) return
  const done = (status: string) => status === "completed" || status === "cancelled"
  if (statuses.every(done)) return "complete"
  if (statuses.some((status) => status === "in_progress")) return "in progress"
  return "pending"
}

export function floatActions(input: { statuses: string[]; codePaths: string[] }) {
  return {
    plan: planMark(input.statuses),
    notebook: input.codePaths.find(isNotebookPath),
  }
}

export function floatDocs<T extends { kind: string; path: string; name: string }>(files: T[], todos: number) {
  const docs = files
    .filter((file) => file.kind === "code" || isNotebookPath(file.path))
    .map((file) => ({
      id: file.path,
      kind: "code" as const,
      path: file.path,
      name: file.name,
    }))
  if (todos > 0) return [{ id: "plan", kind: "plan" as const }, ...docs]
  return docs
}

export function floatShare(pointer: number, width: number) {
  if (width <= 0) return 0.5
  return Math.min(0.75, Math.max(0.25, (width - pointer) / width))
}

export function chooseDoc<T extends { id: string; kind: string; path?: string }>(list: T[], tab: string) {
  return (
    list.find((doc) => doc.id === tab) ??
    list.find((doc) => doc.kind !== "plan" && !!doc.path && (tab.endsWith(doc.path) || doc.path.endsWith(tab))) ??
    list[0]
  )
}
