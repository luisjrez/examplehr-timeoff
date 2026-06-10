import { expect, test, type Page } from "@playwright/test";

/**
 * Non-happy paths called out by the assignment: clear rejections, successes
 * that lie in different ways, conflicts racing the user, and concurrent
 * managers. Each spec re-seeds the shared HCM store.
 */

test.beforeEach(async ({ request }) => {
  const reset = await request.post("/api/hcm/reset");
  expect(reset.ok()).toBeTruthy();
});

async function fileRequest(
  page: Page,
  days: string,
  chaos?: string,
): Promise<void> {
  if (chaos !== undefined) {
    await page.getByLabel("HCM chaos mode").selectOption(chaos);
  }
  await page.getByLabel("Days").fill(days);
  await page.getByRole("button", { name: "Request time off" }).click();
}

test("insufficient balance: HCM rejects cleanly and no optimism leaks", async ({
  page,
}) => {
  await page.goto("/employee");
  await expect(page.getByText("12", { exact: true })).toBeVisible();

  await fileRequest(page, "99");

  await expect(page.getByText("Denied", { exact: true })).toBeVisible();
  await expect(
    page.getByText(/not enough days available/i).first(),
  ).toBeVisible();
  // The projection never moved: the rejection rolled the hold back.
  await expect(page.getByText("12", { exact: true })).toBeVisible();
  await expect(page.getByText(/pending confirmation/)).not.toBeVisible();
});

test("wrong-success: the 200 stored the request but never applied the hold — discard settles it", async ({
  page,
}) => {
  await page.goto("/employee");
  await expect(page.getByText("12", { exact: true })).toBeVisible();

  await fileRequest(page, "2", "wrong-success");

  // Verification catches the half-applied write.
  await expect(
    page.getByText("HCM did not apply this request", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("12", { exact: true })).toBeVisible();

  // The user chooses to walk away instead of retrying.
  await page.getByRole("button", { name: "Discard" }).click();

  await expect(page.getByText("Discarded", { exact: true })).toBeVisible();
  await expect(page.getByText("12", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Retry with fresh balance" }),
  ).not.toBeVisible();
});

test("forced version conflict at filing: recovery retries against fresh truth", async ({
  page,
}) => {
  await page.goto("/employee");
  await expect(page.getByText("12", { exact: true })).toBeVisible();

  await fileRequest(page, "2", "conflict");

  await expect(
    page.getByText("HCM did not apply this request", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("The balance changed while filing."),
  ).toBeVisible();

  // Chaos off → retry goes through the clean path and verifies.
  await page.getByLabel("HCM chaos mode").selectOption("");
  await page.getByRole("button", { name: "Retry with fresh balance" }).click();

  await expect(
    page.getByText("Awaiting manager approval", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("10", { exact: true })).toBeVisible();
});

test("hard 500: kept as a recoverable contradiction, never lost or auto-retried", async ({
  page,
}) => {
  await page.goto("/employee");
  await expect(page.getByText("12", { exact: true })).toBeVisible();

  await fileRequest(page, "2", "error");

  await expect(
    page.getByText("HCM did not apply this request", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("HCM did not answer clearly.", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("12", { exact: true })).toBeVisible();

  await page.getByLabel("HCM chaos mode").selectOption("");
  await page.getByRole("button", { name: "Retry with fresh balance" }).click();

  await expect(
    page.getByText("Awaiting manager approval", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("10", { exact: true })).toBeVisible();
});

test("per-location isolation: a filing against Austin never touches Mexico City", async ({
  page,
}) => {
  await page.goto("/employee");
  await expect(page.getByText("12", { exact: true })).toBeVisible();
  await expect(page.getByText("5", { exact: true })).toBeVisible();

  await page.getByLabel("Location").selectOption("loc-us");
  await fileRequest(page, "2");

  await expect(
    page.getByText("Awaiting manager approval", { exact: true }),
  ).toBeVisible();
  // Austin debited, Mexico City untouched — balances are per-cell (TRD C8).
  await expect(page.getByText("3", { exact: true })).toBeVisible();
  await expect(page.getByText("12", { exact: true })).toBeVisible();
});

test("two managers race: the second decision on a settled request fails safely", async ({
  browser,
  request,
}) => {
  // Seed one pending request through the API.
  const cellResponse = await request.get("/api/hcm/balance/emp-alice/loc-mx");
  const cell = (await cellResponse.json()) as { version: number };
  const filed = await request.post("/api/hcm/requests", {
    data: {
      employeeId: "emp-alice",
      locationId: "loc-mx",
      days: 2,
      expectedVersion: cell.version,
    },
  });
  expect(filed.status()).toBe(201);

  const context = await browser.newContext();
  const managerA = await context.newPage();
  const managerB = await context.newPage();
  await managerA.goto("/manager");
  await managerB.goto("/manager");
  await expect(managerA.getByRole("button", { name: "Approve" })).toBeEnabled();
  await expect(managerB.getByRole("button", { name: "Deny" })).toBeEnabled();

  // A approves first. B's queue reconciles LIVE (request event over SSE):
  // the already-settled request vanishes before B can act on it — the race
  // is prevented, not merely rejected.
  await managerA.getByRole("button", { name: "Approve" }).click();
  await expect(
    managerA.getByText("No requests waiting for review."),
  ).toBeVisible();
  await expect(
    managerB.getByText("No requests waiting for review."),
  ).toBeVisible({ timeout: 5_000 });

  // And if a stale decision still slips through (e.g. SSE down), HCM's
  // not_pending guard rejects it end-to-end — no silent flip.
  const pending = await managerB.request.get("/api/hcm/requests");
  const { requests } = (await pending.json()) as {
    requests: ReadonlyArray<{ id: string }>;
  };
  const settledId = requests[0]?.id ?? "";
  const staleDeny = await managerB.request.patch(
    `/api/hcm/requests/${settledId}`,
    { data: { decision: "deny", expectedCellVersion: 999 } },
  );
  expect(staleDeny.status()).toBe(409);

  await context.close();
});
