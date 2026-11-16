import { expect, test } from "@playwright/test";
import path from "node:path";

const SAMPLE = path.join(__dirname, "fixtures", "sample.pdf");

test("upload, comment, persist, export", async ({ page }) => {
  await page.goto("/");
  await page.locator('input[type="file"]').setInputFiles(SAMPLE);
  await page.getByRole("link", { name: "sample.pdf" }).click();

  const span = page.locator('[data-page="1"] .react-pdf__Page__textContent span').first();
  await expect(span).toBeVisible();
  const box = (await span.boundingBox())!;
  await page.mouse.move(box.x + 1, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.4, box.y + box.height / 2, { steps: 5 });
  await page.mouse.up();

  const draft = page.getByTestId("draft");
  await expect(draft).toBeVisible();
  await draft.getByRole("radio", { name: "Must fix" }).click();
  await draft.getByLabel("Comment").fill("State N.");
  await draft.getByRole("button", { name: "Add comment" }).click();

  await expect(page.getByText("Saved")).toBeVisible();
  await expect(page.getByLabel("Comment 1", { exact: true })).toHaveValue("State N.");
  await page.reload();
  await expect(page.getByLabel("Comment 1", { exact: true })).toHaveValue("State N.");
  await expect(page.locator('[data-page="1"] .overlay')).toHaveCount(1);

  await page.getByRole("button", { name: "Export" }).click();
  await expect(page.getByRole("link", { name: "Annotated PDF" })).toBeVisible();
  const csv = await page.request.get(await page.getByRole("link", { name: "CSV" }).getAttribute("href") as string);
  expect(await csv.text()).toContain("State N.,Must fix,1");
});

test("speed stepper moves in 0.05 steps, persists, and speech errors are shown", async ({ page }) => {
  await page.goto("/");
  await page.locator('input[type="file"]').setInputFiles(SAMPLE);
  await page.getByRole("link", { name: "sample.pdf" }).first().click();
  const speed = page.getByTestId("speed");
  await expect(speed).toHaveText("1.50×");
  await page.getByRole("button", { name: "Slower" }).click();
  await page.getByRole("button", { name: "Slower" }).click();
  await page.getByRole("button", { name: "Slower" }).click();
  await expect(speed).toHaveText("1.35×");
  for (let i = 0; i < 9; i++) await page.keyboard.press("]");
  await expect(speed).toHaveText("1.80×");
  await page.reload();
  await expect(speed).toHaveText("1.80×");

  // isolated e2e data dir has no Kokoro files, so playback must explain what to do
  await expect(page.getByText("1/4")).toBeVisible();
  await page.getByRole("button", { name: "Play" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "fastrtc/kokoro-onnx" })).toBeVisible();
});

test("reading position is remembered and last-comment button jumps", async ({ page }) => {
  await page.goto("/");
  await page.locator('input[type="file"]').setInputFiles(SAMPLE);
  await page.getByRole("link", { name: "sample.pdf" }).first().click();
  await expect(page.getByText("1/4")).toBeVisible();
  await expect(page.getByRole("button", { name: /Last comment/ })).toBeDisabled();

  for (let i = 0; i < 3; i++) await page.getByRole("button", { name: "Next sentence" }).click();
  await expect(page.getByText("4/4")).toBeVisible();
  await page.reload();
  await expect(page.getByText("4/4")).toBeVisible();
  await expect(page.getByRole("button", { name: "Resume p. 2" })).toBeEnabled();

  const span = page.locator('[data-page="1"] .react-pdf__Page__textContent span').first();
  const box = (await span.boundingBox())!;
  await page.mouse.move(box.x + 1, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.3, box.y + box.height / 2, { steps: 5 });
  await page.mouse.up();
  await page.getByTestId("draft").getByRole("button", { name: "Add comment" }).click();
  await expect(page.getByRole("button", { name: "Last comment (#1)" })).toBeEnabled();

  // Resume puts the sentence near the top of the view: page 2's top edge sits within ~100px of the scroller's
  await page.getByRole("button", { name: "Resume p. 2" }).click();
  const offset = () =>
    page.locator('[data-page="2"]').evaluate((el) => {
      const scroller = el.closest(".overflow-auto")!;
      return el.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
    });
  await expect.poll(offset).toBeLessThan(100);
  await expect.poll(offset).toBeGreaterThan(-100);
  await page.getByRole("button", { name: "Last comment (#1)" }).click();
  await expect(page.locator('[data-page="1"] .overlay').first()).toBeInViewport();
});

test("c comments on the current sentence when nothing is selected", async ({ page }) => {
  await page.goto("/");
  await page.locator('input[type="file"]').setInputFiles(SAMPLE);
  await page.getByRole("link", { name: "sample.pdf" }).first().click();
  await expect(page.getByText(/^\d+\/4$/)).toBeVisible();
  await page.getByRole("button", { name: "Next sentence" }).click();
  await expect(page.getByText("2/4")).toBeVisible();

  await page.keyboard.press("c");
  const draft = page.getByTestId("draft");
  await expect(draft.locator("blockquote")).not.toHaveText("“”");
  await expect(draft.getByRole("textbox", { name: "Comment" })).toBeFocused();
  await draft.getByRole("textbox", { name: "Comment" }).fill("unclear");
  await draft.getByRole("button", { name: "Add comment" }).click();
  await expect(page.getByRole("button", { name: "Last comment (#1)" })).toBeEnabled();
  await expect(page.locator(".overlay").first()).toBeAttached();
});

test("keyboard shortcut key is visible and expands", async ({ page }) => {
  await page.goto("/");
  await page.locator('input[type="file"]').setInputFiles(SAMPLE);
  await page.getByRole("link", { name: "sample.pdf" }).first().click();
  const key = page.getByText("Keyboard shortcuts");
  await expect(key).toBeInViewport();
  await key.click();
  await expect(page.getByText("Comment on selection or current sentence")).toBeInViewport();
});
