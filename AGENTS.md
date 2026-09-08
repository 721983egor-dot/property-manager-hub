<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Ассистент (ИИ) — обязательное правило

Каждая новая функция RM OS одновременно с интерфейсом получает инструмент Ассистента:

- чтение данных — `src/lib/ai/tools/read.server.ts`;
- изменение — предложение в `src/lib/ai/tools/mutate.server.ts` + исполнитель в `src/lib/ai/executors.server.ts`;
- реестр — `src/lib/ai/tools/index.server.ts`.

Изменяющие действия никогда не выполняются сразу: Ассистент только предлагает, менеджер подтверждает кнопкой. Каждое выполненное действие пишется в `activity_log`.
