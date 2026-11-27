import { createServerFn } from "@tanstack/react-start";
import { requireUser } from "@/lib/auth-user-middleware";
import { z } from "zod";

export const readRentOverview = createServerFn({ method: "GET" })
  .middleware([requireUser])
  .inputValidator((value: { house?: string | undefined; property?: string | undefined }) => ({
    house: typeof value?.house === "string" ? value.house : undefined,
    property: typeof value?.property === "string" ? value.property : undefined,
  }))
  .handler(async ({ data }) =>
    (await import("./rental-market.server")).readRentalMarket(data.house, data.property),
  );

export const refreshRentOverview = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator(
    z.object({
      key: z.string().trim().max(256).optional(),
      skip: z.array(z.string().max(256)).max(500),
    }),
  )
  .handler(async ({ data }) => {
    await (await import("@/lib/crm-results.server")).crmAccess();
    const local = process.env["SUPABASE_PROJECT_ID"] === "local-test";
    return (await import("./metrapi.server")).syncRentalMarket({
      key: local ? data.key : undefined,
      skip: data.skip,
    });
  });
