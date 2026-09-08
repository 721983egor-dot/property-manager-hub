import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { Trash2 } from "lucide-react";
import { useState } from "react";

import { CrmTabs } from "@/components/CrmTabs";
import {
  LEAD_STATUS_OPTIONS,
  deleteLead,
  fetchLeads,
  leadStatusLabel,
  updateLeadStatus,
  type LeadStatus,
} from "@/lib/leads";
import { leadTopicLabel } from "@/lib/site";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/crm/leads/")({
  head: () => ({
    meta: [{ title: "Заявки — RM OS" }, { name: "robots", content: "noindex" }],
  }),
  component: LeadsPage,
});

const STATUS_CLASS: Record<LeadStatus, string> = {
  new: "text-status-free",
  in_work: "text-status-booked",
  done: "text-muted-foreground",
  rejected: "text-destructive",
};

function LeadsPage() {
  const queryClient = useQueryClient();
  const { data: leads = [], isLoading } = useQuery({
    queryKey: ["leads"],
    queryFn: fetchLeads,
  });
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: LeadStatus }) =>
      updateLeadStatus(id, status),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["leads"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteLead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      setDeleteId(null);
    },
  });

  return (
    <div className="mx-auto max-w-[1200px] px-6 py-8">
      <h1 className="text-2xl font-bold tracking-tight">Заявки с сайта</h1>
      <CrmTabs active="leads" />

      <div className="mt-6 overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[900px] text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-3 font-medium">Дата</th>
              <th className="px-4 py-3 font-medium">Имя</th>
              <th className="px-4 py-3 font-medium">Телефон</th>
              <th className="px-4 py-3 font-medium">Тема</th>
              <th className="px-4 py-3 font-medium">Сообщение</th>
              <th className="px-4 py-3 font-medium">Статус</th>
              <th className="px-4 py-3 font-medium" />
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                  Загружаем заявки…
                </td>
              </tr>
            )}
            {!isLoading && leads.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                  Заявок пока нет.
                </td>
              </tr>
            )}
            {leads.map((lead) => (
              <tr key={lead.id} className="border-b border-border last:border-0">
                <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                  {format(new Date(lead.created_at), "dd.MM.yyyy HH:mm", { locale: ru })}
                </td>
                <td className="px-4 py-3 font-medium">{lead.name}</td>
                <td className="whitespace-nowrap px-4 py-3">
                  <a href={`tel:${lead.phone}`} className="text-primary hover:underline">
                    {lead.phone}
                  </a>
                </td>
                <td className="px-4 py-3">{leadTopicLabel(lead.topic)}</td>
                <td className="max-w-[260px] px-4 py-3 text-muted-foreground">
                  <span className="line-clamp-2">{lead.message || "—"}</span>
                </td>
                <td className="px-4 py-3">
                  <Select
                    value={lead.status}
                    onValueChange={(v) =>
                      statusMutation.mutate({ id: lead.id, status: v as LeadStatus })
                    }
                  >
                    <SelectTrigger className={"h-8 w-[140px] " + STATUS_CLASS[lead.status]}>
                      <SelectValue>{leadStatusLabel(lead.status)}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {LEAD_STATUS_OPTIONS.map((s) => (
                        <SelectItem key={s.value} value={s.value}>
                          {s.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => setDeleteId(lead.id)}
                    className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                    aria-label="Удалить заявку"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <AlertDialog open={deleteId !== null} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить заявку?</AlertDialogTitle>
            <AlertDialogDescription>
              Заявка будет удалена без возможности восстановления.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Удалить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
