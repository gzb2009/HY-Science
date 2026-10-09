import { describe, expect, test } from "bun:test"
import { chooseDoc, floatActions, floatDocs, floatShare } from "./float-doc"

describe("floatActions", () => {
  test("hides both when there is nothing to open", () => {
    expect(floatActions({ statuses: [], codePaths: [] })).toEqual({ plan: undefined, notebook: undefined })
  })

  test("shows plan when a task plan exists", () => {
    expect(floatActions({ statuses: ["pending", "pending"], codePaths: ["notes.md"] }).plan).toBe("pending")
    expect(floatActions({ statuses: ["completed", "completed"], codePaths: ["notes.md"] }).plan).toBe("complete")
    expect(floatActions({ statuses: ["in_progress"], codePaths: ["notes.md"] }).plan).toBe("in progress")
    expect(floatActions({ statuses: ["pending"], codePaths: ["notes.md"] }).notebook).toBeUndefined()
  })

  test("shows plan and notebook together", () => {
    const actions = floatActions({
      statuses: ["completed", "completed"],
      codePaths: ["fig.pdf", "scripts/02_annotate.py"],
    })
    expect(actions.plan).toBe("complete")
    expect(actions.notebook).toBe("scripts/02_annotate.py")
  })

  test("shows notebook as the first code file", () => {
    expect(floatActions({ statuses: [], codePaths: ["fig.png", "scripts/02_annotate.py", "b.r"] }).notebook).toBe(
      "scripts/02_annotate.py",
    )
  })
})

describe("floatShare", () => {
  test("defaults near half and clamps between a quarter and three quarters", () => {
    expect(floatShare(640, 1280)).toBe(0.5)
    expect(floatShare(0, 1280)).toBe(0.75)
    expect(floatShare(1280, 1280)).toBe(0.25)
  })
})

describe("floatDocs", () => {
  const files = [
    { kind: "pdf", path: "fig2.pdf", name: "fig2.pdf" },
    { kind: "png", path: "plot.png", name: "plot.png" },
    { kind: "code", path: "scripts/02_annotate.py", name: "02_annotate.py" },
    { kind: "other", path: "notes.ipynb", name: "notes.ipynb" },
  ]

  test("keeps only the notebook, drops files and images", () => {
    expect(floatDocs(files, 0).map((doc) => doc.id)).toEqual(["scripts/02_annotate.py", "notes.ipynb"])
  })

  test("notebook tab selects the code file instead of the first pdf", () => {
    const docs = floatDocs(files, 0)
    expect(chooseDoc(docs, "scripts/02_annotate.py")?.id).toBe("scripts/02_annotate.py")
    expect(chooseDoc(docs, "notes.ipynb")?.kind).toBe("code")
  })

  test("prepends the plan when a task plan exists", () => {
    expect(floatDocs(files, 2)[0]).toEqual({ id: "plan", kind: "plan" })
    expect(chooseDoc(floatDocs(files, 2), "plan")?.kind).toBe("plan")
  })
})
