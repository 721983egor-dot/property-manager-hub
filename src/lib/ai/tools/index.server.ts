// Import review: compact parameters + description; Telegram suppresses duplicate model preamble.
// Rental copy: draftRentalDescription; import proposal includes copy; property update supports locationDescription.
// Rental import: inspectYandexDiskPhotos, selectYandexDiskPhotos (all-source vision selection), proposeImportRentalFromDisk; confirmed importRentalFromDisk.
// Owner settlements: getOwnerSettlements; proposeOwnerPayoutSettings, proposeCreateOwnerSettlement, proposePayOwnerSettlement (confirmed administrator actions).
// Finance accounts: listFinanceAccounts, proposeCreateFinanceAccount, proposeArchiveFinanceAccount.
// Финансовые объекты: getFinanceObjects; save/delete/assignFinanceObjectClassification, updateFinanceObligation — только через подтверждение.
// Финансовый дашборд, ДДС/ОПиУ/план-факт/объекты/долги: getFinanceAnalytics; политика статей: proposeSaveFinanceArticle.
import { createReadTools } from "@/lib/ai/tools/read.server";
import { createMutateTools } from "@/lib/ai/tools/mutate.server";
import { createSkillTools } from "@/lib/ai/tools/skills.server";
import { createSocialTools } from "@/lib/ai/tools/social.server";

import type { AssistantToolContext } from "@/lib/ai/context.server";

/**
 * Единый реестр инструментов Ассистента.
 *
 * ПРАВИЛО ПРОЕКТА: каждая новая функция RM OS одновременно с интерфейсом
 * получает инструмент здесь (чтение — в read.server.ts, изменение —
 * в mutate.server.ts + исполнитель в executors.server.ts). Тогда при
 * обновлении системы Ассистент сразу умеет пользоваться новой функцией.
 */
export function buildAssistantTools(ctx: AssistantToolContext) {
  return {
    // Включает карточку дня, классификации и юридическое лицо обязательства.
    ...createReadTools(ctx),
    ...createMutateTools(ctx),
    ...createSkillTools(),
    ...createSocialTools(ctx),
  };
}
