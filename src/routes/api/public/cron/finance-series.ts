import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/api/public/cron/finance-series")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const allowed = [
          process.env["CRON_SECRET"],
          process.env["LOVABLE_CRON_SECRET"],
          process.env["DEPLOY_AGENT_TOKEN"],
        ].filter((v): v is string => !!v);
        if (!allowed.includes(request.headers.get("x-cron-secret") ?? ""))
          return new Response("Unauthorized", { status: 401 });
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await (
          supabaseAdmin as unknown as import("@supabase/supabase-js").SupabaseClient
        ).rpc("finance_extend_payment_series");
        if (error)
          return Response.json(
            { ok: false, error: "Не удалось продлить регулярные операции" },
            { status: 500 },
          );
        return Response.json({ ok: true, created: data });
      },
    },
  },
});
