import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/api/lease-documents")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const s = await import("@/lib/lease/service.server");
          const actor = await s.leaseActor();
          if (Number(request.headers.get("content-length") ?? 0) > 17 * 1024 * 1024)
            throw new Error("Файл слишком большой");
          if (request.headers.get("content-type")?.includes("multipart/form-data")) {
            const form = await request.formData(),
              file = form.get("file");
            if (!(file instanceof File)) throw new Error("Выберите файл");
            const bytes = Buffer.from(await file.arrayBuffer());
            const action = form.get("action");
            if (action === "passport") {
              const { recognizePassport } = await import("@/lib/lease/passport.server");
              const r = await recognizePassport(bytes, file.type);
              const saved = { identity: r.identity };
              return Response.json(saved, { headers: { "Cache-Control": "no-store" } });
            }
            if (action === "signed")
              return Response.json(await s.saveSignedLease(actor, String(form.get("id")), bytes));
            if (action === "templateFile") {
              if (bytes.length > 2 * 1024 * 1024 || !file.name.toLowerCase().endsWith(".docx"))
                throw new Error("Загрузите шаблон Word (.docx) до 2 МБ");
              const { importLeaseTemplate } = await import("@/lib/lease/import.server");
              const text = importLeaseTemplate(bytes);
              return Response.json({ text }, { headers: { "Cache-Control": "no-store" } });
            }
            throw new Error("Неизвестная загрузка");
          }
          const p = await request.json();
          let result: unknown;
          switch (p.action) {
            case "context":
              result = await s.leaseContext(p, actor);
              break;
            case "identity":
              result = await s.readLeaseIdentity(actor, p.clientId);
              break;
            case "saveIdentity":
              result = await s.saveLeaseIdentity(actor, p.clientId, p.identity);
              break;
            case "saveDraft":
              result = await s.saveLeaseDraft(actor, p.input);
              break;
            case "saveTemplate":
              result = await s.saveLeaseTemplate(actor, p.template);
              break;
            case "saveProfile":
              result = await s.saveLeaseProfile(actor, p.profile);
              break;
            case "generate":
              result = await s.generateLease(p.input, actor);
              break;
            case "file": {
              const f = await s.leaseFile(actor, p.id, p.format);
              return new Response(new Uint8Array(f.bytes), {
                headers: {
                  "Content-Type": f.type,
                  "Content-Disposition": `attachment; filename="${f.filename}"`,
                  "Cache-Control": "private, no-store",
                  "X-Content-Type-Options": "nosniff",
                },
              });
            }
            default:
              throw new Error("Неизвестное действие");
          }
          return Response.json(result, { headers: { "Cache-Control": "private, no-store" } });
        } catch (e) {
          const message = e instanceof Error ? e.message : "Ошибка подготовки договора";
          return Response.json(
            { error: message },
            {
              status: /вход|администратор|доступ|привяжите/i.test(message) ? 403 : 400,
              headers: { "Cache-Control": "no-store" },
            },
          );
        }
      },
    },
  },
});
