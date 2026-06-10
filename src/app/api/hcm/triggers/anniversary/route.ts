import { getHcmStore } from "@/mocks/singleton";
import { errorResponse } from "@/mocks/routeHelpers";

interface AnniversaryBody {
  readonly employeeId: string;
}

function parseBody(body: unknown): AnniversaryBody | undefined {
  if (typeof body !== "object" || body === null) {
    return undefined;
  }
  const { employeeId } = body as Record<string, unknown>;
  return typeof employeeId === "string" ? { employeeId } : undefined;
}

/**
 * Deterministic trigger for the work-anniversary bonus: tests and Storybook
 * fire it on purpose; the deployed demo also fires it on a lazy timer
 * (see routeHelpers.maybeFireDemoAnniversary).
 */
export async function POST(request: Request): Promise<Response> {
  const body = parseBody(await request.json().catch(() => null));
  if (!body) {
    return errorResponse(400, "malformed_body");
  }
  const affected = getHcmStore().triggerAnniversary(body.employeeId);
  return Response.json({ affected });
}
