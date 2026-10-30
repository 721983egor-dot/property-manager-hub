import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireUser } from "@/lib/auth-user-middleware";
export const getTaskCalendar = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .handler(async () => (await import("./service.server")).calendarStatus());
export const saveTaskCalendar = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator((v: unknown) =>
    z.object({ action: z.enum(["enable", "disable"]), scope: z.enum(["mine", "all"]) }).parse(v),
  )
  .handler(async ({ data }) =>
    (await import("./service.server")).configureCalendar(data.action, data.scope),
  );
