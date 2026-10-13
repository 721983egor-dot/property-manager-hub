import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const payloadSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("claim") }),
  z.object({
    action: z.literal("ack"),
    id: z.string().uuid(),
    token: z.string().uuid(),
    success: z.boolean(),
  }),
]);
export const Route = createFileRoute("/api/public/telegram/reminders")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { webhookSecret } = await import("@/lib/telegram/api.server");
        const secret = request.headers.get("X-Telegram-Bot-Api-Secret-Token");
        if (secret !== (await webhookSecret()))
          return new Response("Unauthorized", { status: 401 });
        const parsed = payloadSchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return new Response("Bad request", { status: 400 });
        const service = await import("@/lib/reminders/service.server");
        if (parsed.data.action === "claim")
          return Response.json({ deliveries: await service.claimReminders() });
        return Response.json({
          ok: await service.ackReminder(parsed.data.id, parsed.data.token, parsed.data.success),
        });
      },
    },
  },
});
