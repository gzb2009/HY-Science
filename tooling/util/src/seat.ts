export type SeatKind = "hearth" | "seat" | "instrument" | "hand"

export type Seat = {
  key: string
  zh: string
  en: string
  officeZh: string
  officeEn: string
  kind: SeatKind
  color: string
}

export const SEATS: readonly Seat[] = [
  {
    key: "research",
    zh: "首席导研究员",
    en: "Chief Investigator",
    officeZh: "派任务、自己做、验收、安全检查、科学核查，并交付",
    officeEn: "Assigns work, does it when needed, checks safety and science, and delivers",
    kind: "hearth",
    color: "#06b6d4",
  },
  {
    key: "planner",
    zh: "任务规划研究员",
    en: "Planning Researcher",
    officeZh: "把任务写成步骤、验收标准和风险，不执行",
    officeEn: "Turns a task into steps, acceptance criteria, and risks, without executing it",
    kind: "instrument",
    color: "#3b6ea5",
  },
  {
    key: "biology",
    zh: "生物研究员",
    en: "Biology Researcher",
    officeZh: "做生物信息、数据库查询和从数据到结论的分析",
    officeEn: "Runs bioinformatics, database queries, and data-to-answer analysis",
    kind: "seat",
    color: "#10b981",
  },
  {
    key: "physics",
    zh: "物理研究员",
    en: "Physics Researcher",
    officeZh: "做模拟、方程和物理计算",
    officeEn: "Runs simulations, equations, and physical computation",
    kind: "seat",
    color: "#8b5cf6",
  },
  {
    key: "ml",
    zh: "机器学习研究员",
    en: "Machine Learning Researcher",
    officeZh: "训练、评估和分析模型",
    officeEn: "Trains, evaluates, and analyzes models",
    kind: "seat",
    color: "#6366f1",
  },
  {
    key: "literature-review",
    zh: "文献研究员",
    en: "Literature Researcher",
    officeZh: "检索、筛选并核对已发表文献",
    officeEn: "Searches, screens, and checks published literature",
    kind: "seat",
    color: "#818cf8",
  },
  {
    key: "write",
    zh: "撰稿研究员",
    en: "Writing Researcher",
    officeZh: "把已成立的工作写成论文、基金和综述",
    officeEn: "Writes papers, grants, and reviews from work that already holds",
    kind: "seat",
    color: "#a78bfa",
  },
  {
    key: "explore",
    zh: "代码研究员",
    en: "Code Researcher",
    officeZh: "在代码和项目里定位文件、接口和实现",
    officeEn: "Locates files, interfaces, and implementations in a codebase",
    kind: "seat",
    color: "#78716c",
  },
  {
    key: "critique",
    zh: "核查研究员",
    en: "Verification Researcher",
    officeZh: "查数据泄漏、统计错误和站不住的结论",
    officeEn: "Checks data leakage, statistical errors, and unsupported claims",
    kind: "instrument",
    color: "#ef4444",
  },
  {
    key: "reviewer",
    zh: "盲审研究员",
    en: "Blind Reviewer",
    officeZh: "不看作者推理，只把结论、数字和图表对回证据",
    officeEn: "Checks claims, numbers, and figures against evidence without the author's reasoning",
    kind: "instrument",
    color: "#f59e0b",
  },
  {
    key: "physics-critique",
    zh: "物理核查研究员",
    en: "Physics Verification Researcher",
    officeZh: "核对方程、模拟和拟合是否符合物理与数值标准",
    officeEn: "Checks equations, simulations, and fits against physical and numerical criteria",
    kind: "instrument",
    color: "#c084fc",
  },
  {
    key: "task",
    zh: "助理研究员",
    en: "Research Assistant",
    officeZh: "接一件具体任务，做完交回",
    officeEn: "Takes one assigned task and returns the result",
    kind: "hand",
    color: "#57534e",
  },
]

const byKey = new Map(SEATS.map((item) => [item.key, item]))

export function seat(key: string) {
  return byKey.get(key)
}

export function seatedCatalog() {
  return SEATS.filter((item) => item.kind === "seat")
}

