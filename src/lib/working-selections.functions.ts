import { createServerFn } from "@tanstack/react-start";
import { requireUser } from "./auth-user-middleware";
import { workingSelectionSchema, managerNoteSchema } from "./working-selections-model";
export const getManagerCatalog = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .handler(async ({ context }) =>
    (await import("./working-selections.server")).loadManagerCatalog(context.userId),
  );
export const getWorkingSelections = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .handler(async ({ context }) =>
    (await import("./working-selections.server")).loadWorkingSelections(context.userId),
  );
export const saveWorkingSelectionFn = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator((v: unknown) => workingSelectionSchema.parse(v))
  .handler(async ({ context, data }) =>
    (await import("./working-selections.server")).saveWorkingSelection(context.userId, data),
  );
export const saveManagerNoteFn = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator((v: unknown) => managerNoteSchema.parse(v))
  .handler(async ({ context, data }) =>
    (await import("./working-selections.server")).saveManagerNote(context.userId, data),
  );
