import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireUser } from "@/lib/auth-user-middleware";
import {
  privateEmployeeInput,
  privateRuleApprovalInput,
  privateTestMessageInput,
} from "./private-employee-chat";

export const canUsePrivateEmployeeChat = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .handler(async () =>
    (await import("./private-employee-chat.server")).privateEmployeeChatsAvailable(),
  );

export const loadEmployeeTestChat = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator(privateEmployeeInput.extend({ dialogId: z.string().uuid().optional() }).parse)
  .handler(async ({ data }) =>
    (await import("./private-employee-chat.server")).loadPrivateEmployeeChats(
      data.employeeId,
      data.dialogId,
    ),
  );

export const startEmployeeTestChat = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator(privateEmployeeInput.parse)
  .handler(async ({ data }) =>
    (await import("./private-employee-chat.server")).createPrivateEmployeeChat(data.employeeId),
  );

export const advanceEmployeeTestChat = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator(privateTestMessageInput.parse)
  .handler(async ({ data }) =>
    (await import("./private-employee-chat.server")).advancePrivateEmployeeChat(data),
  );

export const saveEmployeeTestRule = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator(privateRuleApprovalInput.parse)
  .handler(async ({ data }) =>
    (await import("./private-employee-chat.server")).approvePrivateEmployeeRule(data),
  );
