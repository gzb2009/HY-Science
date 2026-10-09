import { cmd } from "./cmd"
import { withNetworkOptions } from "../network"
import { WebCommand } from "./web"

export const DesktopCommand = cmd({
  command: "desktop [project]",
  builder: (yargs) =>
    withNetworkOptions(yargs)
      .positional("project", {
        type: "string",
        describe: "directory to open the workspace in",
      })
      .option("safe", {
        type: "boolean",
        default: false,
        describe: "skip third-party plugins (safe start)",
      }),
  describe: "open HYscience in a native window on loopback",
  handler: async (args) => {
    const run = WebCommand.handler
    if (!run) return
    await run({ ...args, desktop: true, noOpen: true, "no-open": true })
  },
})
