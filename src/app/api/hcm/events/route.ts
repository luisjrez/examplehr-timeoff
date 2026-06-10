import { getHcmStore } from "@/mocks/singleton";

export const dynamic = "force-dynamic";

const KEEPALIVE_INTERVAL_MS = 15_000;

/**
 * Real-time feed of confirmed-cell changes (TRD §6.6): Server-Sent Events.
 * The client treats this as a faster delivery path for the same truth the
 * corpus poll reconciles — same merge rules, versions win over arrival order.
 *
 * On serverless the connection is cut at the function's max duration;
 * EventSource auto-reconnects, and the corpus poll remains the safety net.
 */
export async function GET(request: Request): Promise<Response> {
  const store = getHcmStore();
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      let open = true;

      const send = (payload: string): void => {
        if (!open) {
          return;
        }
        try {
          controller.enqueue(encoder.encode(payload));
        } catch {
          open = false;
        }
      };

      send(`data: ${JSON.stringify({ type: "hello" })}\n\n`);

      const unsubscribe = store.subscribe((cell) => {
        send(`data: ${JSON.stringify({ type: "cell", cell })}\n\n`);
      });

      // Comment frames keep intermediaries from killing the idle connection.
      const keepalive = setInterval(() => {
        send(`: keepalive\n\n`);
      }, KEEPALIVE_INTERVAL_MS);

      request.signal.addEventListener("abort", () => {
        open = false;
        clearInterval(keepalive);
        unsubscribe();
        try {
          controller.close();
        } catch {
          // Already closed by the runtime.
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    },
  });
}
