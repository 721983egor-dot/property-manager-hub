// Разовая аренда: proposeDealWon(serviceType=commission_only) → closeDealWon; getRentalContract.serviceType; proposeBooking и updateRentalContract используют общий защищённый writer без ежемесячных начислений.
// Ключи: getPropertyKeys → proposePropertyKeyChange → confirmed changePropertyKeys; роль/держатель/версия проверяются сервером, атомарный аудит.
// Связанные регулярные серии: repeat.unlimited; getRecurringPaymentSeries → proposeUpdateRecurringPayment(single/following) → editRecurringPayment. Постоянный шаблон, защищённый cron продления, атомарные RPC и аудит; оплаченные/частичные не переписываются массово.
// Регулярные обычные операции: getPaymentSeriesPreview → proposeCreatePayment(repeat.interval/paymentDay/count/untilDate) → createPayment; общий расчёт дат, одна атомарная вставка, фактическая оплата только у первой операции.
// Остатки всех счетов: getFinanceAccountBalances. Отмена подтверждения: getPaymentConfirmation → proposeReversePaymentConfirmation → reversePaymentConfirmation; атомарный RPC, администратор, аудит.
// Прибыльность домов и квартир: getObjectProfitability, общий расчёт с отчётом, только чтение администратора.
// Единая аренда: ownerPayoutDay в createBooking/updateRentalContract, getRentalContract/getFinanceRentalTerms; сроки выплат и платежи в брони. Старые настройки дня на объекте больше не предлагаются.
// Собственники контрагентов: getCounterpartyObjects; подтверждённый proposeCounterpartyObjects → saveCounterpartyObjects, общие finance_object_settings и аудит.
// checkBookingPricePeriods: предварительная проверка сезонных цен брони без записи.
// getFinanceWorkspace: обзор компании, остатки по потокам, прогноз и ближайшие платежи; без локальных остатков браузера.
// Календарь «Все движения» и потоки объекта: getFinanceObjectFlow (company/owner/total), тот же расчёт факта и прогноза, что в интерфейсе. Только чтение администратора.
// Lease documents: getLeaseContext; proposePrepareLease, proposeSaveClientPassport, proposeLeaseCompany, proposeLeaseTemplate; encrypted confirmed executors.
// Единая бронь → финансы: getRentalContract; подтверждённые proposeUpdateRentalContract → updateRentalContract и proposeCancelRentalContract → cancelRentalContract, аудит брони/графика/платежей.
// Статьи компании: getFinanceAnalytics/getFinanceObjects выделяют комиссию из аренды; listFinanceCatalog + подтверждённый proposeSaveFinanceArticle → saveFinanceArticle, аудит существующих таблиц.
// Предоплата: getRentalInstallments; proposeRentalInstallments → createRentalInstallments (подтверждение администратора, аудит).
// Company/client finance: getFinanceWorkspace; confirmed proposeRentalOwnerSettings, proposeRentalReceipt, proposeRentalSchedule, proposeRefreshRentalSettlements.
// CRM commission: proposeDealWon -> closeDealWon atomically creates booking and dated one-time/seasonal monthly company income; getCrmResults returns commission plan/actual and separate rental turnover.
// CRM: getCrmResults, listDealLossReasons; confirmed reason catalog, loss/win and intake acceptance.
// Personal Telegram reminders: listReminders, proposeReminder/proposeManageReminder; confirmed create/manage, administrator only.
// Rental finance: getFinanceRentalTerms; proposeManagementFee, proposeManagementFeePayment (admin confirmation).
// Import review: compact parameters + description; Telegram suppresses duplicate model preamble.
// Rental copy: draftRentalDescription; import proposal includes copy; property update supports locationDescription.
// Rental import: inspectYandexDiskPhotos, selectYandexDiskPhotos (all-source vision selection), proposeImportRentalFromDisk; confirmed importRentalFromDisk.
// Owner settlements: getOwnerSettlements; proposeOwnerPayoutSettings, proposeCreateOwnerSettlement, proposePayOwnerSettlement (confirmed administrator actions).
// Finance accounts: listFinanceAccounts, proposeCreateFinanceAccount, proposeUpdateFinanceAccount, proposeArchiveFinanceAccount, getFinanceAccountUsage, proposeDeleteFinanceAccount.
// Финансовые объекты: getFinanceObjects; save/delete/assignFinanceObjectClassification, updateFinanceObligation — только через подтверждение.
// Финансовый дашборд, ДДС/ОПиУ/план-факт/объекты/долги: getFinanceAnalytics; политика статей: proposeSaveFinanceArticle.
// Описания площадок: getListingDescription; сезонные периоды из объекта, proposePropertyUpdate(seasonalPricing/summerPriceMonth/priceMonth) → существующий подтверждённый updateProperty с аудитом.
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

// Расход: proposeCreatePayment/proposeUpdatePayment поддерживают expenseBearer company/owner.
// Владелец определяется по объекту; getCounterparty и getOwnerSettlements показывают расходы и удержания.

// Изменение типа обычной операции и статьи: proposeUpdatePayment(direction, articleId). Связанные платежи сохраняют тип.

// Индивидуальные денежные условия аренды: getRentalContract.cashTerms; proposeBookingCashTerms → setBookingCashTerms. Только подтверждённый администратор, аудит и пересчёт в одной транзакции.

// Отдельный согласованный график: getRentalContract.cashTerms.collection_plan; proposeBookingCollectionPlan → setBookingCollectionPlan (admin, подтверждение, аудит).

// Бронь с полными финансовыми условиями: proposeBooking / proposeUpdateRentalContract(financialTerms) → finance_save_booking, общий атомарный путь с редактором; getRentalContract.financialTerms.

// Связанные финансовые задачи: getFinanceTasks → proposeConfirmFinanceTask → подтверждённый confirmFinanceTask; общий проектор с блоком Задачи, аудит в платежах.

// Выплаты по запросу: ownerPayoutMode=on_request через proposeBooking / proposeUpdateRentalContract; getRentalContract.ownerPayoutMode, getOwnerExpenseStatement — долг и хранение без просрочки.

// Financial task rescheduling: getFinanceTasks → proposeRescheduleFinanceTask → confirmed rescheduleFinanceTask; payment audit preserves contract dates.

// getFinanceTasks / proposeConfirmFinanceTask / proposeRescheduleFinanceTask also cover all standalone scheduled income and expenses, with existing confirmation and audit.
