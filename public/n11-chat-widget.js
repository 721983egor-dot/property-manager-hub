/**
 * Встраиваемый виджет чата H11 → RM OS.
 * Подключение (preview):
 *   <script src="https://preview-rm-os.residence-more.ru/n11-chat-widget.js" async></script>
 * API берётся с того же хоста, что и скрипт (можно переопределить data-api на теге script).
 */
(function () {
  if (window.__H11_CHAT_LOADED__) return;
  window.__H11_CHAT_LOADED__ = true;

  var scriptEl = document.currentScript;
  var API =
    (scriptEl && scriptEl.getAttribute("data-api")) ||
    (scriptEl && scriptEl.src
      ? scriptEl.src.replace(/\/[^/]*$/, "")
      : window.location.origin);
  API = String(API).replace(/\/$/, "");

  var STORAGE_KEY = "h11_chat_visitor";
  var PHONE = "+7 (938) 442-08-09";
  var TEL = "tel:+79384420809";

  function visitorKey() {
    try {
      var v = localStorage.getItem(STORAGE_KEY);
      if (!v) {
        v =
          crypto && crypto.randomUUID
            ? crypto.randomUUID()
            : "v" + Date.now() + Math.random().toString(36).slice(2, 10);
        localStorage.setItem(STORAGE_KEY, v);
      }
      return v.indexOf("n11:") === 0 ? v : "n11:" + v;
    } catch (_) {
      return "n11:anon" + Date.now();
    }
  }

  function esc(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function time(iso) {
    try {
      return new Date(iso).toLocaleTimeString("ru-RU", {
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch (_) {
      return "";
    }
  }

  var style = document.createElement("style");
  style.textContent =
    ".h11cw-root{position:fixed;right:16px;bottom:16px;z-index:2147483000;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif}" +
    ".h11cw-btn{width:56px;height:56px;border:0;border-radius:999px;background:#1a1a1a;color:#fff;cursor:pointer;box-shadow:0 10px 30px rgba(0,0,0,.25);display:grid;place-items:center}" +
    ".h11cw-btn:hover{transform:scale(1.04)}" +
    ".h11cw-panel{width:min(92vw,340px);margin-bottom:12px;background:#fff;border:1px solid #e5e5e5;border-radius:16px;overflow:hidden;box-shadow:0 20px 50px rgba(0,0,0,.2);display:flex;flex-direction:column}" +
    ".h11cw-head{background:#111;color:#fff;padding:14px 16px}" +
    ".h11cw-head strong{display:block;font-size:15px}" +
    ".h11cw-head span{display:block;margin-top:4px;font-size:12px;opacity:.72}" +
    ".h11cw-head a{color:#fff;opacity:.85;font-size:12px;text-decoration:none}" +
    ".h11cw-list{max-height:260px;min-height:140px;overflow:auto;padding:12px 14px;display:flex;flex-direction:column;gap:8px;background:#fafafa}" +
    ".h11cw-empty{background:#f0f0f0;border-radius:12px;padding:10px 12px;font-size:13px;color:#333;line-height:1.4}" +
    ".h11cw-msg{max-width:85%;border-radius:14px;padding:8px 11px;font-size:13px;line-height:1.4;white-space:pre-wrap;word-break:break-word}" +
    ".h11cw-in{align-self:flex-end;background:#1a1a1a;color:#fff}" +
    ".h11cw-out{align-self:flex-start;background:#ececec;color:#111}" +
    ".h11cw-meta{margin-top:3px;font-size:10px;opacity:.6}" +
    ".h11cw-form{display:flex;gap:8px;padding:10px;border-top:1px solid #e8e8e8;background:#fff}" +
    ".h11cw-form textarea{flex:1;min-height:40px;max-height:96px;resize:none;border:1px solid #ddd;border-radius:10px;padding:8px 10px;font:inherit;font-size:13px}" +
    ".h11cw-form button{border:0;border-radius:10px;background:#1a1a1a;color:#fff;padding:0 14px;cursor:pointer;font-size:13px}" +
    ".h11cw-err{color:#b00020;font-size:12px;padding:0 14px 8px}";
  document.head.appendChild(style);

  var root = document.createElement("div");
  root.className = "h11cw-root";
  root.innerHTML =
    '<div class="h11cw-panel" hidden>' +
    '<div class="h11cw-head"><strong>H11 Резиденция</strong>' +
    '<span>Напишите нам — ответим в рабочее время</span>' +
    '<a href="' +
    TEL +
    '">' +
    PHONE +
    "</a></div>" +
    '<div class="h11cw-list"></div>' +
    '<div class="h11cw-err" hidden></div>' +
    '<form class="h11cw-form"><textarea rows="1" placeholder="Ваше сообщение…" maxlength="2000"></textarea>' +
    '<button type="submit">Отправить</button></form></div>' +
    '<button type="button" class="h11cw-btn" aria-label="Открыть чат">' +
    '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
    '<path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"/></svg></button>';
  document.body.appendChild(root);

  var panel = root.querySelector(".h11cw-panel");
  var list = root.querySelector(".h11cw-list");
  var form = root.querySelector(".h11cw-form");
  var input = root.querySelector("textarea");
  var err = root.querySelector(".h11cw-err");
  var btn = root.querySelector(".h11cw-btn");
  var open = false;
  var timer = null;

  function render(messages) {
    if (!messages.length) {
      list.innerHTML =
        '<div class="h11cw-empty">Здравствуйте! Спросите про даты, апартаменты или заезд — ответим здесь. Или позвоните нам.</div>';
      return;
    }
    list.innerHTML = messages
      .map(function (m) {
        var cls = m.direction === "in" ? "h11cw-in" : "h11cw-out";
        return (
          '<div class="h11cw-msg ' +
          cls +
          '">' +
          esc(m.body) +
          '<div class="h11cw-meta">' +
          esc(time(m.created_at)) +
          "</div></div>"
        );
      })
      .join("");
    list.scrollTop = list.scrollHeight;
  }

  function load() {
    fetch(API + "/api/public/n11-chat?visitorKey=" + encodeURIComponent(visitorKey()), {
      credentials: "omit",
    })
      .then(function (res) {
        return res.json();
      })
      .then(function (data) {
        if (data && data.ok) render(data.messages || []);
      })
      .catch(function () {});
  }

  btn.addEventListener("click", function () {
    open = !open;
    panel.hidden = !open;
    btn.setAttribute("aria-label", open ? "Закрыть чат" : "Открыть чат");
    if (open) {
      load();
      if (!timer)
        timer = setInterval(function () {
          if (open) load();
        }, 5000);
    } else if (timer) {
      clearInterval(timer);
      timer = null;
    }
  });

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var body = (input.value || "").trim();
    if (!body) return;
    err.hidden = true;
    fetch(API + "/api/public/n11-chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "omit",
      body: JSON.stringify({
        visitorKey: visitorKey(),
        body: body,
        page: location.href.slice(0, 300),
      }),
    })
      .then(function (res) {
        return res.json();
      })
      .then(function (data) {
        if (!data.ok) throw new Error(data.error || "Ошибка отправки");
        input.value = "";
        load();
      })
      .catch(function (ex) {
        err.textContent =
          (ex && ex.message) || "Не удалось отправить. Попробуйте ещё раз.";
        err.hidden = false;
      });
  });
})();
