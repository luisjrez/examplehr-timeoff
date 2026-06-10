import { getHcmStore } from "@/mocks/singleton";
import { errorResponse, withChaos } from "@/mocks/routeHelpers";

interface RouteContext {
  readonly params: Promise<{ employeeId: string; locationId: string }>;
}

/**
 * The authoritative per-cell read (TRD §9): "1 day for locationId=X,
 * employeeId=Y". The client's verification flow depends on this endpoint
 * telling the truth, so it takes no store-level chaos — only transport chaos.
 */
export async function GET(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  const { employeeId, locationId } = await context.params;
  return withChaos(request, { mutating: false }, () => {
    const cell = getHcmStore().getCell(employeeId, locationId);
    if (!cell) {
      return errorResponse(404, "not_found");
    }
    return Response.json(cell);
  });
}
