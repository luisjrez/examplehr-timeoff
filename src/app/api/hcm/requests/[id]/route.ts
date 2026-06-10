import { getHcmStore } from "@/mocks/singleton";
import {
  errorResponse,
  hcmErrorResponse,
  withChaos,
} from "@/mocks/routeHelpers";
import { httpStatusOf, parseDecisionBody } from "@/mocks/wire";

interface RouteContext {
  readonly params: Promise<{ id: string }>;
}

/** Authoritative read of one request — the verification path for filings. */
export async function GET(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  const { id } = await context.params;
  return withChaos(request, { mutating: false }, () => {
    const record = getHcmStore().getRequest(id);
    if (!record) {
      return errorResponse(404, "not_found");
    }
    return Response.json(record);
  });
}

/** Manager decision, gated by the cell version they decided against (TRD §7). */
export async function PATCH(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  const { id } = await context.params;
  const body = parseDecisionBody(await request.json().catch(() => null));
  if (!body) {
    return errorResponse(400, "malformed_body");
  }
  return withChaos(request, { mutating: true }, () => {
    const result = getHcmStore().decideRequest(
      id,
      body.decision,
      body.expectedCellVersion,
    );
    if (!result.ok) {
      return hcmErrorResponse(result.error, httpStatusOf(result.error));
    }
    return Response.json(result.value);
  });
}
