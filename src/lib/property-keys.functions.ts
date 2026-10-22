import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireUser } from "./auth-user-middleware";
import { keyCommandSchema } from "./property-keys-model";
export const getKeysWorkspace = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .handler(async ({ context }) => {
    const s = await import("./property-keys.server");
    return s.loadKeyWorkspace(await s.keyActor(context.userId));
  });
export const keyMutationSchema = z.object({
  propertyId: z.string().uuid(),
  expected: z.number().int().min(0),
  command: keyCommandSchema,
});
export const changePropertyKeys = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator((input: unknown) => keyMutationSchema.parse(input))
  .handler(async ({ context, data }) => {
    const s = await import("./property-keys.server");
    return s.mutatePropertyKeys(
      await s.keyActor(context.userId),
      data.propertyId,
      data.expected,
      data.command,
    );
  });
