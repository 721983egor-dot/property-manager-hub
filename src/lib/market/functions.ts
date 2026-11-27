import { createServerFn } from "@tanstack/react-start";
import { requireUser } from "@/lib/auth-user-middleware";

export const readRentOverview = createServerFn({ method: "GET" })
  .middleware([requireUser])
  .inputValidator((value: { house?: string | undefined; property?: string | undefined }) => ({
    house: typeof value?.house === "string" ? value.house : undefined,
    property: typeof value?.property === "string" ? value.property : undefined,
  }))
  .handler(async ({ data }) =>
    (await import("./rental-market.server")).readRentalMarket(data.house, data.property),
  );
