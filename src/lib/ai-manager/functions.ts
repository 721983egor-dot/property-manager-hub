import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireUser } from "@/lib/auth-user-middleware";
import { playbookSchema } from "./model";
import { employeeScenarioApproval, employeeScenarioInput } from "./employee-tests";

export const getAiEmployeeProfiles = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .handler(async () => (await import("./service.server")).listAiEmployeeProfiles());
export const getManagerPlaybook = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .handler(async () => (await import("./service.server")).getPlaybook());
export const saveManagerPlaybook = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator((v: unknown) =>
    z.object({ revision: z.string().max(100), value: playbookSchema }).parse(v),
  )
  .handler(async ({ data }) => (await import("./service.server")).savePlaybook(data));
export const reviewManagerChat = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator((v: unknown) => z.object({ threadId: z.string().uuid() }).parse(v))
  .handler(async ({ data }) => (await import("./service.server")).prepareChatReview(data.threadId));
export const confirmManagerReview = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator((v: unknown) =>
    z.object({ reviewId: z.string().uuid(), stageId: z.string().uuid().nullable() }).parse(v),
  )
  .handler(async ({ data }) => (await import("./service.server")).applyChatReview(data));

export const getAlexanderPlaybook = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .handler(async () => (await import("./employee-tests.server")).getSupportPlaybook());

export const saveAlexanderPlaybook = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator((v: unknown) =>
    z.object({ revision: z.string().max(100), value: playbookSchema }).parse(v),
  )
  .handler(async ({ data }) => (await import("./employee-tests.server")).saveSupportPlaybook(data));

export const testEmployeeConnection = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .handler(async () => (await import("./employee-tests.server")).checkEmployeeConnection());

export const testEmployeeScenario = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator(employeeScenarioInput.parse)
  .handler(async ({ data }) => (await import("./employee-tests.server")).runEmployeeScenario(data));

export const getEmployeeHandbooks = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .handler(async () => (await import("./employee-tests.server")).getEmployeeHandbooks());

export const approveEmployeeSkill = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator(employeeScenarioApproval.parse)
  .handler(async ({ data }) =>
    (await import("./employee-skills.server")).approveEmployeeScenario(data),
  );