export function face(key: string, locale: string) {
  const item = seat(key)
  if (!item) return { primary: key, secondary: "", office: "" }
  const zh = locale === "zh" || locale === "zht"
  return {
    primary: zh ? item.zh : item.en,
    secondary: zh ? item.en : item.zh,
    office: zh ? item.officeZh : item.officeEn,
  }
}

function memberList(value: unknown): unknown[] {
  if (Array.isArray(value)) return value
  if (!value || typeof value !== "object" || !("members" in value)) return []
  return Array.isArray(value.members) ? value.members : []
}

export function seatMembers(value: unknown) {
  const allow = new Set(seatedCatalog().map((item) => item.key))
  return [
    ...new Set(memberList(value).filter((item): item is string => typeof item === "string" && allow.has(item))),
  ]
}

export function allowed(caller: string, target: string, members: readonly string[]) {
  const from = seat(caller)
  const to = seat(target)
  if (!to) return true
  if (!from) return false
  if (to.kind === "instrument" || to.kind === "hand") return from.kind === "hearth"
  if (to.kind !== "seat") return false
  if (!members.includes(to.key)) return false
  if (from.kind === "hearth") return true
  if (from.kind !== "seat" || !members.includes(from.key)) return false
  return from.key !== to.key
}

function named(item: Seat) {
  return `${item.zh} ${item.en}（${item.key}）`
}

function title(key: string) {
  return seat(key)?.zh ?? key
}

export function brief(agentKey: string, members: readonly string[]) {
  const self = seat(agentKey)
  if (!self) return ""
  const seated = seatMembers(members)
    .map((key) => seat(key))
    .filter((item): item is Seat => !!item)
  if (self.kind === "hearth") {
    const room = seated.length ? `进组：${seated.map(named).join("、")}。` : "组里没有其他研究员。这件事你自己做完。"
    return [
      "<sitting>",
      `你是${self.zh} ${self.en}。组里只有你对客户交付。对客户只用职称。`,
      room,
      `客户任务先评估。直答直接回答。深挖按层派一位研究员。铺开才并行文献、计算、代码和一位领域研究员。待确认时只把规划交给用户。确认完成由核查和盲审并行审核，物理任务再加物理核查。通过后由撰稿研究员写方法学，并交付最终版本。`,
      `派工用 task。subagent_type 只能填进组者括号里的 key，或${title("critique")} critique、${title("reviewer")} reviewer、${title("physics-critique")} physics-critique、${title("task")} task。`,
      "研究提示里点名的专业席位，客户没拉进组就不要自行调用。已确认规划里的文献检索、计算分析和领域分析由系统并行启动。",
      "派工单只写目标、约束、验收标准。做法、工具和步骤由接到的人自己定。",
      "进组的研究员可以就同一件事再叫另一位进组的研究员，只一层。方法上的往来不拦。越出目标，或删除、外传、越权目录，你否决。",
      `收回的工作包先看安全，再让${title("critique")}或${title("reviewer")}核查。核查不看执行人的推理。不过就退回原执行人。通过后只有你写给客户。`,
      "</sitting>",
    ].join("\n")
  }
  if (self.kind === "seat") {
    const peers = seated.filter((item) => item.key !== self.key)
    const room = peers.length
      ? `同一件事上可以再叫组里的人：${peers.map(named).join("、")}。只叫一层。`
      : "这次没有其他组员可以叫。"
    return [
      "<sitting>",
      `你是${self.zh} ${self.en}。客户不直接看你的话，你把工作包交回${title("research")}。`,
      "目标、约束、验收标准不能改。做法、工具、步骤你自己定。",
      room,
      "</sitting>",
    ].join("\n")
  }
  if (self.key === "planner") {
    return [
      "<sitting>",
      `你是${self.zh} ${self.en}。只写规划，不执行，不对客户交付。`,
      `规划交给${title("research")}。`,
      "</sitting>",
    ].join("\n")
  }
  if (self.kind === "instrument") {
    return [
      "<sitting>",
      `你是${self.zh} ${self.en}。只核查，不重做，不对客户交付。`,
      "只看结论、引用、数字、文件和安全边界。不沿用执行人的推理。",
      "</sitting>",
    ].join("\n")
  }
  return [
    "<sitting>",
    `你是${self.zh} ${self.en}。只完成${title("research")}交来的这一件，不对客户交付，不另请人。`,
    "</sitting>",
  ].join("\n")
}
