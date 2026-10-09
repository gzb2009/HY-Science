import { existsSync } from "fs"
import os from "os"
import path from "path"
import { Global } from "../global"
import { openUrl } from "./open-url"

const darwin = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
]

const linux = ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser", "microsoft-edge"]

function windowsChrome() {
  const root = process.env["PROGRAMFILES"] ?? "C:\\Program Files"
  const x86 = process.env["PROGRAMFILES(X86)"] ?? "C:\\Program Files (x86)"
  const local = process.env["LOCALAPPDATA"] ?? path.join(os.homedir(), "AppData", "Local")
  return [
    path.join(root, "Google", "Chrome", "Application", "chrome.exe"),
    path.join(x86, "Google", "Chrome", "Application", "chrome.exe"),
    path.join(local, "Google", "Chrome", "Application", "chrome.exe"),
    path.join(root, "Microsoft", "Edge", "Application", "msedge.exe"),
  ]
}

export function chromeAppBinary() {
  const list = process.platform === "darwin" ? darwin : process.platform === "win32" ? windowsChrome() : linux
  return list.find((bin) => existsSync(bin) || (process.platform === "linux" && which(bin)))
}

function which(bin: string) {
  const dirs = (process.env.PATH ?? "").split(path.delimiter)
  return dirs.some((dir) => existsSync(path.join(dir, bin)))
}

export async function openDesktopWindow(url: string) {
  const bin = chromeAppBinary()
  if (!bin) {
    openUrl(url)
    return false
  }
  const profile = path.join(Global.Path.data, "desktop-chrome")
  const child = Bun.spawn(
    [bin, `--app=${url}`, `--user-data-dir=${profile}`, "--no-first-run", "--disable-extensions"],
    {
      stdout: "ignore",
      stderr: "ignore",
      stdin: "ignore",
      detached: true,
    },
  )
  child.unref()
  return true
}
