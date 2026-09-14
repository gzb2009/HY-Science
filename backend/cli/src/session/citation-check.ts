import { Log } from "../util/log"
import { getJSON, HttpStatusError } from "../science/connectors/http"
import type { ReviewRecord } from "./review-record"

/**
 * Citation check — resolves every DOI / PMID in a delivered answer against
 * CrossRef and PubMed. A citation that does not resolve is the single most
 * damaging kind of hallucination for a research assistant, so this runs
 * deterministically before the LLM reviewer and its result is folded into the
 * ReviewRecord shown in the Evidence pane.
 */
export namespace CitationCheck {
  const log = Log.create({ service: "citation-check" })

  const DOI = /\b10\.\d{4,9}\/[^\s"'<>()\[\]{}，。；、]+/g
  const PMID = /\bPMID\s*[:：]?\s*(\d{6,9})\b/gi
  const TRAIL = /[.,;:!?]+$/
  const MAX = 40
  const TIMEOUT = 8_000

  export type Status = "verified" | "missing" | "error"
  export type Item = { kind: "doi" | "pmid"; id: string; status: Status; title?: string; year?: number }
  export type Result = { items: Item[]; verified: number; missing: number; errors: number }

  export function extract(text: string) {
    const dois = new Set<string>()
    for (const match of text.matchAll(DOI)) dois.add(match[0].replace(TRAIL, "").toLowerCase())
    const pmids = new Set<string>()
    for (const match of text.matchAll(PMID)) pmids.add(match[1])
    return { dois: [...dois].slice(0, MAX), pmids: [...pmids].slice(0, MAX) }
  }

  type Work = { message?: { title?: string[]; issued?: { "date-parts"?: number[][] } } }
  type Summary = { result?: Record<string, { title?: string; pubdate?: string; error?: string }> }

  async function doi(id: string, signal?: AbortSignal): Promise<Item> {
    const url = `https://api.crossref.org/works/${encodeURIComponent(id)}?mailto=support@hyscience.ai`
    return getJSON<Work>(url, { signal, timeout: TIMEOUT, retries: 1 })
      .then((data) => ({
        kind: "doi" as const,
        id,
        status: data.message?.title?.length ? ("verified" as const) : ("missing" as const),
        title: data.message?.title?.[0],
        year: data.message?.issued?.["date-parts"]?.[0]?.[0],
      }))
      .catch((error) => ({
        kind: "doi" as const,
        id,
        status: error instanceof HttpStatusError && error.status === 404 ? ("missing" as const) : ("error" as const),
      }))
  }

  async function pmids(ids: string[], signal?: AbortSignal): Promise<Item[]> {
    if (ids.length === 0) return []
    const url = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&retmode=json&id=${ids.join(",")}`
    return getJSON<Summary>(url, { signal, timeout: TIMEOUT, retries: 1 })
      .then((data) =>
        ids.map((id) => {
          const row = data.result?.[id]
          if (!row || row.error) return { kind: "pmid" as const, id, status: "missing" as const }
          return {
            kind: "pmid" as const,
            id,
            status: "verified" as const,
            title: row.title,
            year: Number(row.pubdate?.slice(0, 4)) || undefined,
          }
        }),
      )
      .catch(() => ids.map((id) => ({ kind: "pmid" as const, id, status: "error" as const })))
  }

  export async function verify(text: string, signal?: AbortSignal): Promise<Result> {
    const found = extract(text)
    const items = [
      ...(await Promise.all(found.dois.map((id) => doi(id, signal)))),
      ...(await pmids(found.pmids, signal)),
    ]
    const result = {
      items,
      verified: items.filter((item) => item.status === "verified").length,
      missing: items.filter((item) => item.status === "missing").length,
      errors: items.filter((item) => item.status === "error").length,
    }
    if (items.length) log.info("citation check", { total: items.length, ...result, items: undefined })
    return result
  }

  /** Unresolvable citations become blocking findings; network errors become warnings. */
  export function findings(result: Result): ReviewRecord.Finding[] {
    const out: ReviewRecord.Finding[] = []
    for (const item of result.items) {
      if (item.status === "missing") {
        out.push({
          severity: "blocking",
          message: `${item.kind.toUpperCase()} ${item.id} does not resolve in ${item.kind === "doi" ? "CrossRef" : "PubMed"}; treat as unverified or remove it.`,
          evidence: [
            item.kind === "doi" ? `https://doi.org/${item.id}` : `https://pubmed.ncbi.nlm.nih.gov/${item.id}/`,
          ],
        })
      }
      if (item.status === "error") {
        out.push({
          severity: "warning",
          message: `${item.kind.toUpperCase()} ${item.id} could not be checked (network error).`,
          evidence: [],
        })
      }
    }
    return out
  }

  /** One line the reviewer prompt can use so it does not re-verify resolved IDs. */
  export function note(result: Result) {
    if (result.items.length === 0) return ""
    const ok = result.items.filter((item) => item.status === "verified").map((item) => `${item.kind}:${item.id}`)
    const bad = result.items.filter((item) => item.status === "missing").map((item) => `${item.kind}:${item.id}`)
    return [
      "<citation_check>",
      ok.length ? `Resolved: ${ok.join(", ")}` : "",
      bad.length ? `Unresolvable (already flagged): ${bad.join(", ")}` : "",
      "Check that each resolved citation's title/year actually supports the claim it is attached to.",
      "</citation_check>",
    ]
      .filter(Boolean)
      .join("\n")
  }
}
