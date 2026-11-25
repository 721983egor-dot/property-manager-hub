import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireUser } from "./auth-user-middleware";

export const readFinanceManagement = createServerFn({ method: "GET" })
  .middleware([requireUser])
  .inputValidator(z.object({ month: z.string().regex(/^20\d{2}-(0[1-9]|1[0-2])$/) }))
  .handler(async ({ data }) =>
    (await import("./finance-management.server")).getFinanceManagementReport(data.month),
  );
