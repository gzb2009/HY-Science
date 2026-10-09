import { test, expect } from "./fixtures"
import { serverName } from "./utils"

test("home renders and shows core entrypoints", async ({ page }) => {
  await page.goto("/")

  await expect(page.getByTestId("home-dock")).toBeVisible()
  await expect(page.getByRole("heading", { name: "HYscience" })).toBeVisible()
})

test("server picker dialog opens from home", async ({ page }) => {
  await page.goto("/")

  const trigger = page.getByRole("button", { name: serverName })
  if ((await trigger.count()) === 0) {
    test.skip(true, "server picker is not on the domain guide")
    return
  }
  await expect(trigger).toBeVisible()
  await trigger.click()

  const dialog = page.getByRole("dialog")
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole("textbox").first()).toBeVisible()
})
