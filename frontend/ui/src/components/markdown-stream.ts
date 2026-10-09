/** Streaming snapshot for Markdown. Settled text is returned unchanged. */

export function prepareStreamMarkdown(text: string, streaming: boolean) {
  const normalized = text.replace(/^(#{1,6})\s*TL;DR\s*$/gim, "$1 摘要")
  if (!streaming) return normalized
  const fenced = closeFence(normalized)
  if (fenced !== normalized) return fenced
  return healTail(holdTableTail(normalized))
}

function closeFence(text: string) {
  const marker = openFence(text)
  if (!marker) return text
  const lines = text.split("\n")
  const last = lines[lines.length - 1] ?? ""
  if (/^(`{3,}|~{3,})/.test(last)) return text
  const gap = text.endsWith("\n") ? "" : "\n"
  return `${text}${gap}${marker}\n`
}

function openFence(text: string) {
  const open = text.split("\n").reduce<{ char: string; size: number } | undefined>((current, line) => {
    const found = line.trim().match(/^(```+|~~~+)/)
    if (!found) return current
    const token = found[1]
    if (!current) return { char: token[0], size: token.length }
    const closer = new RegExp(`^\\${current.char}{${current.size},}\\s*$`).test(line.trim())
    if (closer) return undefined
    return current
  }, undefined)
  if (!open) return
  return open.char.repeat(open.size)
}

function holdTableTail(text: string) {
  if (text.endsWith("\n")) return text
  const cut = text.lastIndexOf("\n")
  if (cut < 0) return text
  const tail = text.slice(cut + 1)
  if (!tail.includes("|")) return text
  const width = tableWidth(text.slice(0, cut).split("\n"))
  if (!width) return text
  if (cells(tail).length >= width) return text
  return text.slice(0, cut + 1)
}

function tableWidth(lines: string[]) {
  const found = lines.reduceRight<{ width: number } | undefined>((current, line, index) => {
    if (current) return current
    if (!line.trim()) return { width: 0 }
    if (!separator(line)) return current
    const header = lines[index - 1]
    if (!header?.includes("|")) return { width: 0 }
    return { width: cells(header).length }
  }, undefined)
  if (!found || found.width < 2) return 0
  return found.width
}

function separator(line: string) {
  return /^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line.trim())
}

function cells(line: string) {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "")
  return trimmed.split("|")
}

function healTail(text: string) {
  if (text.endsWith("\n")) return text
  const cut = text.lastIndexOf("\n")
  const head = cut < 0 ? "" : text.slice(0, cut + 1)
  const tail = cut < 0 ? text : text.slice(cut + 1)
  return head + healLine(tail)
}

function healLine(line: string) {
  const linked = line.replace(/\[([^\]\n]+)\]\([^)\n]*$/, "$1")
  const masked = linked.replace(/`[^`\n]*`/g, (span) => " ".repeat(span.length))
  const bold = masked.match(/\*\*/g)?.length ?? 0
  const withBold = bold % 2 === 1 ? `${linked}**` : linked
  const fence = /^(`{3,}|~{3,})/.test(withBold)
  const ticks = (withBold.match(/`/g) ?? []).length
  const withTicks = !fence && ticks % 2 === 1 ? `${withBold}\`` : withBold
  const dollars = withTicks.replace(/\$\$/g, "").match(/(?<!\\)\$/g)?.length ?? 0
  if (dollars % 2 === 1) return `${withTicks}$`
  return withTicks
}
