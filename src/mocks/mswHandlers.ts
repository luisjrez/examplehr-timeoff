import { delay, http, HttpResponse } from "msw";

import type { HcmStore } from "./hcmStore";
import {
  CHAOS_HEADER,
  httpStatusOf,
  parseChaosHeader,
  parseDecisionBody,
  parseFileRequestBody,
} from "./wire";

/**
 * MSW mirror of the route handlers, over an injectable store instance
 * (TRD §9: one brain, two transports). Tests/Storybook create a fresh store
 * per scenario, so no state leaks between them.
 *
 * Unlike the route-handler layer there is no demo-mode dice rolling here:
 * in tests and stories, ALL chaos is explicit via the x-chaos header.
 */
export function buildHcmHandlers(
  store: HcmStore,
): ReturnType<typeof http.get>[] {
  return [
    http.get(
      "/api/hcm/balance/:employeeId/:locationId",
      async ({ request, params }) => {
        const chaos = parseChaosHeader(request.headers.get(CHAOS_HEADER));
        if (chaos.latencyMs !== undefined) {
          await delay(chaos.latencyMs);
        }
        if (chaos.hardError === true) {
          return HttpResponse.json(
            { error: "hcm_unavailable" },
            { status: 500 },
          );
        }
        const cell = store.getCell(
          String(params.employeeId),
          String(params.locationId),
        );
        if (!cell) {
          return HttpResponse.json({ error: "not_found" }, { status: 404 });
        }
        return HttpResponse.json(cell);
      },
    ),

    http.get("/api/hcm/corpus", async ({ request }) => {
      const chaos = parseChaosHeader(request.headers.get(CHAOS_HEADER));
      if (chaos.latencyMs !== undefined) {
        await delay(chaos.latencyMs);
      }
      if (chaos.hardError === true) {
        return HttpResponse.json({ error: "hcm_unavailable" }, { status: 500 });
      }
      return HttpResponse.json({ cells: store.getCorpus() });
    }),

    http.get("/api/hcm/requests", ({ request }) => {
      const status = new URL(request.url).searchParams.get("status");
      const requests =
        status === "pending" || status === "approved" || status === "denied"
          ? store.listRequests(status)
          : store.listRequests();
      return HttpResponse.json({ requests });
    }),

    http.post("/api/hcm/requests", async ({ request }) => {
      const chaos = parseChaosHeader(request.headers.get(CHAOS_HEADER));
      if (chaos.latencyMs !== undefined) {
        await delay(chaos.latencyMs);
      }
      if (chaos.hardError === true) {
        return HttpResponse.json({ error: "hcm_unavailable" }, { status: 500 });
      }
      const body = parseFileRequestBody(await request.json().catch(() => null));
      if (!body) {
        return HttpResponse.json({ error: "malformed_body" }, { status: 400 });
      }
      const result = store.fileRequest(
        chaos.mode !== undefined ? { ...body, chaos: chaos.mode } : body,
      );
      if (!result.ok) {
        return HttpResponse.json(
          { error: result.error },
          { status: httpStatusOf(result.error) },
        );
      }
      return HttpResponse.json(result.value, { status: 201 });
    }),

    http.get("/api/hcm/requests/:id", ({ params }) => {
      const record = store.getRequest(String(params.id));
      if (!record) {
        return HttpResponse.json({ error: "not_found" }, { status: 404 });
      }
      return HttpResponse.json(record);
    }),

    http.patch("/api/hcm/requests/:id", async ({ request, params }) => {
      const body = parseDecisionBody(await request.json().catch(() => null));
      if (!body) {
        return HttpResponse.json({ error: "malformed_body" }, { status: 400 });
      }
      const result = store.decideRequest(
        String(params.id),
        body.decision,
        body.expectedCellVersion,
      );
      if (!result.ok) {
        return HttpResponse.json(
          { error: result.error },
          { status: httpStatusOf(result.error) },
        );
      }
      return HttpResponse.json(result.value);
    }),

    http.post("/api/hcm/triggers/anniversary", async ({ request }) => {
      const body: unknown = await request.json().catch(() => null);
      const employeeId =
        typeof body === "object" && body !== null && "employeeId" in body
          ? (body as { employeeId: unknown }).employeeId
          : undefined;
      if (typeof employeeId !== "string") {
        return HttpResponse.json({ error: "malformed_body" }, { status: 400 });
      }
      return HttpResponse.json({
        affected: store.triggerAnniversary(employeeId),
      });
    }),

    http.post("/api/hcm/reset", () => {
      store.reset();
      return HttpResponse.json({ ok: true });
    }),
  ];
}
