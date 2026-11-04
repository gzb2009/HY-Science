import path from "path"
import fs from "fs/promises"
import { Instance } from "../project/instance"
import { seatMembers } from "@hysci/util/seat"

export namespace Sitting {
  function filepath(sessionID: string) {
    return path.join(Instance.directory, ".hyscience", "memory", `sitting-${sessionID}.json`)
  }

  async function climb(id: string, parent: (id: string) => Promise<string | undefined>, seen = 0): Promise<string> {
    if (seen > 6) return id
    const next = await parent(id)
    if (!next) return id
    return climb(next, parent, seen + 1)
  }

  export async function load(sessionID: string) {
    try {
      return seatMembers(JSON.parse(await fs.readFile(filepath(sessionID), "utf8")))
    } catch {
      return []
    }
  }

  export async function save(sessionID: string, members: readonly string[]) {
    const file = filepath(sessionID)
    await fs.mkdir(path.dirname(file), { recursive: true })
    await fs.writeFile(
      file,
      JSON.stringify({ version: 1, members: seatMembers(members), updatedAt: Date.now() }, null, 2),
    )
  }

  export async function membersFor(sessionID: string, parent: (id: string) => Promise<string | undefined>) {
    return load(await climb(sessionID, parent))
  }
}
