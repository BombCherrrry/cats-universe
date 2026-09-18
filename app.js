// ===== общее для всех страниц =====

const NAME_KEY = "cu_name";
const ID_KEY = "cu_id";

function getUserName() {
  return localStorage.getItem(NAME_KEY) || "";
}

function getUserId() {
  let id = localStorage.getItem(ID_KEY);
  if (!id) {
    id = "u_" + Math.random().toString(36).slice(2, 10);
    localStorage.setItem(ID_KEY, id);
  }
  return id;
}

function setUserName(name) {
  localStorage.setItem(NAME_KEY, name.trim());
}

function initials(name) {
  return (name || "?").trim().slice(0, 1).toUpperCase();
}

function timeAgo(iso) {
  const d = new Date(iso);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return "только что";
  if (diff < 3600) return Math.floor(diff / 60) + " мин назад";
  if (diff < 86400) return Math.floor(diff / 3600) + " ч назад";
  if (diff < 86400 * 7) return Math.floor(diff / 86400) + " дн назад";
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// ---- имя при первом визите ----

function ensureName(onReady) {
  const existing = getUserName();
  if (existing) { onReady(existing); return; }

  const back = document.createElement("div");
  back.className = "modal-back";
  back.innerHTML = `
    <div class="modal">
      <h3>Как тебя записать?</h3>
      <p>Имя увидят остальные — под ним будут твои комментарии и реакции. Можно сменить позже в шапке сайта.</p>
      <input id="nameInput" placeholder="Например, Лика" maxlength="30" autofocus />
      <button id="nameSave">Войти в Cat's Universe</button>
    </div>`;
  document.body.appendChild(back);

  const input = back.querySelector("#nameInput");
  const save = () => {
    const v = input.value.trim();
    if (!v) { input.focus(); return; }
    setUserName(v);
    back.remove();
    onReady(v);
  };
  back.querySelector("#nameSave").addEventListener("click", save);
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") save(); });
}

function renderWho() {
  addAdminLink();
  const el = document.getElementById("whoBox");
  if (!el) return;
  const name = getUserName();
  el.innerHTML = name
    ? `<button id="renameBtn">${escapeHtml(name)} · сменить имя</button>`
    : `<button id="renameBtn">Представиться</button>`;
  el.querySelector("#renameBtn").addEventListener("click", () => {
    const v = prompt("Как тебя записать?", getUserName());
    if (v && v.trim()) { setUserName(v); renderWho(); }
  });
}

// Если в этом браузере сохранён админский токен — показываем ссылку на админку.
function addAdminLink() {
  if (!localStorage.getItem("cu_gh_token")) return;
  const nav = document.querySelector(".nav");
  if (!nav || nav.querySelector(".admin-link")) return;
  if (/admin\.html$/.test(location.pathname)) return;

  const a = document.createElement("a");
  a.href = "admin.html";
  a.className = "admin-link";
  a.textContent = "Админка";
  nav.appendChild(a);
}

// ---- Supabase client (загружается через CDN script в html) ----

function getSupabase() {
  if (!window.supabase) {
    console.error("Supabase JS не загрузился");
    return null;
  }
  if (!window._sb) {
    window._sb = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
  }
  return window._sb;
}
