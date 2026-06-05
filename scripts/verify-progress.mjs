import { chromium } from "playwright";

const url = "http://127.0.0.1:5173#room=progress-test&key=preview&seedUrl=/kai.local.json&reset=1";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
});

const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});

await page.goto(url, { waitUntil: "networkidle" });
await page.waitForSelector("text=Visit progress");
await page.getByRole("button", { name: "Questions" }).click();
const groupOptions = await page.locator('select[aria-label="Question group"] option').allTextContents();
await page.getByRole("button", { name: "Other" }).click();
await page.getByLabel("Question group", { exact: true }).selectOption("other");
await page.getByLabel("New question").fill("Other category smoke test");
await page.getByRole("button", { name: "Add question" }).click();
const otherQuestionVisible = await page.getByText("Other category smoke test").isVisible();
const initialProgress = await page.getByRole("heading", { name: /% complete/ }).textContent();
await page.getByRole("button", { name: "Complete Visit" }).click();
await page.waitForSelector("text=Still open");
const openText = await page.getByText(/items? still open before leaving/).textContent();
await page.locator("details.explanation").first().click();
const explanationText = await page.locator("details.explanation[open] p").first().textContent();
await page.getByRole("button", { name: "Asked" }).first().click();
await page.getByRole("textbox", { name: "PCV product", exact: true }).fill("PCV20");
await page.getByRole("textbox", { name: "Growth target", exact: true }).fill("Recheck weight in 1-2 weeks");
const updatedProgress = await page.getByRole("heading", { name: /% complete/ }).textContent();
const doneItems = await page.locator(".completion-list li.complete").count();

await browser.close();

console.log(
  JSON.stringify(
    {
      errors,
      initialProgress,
      openText,
      explanationText,
      updatedProgress,
      doneItems,
      hasOtherOption: groupOptions.includes("Other"),
      otherQuestionVisible,
    },
    null,
    2,
  ),
);
