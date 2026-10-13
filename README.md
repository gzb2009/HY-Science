<div align="center">

<img src="assets/wordmark.svg" alt="HYscience" width="420">

科研工作台里的研究智能体。给它一个目标，它会读文献、写并运行代码、核对结果，再把能打开的文件交回来。

<br/>

[![CI](https://github.com/gzb2009/HY-Science/actions/workflows/ci.yml/badge.svg)](https://github.com/gzb2009/HY-Science/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/%40hysci%2Fhyscience?label=%40hysci%2Fhyscience&color=1c1917)](https://www.npmjs.com/package/@hysci/hyscience)
[![license](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)

[安装](#安装) · [一次研究会怎么走](#一次研究会怎么走) · [智能体](#智能体) · [工作区](#工作区)

</div>

---

HYscience（命令 `hyscience`，npm 包 `@hysci/hyscience`）是跑在本机的研究智能体。浏览器里是工作区，本机进程负责会话、工具和模型请求。模型不绑死一家：用自己的 API key，请求直接发到对应服务。配置在 `~/.config/hyscience/hyscience.json`，旧目录 `~/.synsc` 会自动迁过来。

默认面对用户的是 `research`。它按研究流程工作，而不是把每一句都当成立刻开跑。

## 一次研究会怎么走

1. **先分清是计划还是执行。** 用户只要计划、先不执行时，智能体直接写计划。没定下来的物种、组织、目标写成假设和分支，不用问卷把计划拦住。只有一个事实不定就写不出计划时，才问那一个。
2. **真正要设计或分析时才问。** 会改变结果的空槽（比如 panel 试剂、分析对象）收成一次提问，然后停下来等回答。后面的问题不会被提前填掉。
3. **「由智能体决定」和「跳过」只作用于当前这一问。** 决定或跳过之后，下一问仍留给用户。
4. **协议跟项目走，而且是可选项。** 不锁定时不限定流程。要跑专项分析，再换成对应协议：空间蛋白成像、单细胞分析、空间转录组或基因组分析。换协议只改当前项目。文献、方法对比和方案设计不需要先换协议；真正开跑另一条分析时，先换成那条协议。
5. **做完把文件交出来。** 结论在前，依据和不确定性跟着写。生成的表、图、代码、文档进「交付产物」，点开就能看。

思考区默认收起，展开前先给出两三处关键节点（因此、假设、结论这一类），全文仍在展开里。

## 智能体

| 名称                                         | 角色                                                                                                |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `research`                                   | 默认主智能体。文献、数据分析、计算和综合，最多约 50 步。                                            |
| `biology`                                    | 计算生物学。生物信息流程和生物数据库查询。                                                          |
| `physics`                                    | 计算物理。模拟、PDE、动力系统和科学计算。                                                           |
| `ml`                                         | 机器学习。训练、评估、分析，覆盖深度学习、大模型和经典方法。                                        |
| `plan`                                       | 只读计划模式，不能改文件。                                                                          |
| `literature-review`                          | 系统文献综述：检索、筛选、综合、核对。                                                              |
| `write`                                      | 论文、基金、综述一类写作，引用和图表要能对上。                                                      |
| `critique` / `physics-critique` / `reviewer` | 只读审查。找数据泄漏、统计和论断问题，物理结果另有一套数值核对；reviewer 把论断、数字和图追回证据。 |
| `explore` / `task`                           | 查代码库，或把多段工作拆开并行。                                                                    |

`biology`、`physics`、`ml` 是内置专长，由研究流程调用，不作为另一套产品入口。`compaction` 和 `title` 只做会话压缩和标题，不出现在选择里。

自定义智能体写在 `hyscience.json` 的 `agent` 里。

## 协议

协议写在项目上，新建项目时可选，之后也能改。它决定专项分析走哪条流程，也决定技能和澄清问题怎么收窄。默认是「不锁定」。

- **不锁定**：项目不归进某个流程。文献、设计和跨方向问题都可以做。要跑专项分析时再换协议。
- **空间蛋白成像**：IMC / CODEX / MIBI 的细胞分割与表型、邻域与空间互作、区域组成比较。
- **单细胞分析**：质控、归一化、聚类、Marker 注释与差异基因、批次整合。
- **空间转录组**：Visium / Stereo-seq 等平台的空间邻域、配体受体，以及与单细胞数据整合。
- **基因组分析**：比对与变异、基因注释与富集、表达定量。

当前项目是一条专项协议时，另一条分析不能在这里直接执行。方法和文献仍可以讨论；要跑分析，先把协议换成对应的那条。

## 工作区

浏览器工作区里，一次会话分成这几块：

- **对话。** 助手正文用衬线，界面和用户气泡用无衬线。字体大小只在当前这次查看里调，不写进配置。
- **交付产物。** 每个文件是一张毛玻璃卡片：中间是文件名（不含扩展名），角上是 MD、PY、CSV、PDF 这类类型。标题带数量。文件找不到时直接写明。
- **交付文件。** 中间栏右侧这个按钮打开文件面板，再点一次关掉，回到对话。
- **文件查看。** CSV / TSV 按表格打开：表头固定、行号、数字右对齐、过宽时横向滚动，状态栏写行数和列数。代码按带行号的源码打开，也能切回原文。Markdown 先渲染，Excel 单元格不把一格拆成好几行。
- **权限。** 默认不是完全放行。破坏性操作、MCP、项目外目录会先问。这是提醒，不是沙箱。

## 技能与数据库

仓库 `backend/cli/skills` 里附带约 300 个技能，覆盖训练与评估、生信流程、化学信息、论文和 LaTeX、作图。智能体按当前协议和任务加载，不是每次把目录整份塞进提示词。

科学数据库走统一查询工具，例如 UniProt、arXiv。可用库以工具返回的列表为准。

## 安装

需要本机可以跑 Node 工具链。全局安装后打开工作区：

```bash
npm install -g @hysci/hyscience
hyscience
```

也可以不安装，直接：

```bash
npx hysci
```

指定项目目录：

```bash
hyscience ~/code/my-project
```

第一次启动会问模型从哪里来。密钥留在本机。也可以在终端执行 `hyscience keys add`，或在工作区的凭证面板里填。桌面窗口用 `hyscience desktop`。

各平台二进制在 [GitHub Releases](https://github.com/gzb2009/HY-Science/releases)。版本记录见 [CHANGELOG.md](CHANGELOG.md)。

## 配置与仓库

全局配置是 `~/.config/hyscience/hyscience.json`。项目级用仓库根目录的 `hyscience.json` 或 `.hyscience/`。自定义智能体、命令、插件和主题从这里加载。

| 路径                 | 内容                                   |
| -------------------- | -------------------------------------- |
| `backend/cli`        | 命令行、本地服务、模型接入、会话、技能 |
| `frontend/workspace` | 浏览器工作区                           |
| `frontend/ui`        | 对话、交付卡片等共用界面               |
| `frontend/docs`      | 文档与会话分享页                       |
| `tooling/sdk/js`     | TypeScript SDK                         |
| `tooling/plugin`     | 插件运行时                             |

## 开发

需要 [Bun](https://bun.sh) 1.3 或更新。

```bash
bun install
bun dev
bun run typecheck
bun run --cwd backend/cli test
```

`bun dev` 用源码起工作区。架构说明见 [ARCHITECTURE.md](ARCHITECTURE.md)，贡献方式见 [CONTRIBUTING.md](CONTRIBUTING.md)，代码风格见 [AGENTS.md](AGENTS.md)。

## 安全

智能体没有沙箱。权限系统让你看见它要做什么，不能代替隔离。需要隔离时放进容器或虚拟机。服务商密钥会从子进程环境和输出里滤掉。漏洞报告见 [SECURITY.md](SECURITY.md)。

## 许可

Apache License 2.0。见 [LICENSE](LICENSE) 和 [NOTICE](NOTICE)。
