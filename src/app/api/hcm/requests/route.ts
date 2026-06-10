import { getHcmStore, } from "@/mocks/singleton";
import {
  errorResponse,
  hcmErrorResponse,
  withChaos,
} from "@/mocks/routeHelpers";
import { httpStatusOf, parseFileRequestBody } from "@/mocks/wire";

/** List requests, optionally filtered by status (manager view polls this). */
export async function GET(request: Request): Promise<Response> {
  return withChaos(request, { mutating: false }, () => {
    const url = new URL(request.url);
    const status = url.searchParams.get("status");
    const requests =
      status === "pending" || status === "approved" || status === "denied"
        ? getHcmStore().listRequests(status)
        : getHcmStore().listRequests();
    return Response.json({ requests });
  });
}

/** File a time-off request: CAS write that places a hold on the balance. */
export async function POST(request: Request): Promise<Response> {
  const body = parseFileRequestBody(await request.json().catch(() => null));
  if (!body) {
    return errorResponse(400, "malformed_body");
  }
  return withChaos(request, { mutating: true }, (chaosMode) => {
    const result = getHcmStore().fileRequest(
      chaosMode !== undefined ? { ...body, chaos: chaosMode } : body,
    );
    if (!result.ok) {
      return hcmErrorResponse(result.error, httpStatusOf(result.error));
    }
    return Response.json(result.value, { status: 201 });
  });
}
