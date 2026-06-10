import { expect, test } from "@playwright/test";

/**
 * Session persistence (plan-0001 phase-2): the pending overlay survives
 * reloads, and rehydrated entries re-verify against HCM so the projection
 * never double-counts a hold that HCM already applied.
 */

test.beforeEach(async ({ request }) => {
  const reset = await request.post("/api/hcm/reset");
  expect(reset.ok()).toBeTruthy();
});

test("a filed request survives a reload — visible, correct phase, no double-count", async ({
  page,
}) => {
  await page.goto("/employee");
  await expect(page.getByText("12", { exact: true })).toBeVisible();

  await page.getByLabel("Days").fill("2");
  await page.getByRole("button", { name: "Request time off" }).click();
  await expect(
    page.getByText("Awaiting manager approval", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("10", { exact: true })).toBeVisible();

  await page.reload();

  // The user-reported bug: balance stayed at 10 but "My requests" went
  // empty. Now the request is still there with its verified phase…
  await expect(
    page.getByText("Awaiting manager approval", { exact: true }),
  ).toBeVisible();
  // …and the projection shows HCM truth (10), NOT 10 − 2 re-subtracted.
  await expect(page.getByText("10", { exact: true })).toBeVisible();
  await expect(page.getByText("8", { exact: true })).not.toBeVisible();
});

test("a decision made while the employee was away lands on the rehydrated request", async ({
  page,
  request,
}) => {
  await page.goto("/employee");
  await expect(page.getByText("12", { exact: true })).toBeVisible();

  await page.getByLabel("Days").fill("2");
  await page.getByRole("button", { name: "Request time off" }).click();
  await expect(
    page.getByText("Awaiting manager approval", { exact: true }),
  ).toBeVisible();

  // The manager approves while the employee's tab is "closed".
  const pending = await request.get("/api/hcm/requests?status=pending");
  const { requests } = (await pending.json()) as {
    requests: ReadonlyArray<{ id: string }>;
  };
  const cellRead = await request.get(`/api/hcm/balance/emp-alice/loc-mx`);
  const cell = (await cellRead.json()) as { version: number };
  const approved = await request.patch(
    `/api/hcm/requests/${requests[0]?.id ?? ""}`,
    { data: { decision: "approve", expectedCellVersion: cell.version } },
  );
  expect(approved.ok()).toBeTruthy();

  await page.reload();

  // Boot reconciliation folds the decision in: granted, balance unchanged.
  await expect(
    page.getByText("Time off granted", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("10", { exact: true })).toBeVisible();
});
