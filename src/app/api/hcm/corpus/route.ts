import { getHcmStore } from "@/mocks/singleton";
import {
  maybeFireDemoAnniversary,
  withChaos,
} from "@/mocks/routeHelpers";

/** The corpus is "expensive": a baseline latency makes that real (TRD §9). */
const CORPUS_BASE_LATENCY_MS = 600;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Full corpus of balances across all dimensions. Used by the client for
 * initial hydration and periodic reconciliation only — never per-interaction.
 */
export async function GET(request: Request): Promise<Response> {
  maybeFireDemoAnniversary();
  return withChaos(request, { mutating: false }, async () => {
    await sleep(CORPUS_BASE_LATENCY_MS);
    return Response.json({ cells: getHcmStore().getCorpus() });
  });
}
