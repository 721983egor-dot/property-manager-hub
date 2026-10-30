import { createServerFn } from "@tanstack/react-start";
import { requireUser } from "./auth-user-middleware";
import { z } from "zod";
export const getMarketingReport = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator((data: { days?: number }) =>
    z.object({ days: z.number().int().min(1).max(366).default(30) }).parse(data),
  )
  .handler(async ({ data }) => {
    const { marketingReport } = await import("./marketing-report.server");
    return marketingReport(data.days);
  });
