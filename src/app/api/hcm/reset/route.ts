import { getHcmStore } from "@/mocks/singleton";

/** Test-only: re-seed the store so e2e specs are isolated from each other. */
export async function POST(): Promise<Response> {
  getHcmStore().reset();
  return Response.json({ ok: true });
}
