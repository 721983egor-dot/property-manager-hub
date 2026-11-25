import { createServerFn } from "@tanstack/react-start";
import { requireUser } from "@/lib/auth-user-middleware";
import { decideShowingRuleInput } from "./marina-learning";

export const getMarinaShowingRules = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .handler(async () => (await import("./marina-learning.server")).listMarinaShowingRules());

export const decideMarinaRule = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator(decideShowingRuleInput.parse)
  .handler(async ({ data }) =>
    (await import("./marina-learning.server")).decideMarinaShowingRule(data),
  );
