import { z } from "zod";

export const privateEmployeeInput = z.object({ employeeId: z.enum(["marina", "alexander"]) });
export type PrivateEmployeeId = z.infer<typeof privateEmployeeInput>["employeeId"];
export const privateDialogInput = privateEmployeeInput.extend({ dialogId: z.string().uuid() });
export const privateDialogVersion = privateDialogInput.extend({ version: z.string().uuid() });
export const privateTestMessageInput = privateDialogVersion.extend({
  role: z.enum(["client", "operator"]),
  text: z.string().trim().min(1).max(2000),
});
export const privateRuleApprovalInput = privateDialogVersion.extend({
  rule: z.string().trim().min(3).max(400),
});
const testTurn = z.object({
  role: z.enum(["client", "operator", "draft", "memory_request"]),
  text: z.string(),
});
export const privateDialogue = z.object({
  id: z.string().uuid(),
  version: z.string().uuid(),
  messages: z.array(testTurn),
  pending_rule: z.string().nullable(),
});
export type PrivateEmployeeDialog = z.infer<typeof privateDialogue>;
export const privateRulePrefix = "Правило из личного теста: ";

export function memoryRequest(role: "client" | "operator", text: string) {
  if (role !== "operator") return null;
  const match = text.match(/^запомни(?=$|[\s:,.!—-])[\s:,.!—-]*(.*)/isu);
  return match ? (match[1] ?? "").trim() : null;
}
