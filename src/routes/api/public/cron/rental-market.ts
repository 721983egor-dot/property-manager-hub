import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

export const Route = createFileRoute("/api/public/cron/rental-market")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = await authenticateCronRequest(request);
        if (denied) return denied;
        const { syncRentalMarket } = await import("@/lib/market/metrapi.server");
        const result = await syncRentalMarket();
        return Response.json(result);
      },
    },
  },
});
