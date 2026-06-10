import { expect, test } from "@playwright/test";

import { START, endFor } from "./dates";

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
  // Guard against SSR/client divergence: a persisted ledger hydrating
  // synchronously caused a real React hydration mismatch (#418/#423).
  const hydrationErrors: string[] = [];
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      /hydrat|minified react error #4(18|23|25)/i.test(message.text())
    ) {
      hydrationErrors.push(message.text());
    }
  });

  await page.goto("/employee");
  await expect(page.getByText("12", { exact: true })).toBeVisible();

  await page.getByLabel("Start date").fill(START);
  await page.getByLabel("End date").fill(endFor(2));
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
  expect(hydrationErrors).toEqual([]);
});

test("a decision made while the employee was away lands on the rehydrated request", async ({
  page,
  request,
}) => {
  await page.goto("/employee");
  await expect(page.getByText("12", { exact: true })).toBeVisible();

  await page.getByLabel("Start date").fill(START);
  await page.getByLabel("End date").fill(endFor(2));
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
