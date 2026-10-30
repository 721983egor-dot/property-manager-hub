import { createServerFn } from "@tanstack/react-start";
import { requireUser } from "@/lib/auth-user-middleware";
import { z } from "zod";
import { changeSchema, connectionSchema, periodSchema } from "./model";

export const getYandexConnection = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .handler(async () => (await import("./service.server")).connectionStatus());
export const saveYandexConnection = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator((v: unknown) => connectionSchema.parse(v))
  .handler(async ({ data }) => (await import("./service.server")).saveConnection(data));
export const getYandexAdvertising = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator((v: unknown) =>
    periodSchema.extend({ refresh: z.boolean().default(false) }).parse(v),
  )
  .handler(async ({ data }) =>
    (await import("./service.server")).advertisingReport(data.days, data.refresh),
  );
export const prepareYandexChange = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator((v: unknown) => changeSchema.parse(v))
  .handler(async ({ data }) => (await import("./service.server")).prepareAdvertisingChange(data));
export const confirmYandexChange = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator((v: unknown) => z.object({ proposalId: z.string().uuid() }).parse(v))
  .handler(async ({ data }) => (await import("./service.server")).applyAdvertisingChange(data));
