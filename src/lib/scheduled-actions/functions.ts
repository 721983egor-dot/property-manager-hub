import { createServerFn } from "@tanstack/react-start";
import { requireUser } from "@/lib/auth-user-middleware";
import { manageScheduleSchema } from "./model";
export const getScheduledActions = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .handler(async () => {
    return (await import("./service.server")).listScheduledActions();
  });
export const changeScheduledAction = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator((v: unknown) => manageScheduleSchema.parse(v))
  .handler(async ({ data }) => {
    return (await import("./service.server")).manageScheduledAction(data);
  });
