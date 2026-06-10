import { expect, test, type Page } from "@playwright/test";

/**
 * Cross-layer wiring no other test layer can see (TRD §10): real Next.js
 * route handlers, real browser, both personas in separate tabs sharing the
 * same HCM store. Serial — the store is process-wide; each spec re-seeds it.
 */

test.beforeEach(async ({ request }) => {
  const reset = await request.post("/api/hcm/reset");
  expect(reset.ok()).toBeTruthy();
});

async function fileRequest(
  employeePage: Page,
  days: string,
  chaos?: string,
): Promise<void> {
  if (chaos !== undefined) {
    await employeePage.getByLabel("HCM chaos mode").selectOption(chaos);
  }
  await employeePage.getByLabel("Days").fill(days);
  await employeePage.getByRole("button", { name: "Request time off" }).click();
}

test("employee files → manager approves → employee is told, honestly", async ({
  browser,
}) => {
  const context = await browser.newContext();
  const employeePage = await context.newPage();
  await employeePage.goto("/employee");
  await expect(employeePage.getByText("12", { exact: true })).toBeVisible();

  await fileRequest(employeePage, "2");

  // Honest lifecycle: hold disclosed, then verified as awaiting approval —
  // never "approved" before the manager speaks.
  await expect(
    employeePage.getByText("Awaiting manager approval", { exact: true }),
  ).toBeVisible();
  await expect(employeePage.getByText("10", { exact: true })).toBeVisible();

  // Manager, in their own tab, sees the request with decision-time balance.
  const managerPage = await context.newPage();
  await managerPage.goto("/manager");
  await expect(managerPage.getByText(/emp-alice/)).toBeVisible();
  await expect(managerPage.getByText(/balance right now/i)).toBeVisible();
  await managerPage.getByRole("button", { name: "Approve" }).click();
  await expect(
    managerPage.getByText("No requests waiting for review."),
  ).toBeVisible();

  // The employee's open session learns the outcome via decision sync.
  await expect(
    employeePage.getByText("Time off granted", { exact: true }),
  ).toBeVisible({
    timeout: 15_000,
  });

  await context.close();
});

test("manager denial refunds the hold and the employee sees both", async ({
  browser,
}) => {
  const context = await browser.newContext();
  const employeePage = await context.newPage();
  await employeePage.goto("/employee");
  await expect(employeePage.getByText("12", { exact: true })).toBeVisible();

  await fileRequest(employeePage, "3");
  await expect(
    employeePage.getByText("Awaiting manager approval", { exact: true }),
  ).toBeVisible();
  await expect(employeePage.getByText("9", { exact: true })).toBeVisible();

  const managerPage = await context.newPage();
  await managerPage.goto("/manager");
  await managerPage.getByRole("button", { name: "Deny" }).click();
  await expect(
    managerPage.getByText("No requests waiting for review."),
  ).toBeVisible();

  // Denied + refund reconciled back into the employee's view.
  await expect(
    employeePage.getByText("Denied by your manager.", { exact: true }),
  ).toBeVisible({ timeout: 15_000 });
  await expect(employeePage.getByText("12", { exact: true })).toBeVisible({
    timeout: 15_000,
  });

  await context.close();
});

test("silent failure: contradiction surfaces, rolls back, and retry recovers", async ({
  page,
}) => {
  await page.goto("/employee");
  await expect(page.getByText("12", { exact: true })).toBeVisible();

  await fileRequest(page, "2", "silent-failure");

  // The 200 lied; verification catches it and the projection rolls back.
  await expect(
    page.getByText("HCM did not apply this request", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("12", { exact: true })).toBeVisible();

  // Recovery: retry goes through the clean path and verifies.
  await page.getByLabel("HCM chaos mode").selectOption("");
  await page.getByRole("button", { name: "Retry with fresh balance" }).click();
  await expect(
    page.getByText("Awaiting manager approval", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("10", { exact: true })).toBeVisible();
});

test("anniversary bonus mid-session reconciles with a narrated toast", async ({
  page,
}) => {
  await page.goto("/employee");
  await expect(page.getByText("12", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: /anniversary bonus/i }).click();

  await expect(page.getByText("13", { exact: true })).toBeVisible();
  await expect(page.getByText(/balance updated by hcm/i).first()).toBeVisible();
});

test("approval is version-gated: stale writes 409, the live panel re-arms with truth", async ({
  page,
  request,
}) => {
  // Seed a pending request directly through the API.
  const corpus = await request.get("/api/hcm/balance/emp-alice/loc-mx");
  const cell = (await corpus.json()) as { version: number };
  const filed = await request.post("/api/hcm/requests", {
    data: {
      employeeId: "emp-alice",
      locationId: "loc-mx",
      days: 2,
      expectedVersion: cell.version,
    },
  });
  const filedRecord = (await filed.json()) as { id: string };
  expect(filed.status()).toBe(201);

  await page.goto("/manager");
  await expect(page.getByRole("button", { name: "Approve" })).toBeEnabled();
  const staleVersion = cell.version + 1; // version after the filing's debit

  // The world moves AFTER the panel's fresh read…
  const bonus = await request.post("/api/hcm/triggers/anniversary", {
    data: { employeeId: "emp-alice" },
  });
  expect(bonus.ok()).toBeTruthy();

  // …and the open panel re-arms LIVE with the new balance (10 + 1 bonus).
  await expect(page.getByText("11", { exact: true })).toBeVisible({
    timeout: 5_000,
  });

  // The CAS gate itself, end-to-end: a write carrying the stale version is
  // structurally rejected by the real route handler.
  const staleDecision = await request.patch(
    `/api/hcm/requests/${filedRecord.id}`,
    { data: { decision: "approve", expectedCellVersion: staleVersion } },
  );
  expect(staleDecision.status()).toBe(409);

  // The UI, holding current truth thanks to SSE, approves cleanly.
  await page.getByRole("button", { name: "Approve" }).click();
  await expect(page.getByText("No requests waiting for review.")).toBeVisible();
});
