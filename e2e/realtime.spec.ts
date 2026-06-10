import { expect, test } from "@playwright/test";

import { START, endFor } from "./dates";

/**
 * Real-time reconciliation (TRD §6.6): HCM is not the only thing that
 * mutates balances. These specs mutate HCM from OUTSIDE the browser session
 * and assert the open UI converges via SSE — far faster than the 60s corpus
 * poll could explain.
 */

test.beforeEach(async ({ request }) => {
  const reset = await request.post("/api/hcm/reset");
  expect(reset.ok()).toBeTruthy();
});

test("an external anniversary bonus reaches the open session live, with narration", async ({
  page,
  request,
}) => {
  await page.goto("/employee");
  await expect(page.getByText("12", { exact: true })).toBeVisible();
  await expect(page.getByText("● Live")).toBeVisible();

  // The mutation happens at HCM, not through this UI.
  const bonus = await request.post("/api/hcm/triggers/anniversary", {
    data: { employeeId: "emp-alice" },
  });
  expect(bonus.ok()).toBeTruthy();

  // Both of Alice's cells converge within seconds — the 60s poll cannot
  // explain this; only the SSE channel can.
  await expect(page.getByText("13", { exact: true })).toBeVisible({
    timeout: 5_000,
  });
  await expect(page.getByText("6", { exact: true })).toBeVisible({
    timeout: 5_000,
  });
  await expect(page.getByText(/balance updated by hcm/i).first()).toBeVisible();
});

test("a filing from another session appears in the open manager queue live", async ({
  page,
  request,
}) => {
  await page.goto("/manager");
  await expect(page.getByText("No requests waiting for review.")).toBeVisible();
  await expect(page.getByText("● Live")).toBeVisible();

  // Another user files a request — not through this tab.
  const cellRead = await request.get("/api/hcm/balance/emp-alice/loc-mx");
  const cell = (await cellRead.json()) as { version: number };
  const filed = await request.post("/api/hcm/requests", {
    data: {
      employeeId: "emp-alice",
      locationId: "loc-mx",
      startDate: START,
      endDate: endFor(2),
      expectedVersion: cell.version,
    },
  });
  expect(filed.status()).toBe(201);

  // The queue updates within seconds — the 10s poll cannot explain this.
  await expect(page.getByText(/emp-alice/)).toBeVisible({ timeout: 5_000 });
  await expect(page.getByRole("button", { name: "Approve" })).toBeEnabled();
});

test("a manager decision elsewhere updates the employee's balance live", async ({
  browser,
  request,
}) => {
  const context = await browser.newContext();
  const employeePage = await context.newPage();
  await employeePage.goto("/employee");
  await expect(employeePage.getByText("12", { exact: true })).toBeVisible();

  // Employee files; the hold is verified.
  await employeePage.getByLabel("Start date").fill(START);
  await employeePage.getByLabel("End date").fill(endFor(3));
  await employeePage.getByRole("button", { name: "Request time off" }).click();
  await expect(
    employeePage.getByText("Awaiting manager approval", { exact: true }),
  ).toBeVisible();
  await expect(employeePage.getByText("9", { exact: true })).toBeVisible();

  // A manager denies it from a completely separate context (API).
  const pending = await request.get("/api/hcm/requests?status=pending");
  const { requests } = (await pending.json()) as {
    requests: ReadonlyArray<{ id: string }>;
  };
  const requestId = requests[0]?.id ?? "";
  const cellRead = await request.get("/api/hcm/balance/emp-alice/loc-mx");
  const cell = (await cellRead.json()) as { version: number };
  const denied = await request.patch(`/api/hcm/requests/${requestId}`, {
    data: { decision: "deny", expectedCellVersion: cell.version },
  });
  expect(denied.ok()).toBeTruthy();

  // Both the refund (cell event) and the denial (request event) reach the
  // open session via SSE — no poll required.
  await expect(employeePage.getByText("12", { exact: true })).toBeVisible({
    timeout: 5_000,
  });
  await expect(
    employeePage.getByText("Denied by your manager.", { exact: true }),
  ).toBeVisible({ timeout: 5_000 });

  await context.close();
});
