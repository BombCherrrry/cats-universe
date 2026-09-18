// Админка Cat's Universe.
// Токен GitHub хранится только в localStorage этого браузера.

const TOKEN_KEY = "cu_gh_token";
const owner = location.hostname.split(".")[0];
const repo = location.pathname.split("/").filter(Boolean)[0] || "cats-universe";

document.getElementById("repoNameHint").textContent = `${owner}/${repo}`;
renderWho();

const gateView = document.getElementById("gateView");
const panelView = document.getElementById("panelView");

function getToken() { return localStorage.getItem(TOKEN_KEY) || ""; }

function showGate() { gateView.style.display = "block"; panelView.style.display = "none"; }
function showPanel() { gateView.style.display = "none"; panelView.style.display = "block"; loadComics(); loadModeration(); }

if (getToken()) showPanel(); else showGate();

document.getElementById("saveTokenBtn").addEventListener("click", () => {
  const t = document.getElementById("tokenInput").value.trim();
  if (!t) return;
  localStorage.setItem(TOKEN_KEY, t);
  showPanel();
});

document.getElementById("logoutLink").addEventListener("click", (e) => {
  e.preventDefault();
  localStorage.removeItem(TOKEN_KEY);
  showGate();
});

// ---------- вкладки ----------

document.querySelectorAll(".tabs button").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tabs button").forEach(b => b.classList.remove("on"));
    btn.classList.add("on");
    ["upload", "manage", "mod"].forEach(t => {
      document.getElementById("tab-" + t).style.display = (t === btn.dataset.tab) ? "block" : "none";
    });
  });
});

// ---------- GitHub API ----------

async function ghRequest(path, options = {}) {
  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${path}`, {
    ...options,
    headers: {
      "Authorization": `Bearer ${getToken()}`,
      "Accept": "application/vnd.github+json",
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`GitHub ${res.status}: ${body.message || res.statusText}`);
  }
  return res.status === 204 ? null : res.json();
}

async function ghPutFile(path, base64Content, message) {
  let sha;
  try { sha = (await ghRequest(path)).sha; } catch (e) { /* нового файла ещё нет */ }
  return ghRequest(path, { method: "PUT", body: JSON.stringify({ message, content: base64Content, sha }) });
}

async function ghDeleteFile(path, message) {
  const existing = await ghRequest(path);
  return ghRequest(path, { method: "DELETE", body: JSON.stringify({ message, sha: existing.sha }) });
}

async function readComicsJson() {
  const file = await ghRequest("data/comics.json");
  const text = decodeURIComponent(escape(atob(file.content)));
  return { data: JSON.parse(text), sha: file.sha };
}

async function writeComicsJson(data, sha, message) {
  const content = btoa(unescape(encodeURIComponent(JSON.stringify(data, null, 2))));
  return ghRequest("data/comics.json", { method: "PUT", body: JSON.stringify({ message, content, sha }) });
}

// ---------- вспомогательное ----------

function slugify(title) {
  const map = { а:"a",б:"b",в:"v",г:"g",д:"d",е:"e",ё:"e",ж:"zh",з:"z",и:"i",й:"y",к:"k",л:"l",м:"m",н:"n",о:"o",п:"p",р:"r",с:"s",т:"t",у:"u",ф:"f",х:"h",ц:"c",ч:"ch",ш:"sh",щ:"sch",ъ:"",ы:"y",ь:"",э:"e",ю:"yu",я:"ya" };
  const base = title.toLowerCase().split("").map(ch => map[ch] ?? ch).join("");
  return base.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || ("comic-" + Date.now());
}

function ext(filename) {
  const m = filename.match(/\.([a-zA-Z0-9]+)$/);
  return m ? m[1].toLowerCase() : "jpg";
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result.split(",")[1]);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

function comicPages(c) {
  return c.pages || Array.from({ length: c.pageCount }, (_, i) => `${c.pagesBase}${i + 1}.${c.pageExt}`);
}

function makeLogger(elId) {
  const el = document.getElementById(elId);
  return {
    clear: () => { el.innerHTML = ""; },
    line: (text, cls) => {
      const d = document.createElement("div");
      if (cls) d.className = cls;
      d.textContent = text;
      el.appendChild(d);
    },
  };
}

// ============ ВКЛАДКА 1: ЗАГРУЗКА ============

let files = [];
const dropzone = document.getElementById("dropzone");
const pagesInput = document.getElementById("pagesInput");
const pagelist = document.getElementById("pagelist");
const uploadLog = makeLogger("statusLog");

dropzone.addEventListener("click", () => pagesInput.click());
pagesInput.addEventListener("change", () => {
  files = files.concat(Array.from(pagesInput.files));
  pagesInput.value = "";
  renderPageList();
});

function renderPageList() {
  pagelist.innerHTML = files.map((f, i) => `
    <div class="pagerow" data-i="${i}">
      <img src="${URL.createObjectURL(f)}" alt="" />
      <span class="fname">${i + 1}. ${escapeHtml(f.name)}</span>
      <button data-act="up" title="Выше">↑</button>
      <button data-act="down" title="Ниже">↓</button>
      <button data-act="remove" title="Убрать">✕</button>
    </div>`).join("");

  pagelist.querySelectorAll("button").forEach(btn => {
    btn.addEventListener("click", () => {
      const i = Number(btn.closest(".pagerow").dataset.i);
      const act = btn.dataset.act;
      if (act === "remove") files.splice(i, 1);
      if (act === "up" && i > 0) [files[i - 1], files[i]] = [files[i], files[i - 1]];
      if (act === "down" && i < files.length - 1) [files[i + 1], files[i]] = [files[i], files[i + 1]];
      renderPageList();
    });
  });
}

document.getElementById("uploadBtn").addEventListener("click", async () => {
  const title = document.getElementById("titleInput").value.trim();
  const subtitle = document.getElementById("subInput").value.trim();

  if (!title) { alert("Впиши название выпуска"); return; }
  if (!files.length) { alert("Выбери хотя бы одну страницу"); return; }

  const btn = document.getElementById("uploadBtn");
  btn.disabled = true;
  uploadLog.clear();

  const slug = slugify(title);
  const author = getUserName() || "Аноним";
  const pagePaths = [];

  try {
    uploadLog.line(`Загружаю ${files.length} страниц...`);
    for (let i = 0; i < files.length; i++) {
      const path = `comics/${slug}/${i + 1}.${ext(files[i].name)}`;
      await ghPutFile(path, await fileToBase64(files[i]), `Страница ${i + 1} — ${title}`);
      pagePaths.push(path);
      uploadLog.line(`✓ ${i + 1} / ${files.length}`, "ok");
    }

    uploadLog.line("Обновляю список выпусков...");
    const { data, sha } = await readComicsJson();
    data.comics.push({
      slug, title, subtitle: subtitle || "", author,
      added: new Date().toISOString().slice(0, 10),
      cover: pagePaths[0], pageCount: pagePaths.length, pages: pagePaths,
    });
    await writeComicsJson(data, sha, `Новый выпуск: ${title}`);

    uploadLog.line("Готово! Выпуск опубликован 🎉", "ok");
    uploadLog.line("Сайт обновится через 1-2 минуты.");
    files = []; renderPageList();
    document.getElementById("titleInput").value = "";
    document.getElementById("subInput").value = "";
    loadComics();
  } catch (err) {
    console.error(err);
    uploadLog.line("Ошибка: " + err.message, "err");
    if (/401|403/.test(err.message)) uploadLog.line("Похоже, токен неверный или без прав записи.", "err");
  } finally {
    btn.disabled = false;
  }
});

// ============ ВКЛАДКА 2: УПРАВЛЕНИЕ КОМИКСАМИ ============

const manageLog = makeLogger("manageLog");
const comicListEl = document.getElementById("comicList");
const addPagesInput = document.getElementById("addPagesInput");
let addPagesTargetSlug = null;

async function loadComics() {
  comicListEl.innerHTML = `<p class="hint">Загружаю...</p>`;
  try {
    const { data } = await readComicsJson();
    fillModFilter(data.comics);
    if (!data.comics.length) {
      comicListEl.innerHTML = `<p class="hint">Пока ни одного выпуска.</p>`;
      return;
    }
    comicListEl.innerHTML = data.comics.map(c => {
      const pages = comicPages(c);
      return `
        <div class="item" data-slug="${escapeHtml(c.slug)}">
          <div class="row">
            <img src="${escapeHtml(c.cover)}" alt="" />
            <div class="info">
              <strong>${escapeHtml(c.title)}</strong>
              <span>${escapeHtml(c.subtitle || "")} · ${pages.length} стр. · ${escapeHtml(c.added || "")}</span>
            </div>
          </div>
          <div class="acts">
            <button class="mini" data-act="rename">Переименовать</button>
            <button class="mini" data-act="addpages">Добавить страницы</button>
            <button class="mini" data-act="togglepages">Страницы</button>
            <button class="mini danger" data-act="delete">Удалить выпуск</button>
          </div>
          <div class="pagegrid" style="display:none;">
            ${pages.map((p, i) => `
              <div class="pagecell">
                <img src="${escapeHtml(p)}" alt="" loading="lazy" />
                <span class="num">${i + 1}</span>
                <button class="del" data-page="${i}" title="Удалить страницу">✕</button>
              </div>`).join("")}
          </div>
        </div>`;
    }).join("");

    bindComicActions();
  } catch (err) {
    comicListEl.innerHTML = `<p class="hint">Не удалось загрузить: ${escapeHtml(err.message)}</p>`;
  }
}

function bindComicActions() {
  comicListEl.querySelectorAll(".item").forEach(item => {
    const slug = item.dataset.slug;

    item.querySelector('[data-act="togglepages"]').addEventListener("click", () => {
      const grid = item.querySelector(".pagegrid");
      grid.style.display = grid.style.display === "none" ? "grid" : "none";
    });

    item.querySelector('[data-act="rename"]').addEventListener("click", () => renameComic(slug));
    item.querySelector('[data-act="delete"]').addEventListener("click", () => deleteComic(slug));
    item.querySelector('[data-act="addpages"]').addEventListener("click", () => {
      addPagesTargetSlug = slug;
      addPagesInput.click();
    });

    item.querySelectorAll(".pagecell .del").forEach(btn => {
      btn.addEventListener("click", () => deletePage(slug, Number(btn.dataset.page)));
    });
  });
}

async function renameComic(slug) {
  try {
    const { data, sha } = await readComicsJson();
    const c = data.comics.find(x => x.slug === slug);
    if (!c) return;
    const newTitle = prompt("Новое название выпуска:", c.title);
    if (newTitle === null) return;
    const newSub = prompt("Подзаголовок (можно оставить пустым):", c.subtitle || "");
    if (newSub === null) return;
    c.title = newTitle.trim() || c.title;
    c.subtitle = newSub.trim();
    await writeComicsJson(data, sha, `Обновлён выпуск: ${c.title}`);
    manageLog.clear();
    manageLog.line("Название обновлено ✓", "ok");
    loadComics();
  } catch (err) { manageLog.line("Ошибка: " + err.message, "err"); }
}

async function deleteComic(slug) {
  if (!confirm("Удалить весь выпуск вместе со страницами? Отменить будет нельзя.")) return;
  manageLog.clear();
  try {
    const { data, sha } = await readComicsJson();
    const c = data.comics.find(x => x.slug === slug);
    if (!c) return;
    const pages = comicPages(c).filter(p => !/^https?:/i.test(p));

    manageLog.line(`Удаляю страницы (${pages.length})...`);
    for (const p of pages) {
      try { await ghDeleteFile(p, `Удалена страница ${p}`); }
      catch (e) { console.warn("не удалось удалить", p, e); }
    }

    data.comics = data.comics.filter(x => x.slug !== slug);
    await writeComicsJson(data, sha, `Удалён выпуск: ${c.title}`);
    manageLog.line("Выпуск удалён ✓", "ok");
    loadComics();
  } catch (err) { manageLog.line("Ошибка: " + err.message, "err"); }
}

async function deletePage(slug, index) {
  if (!confirm(`Удалить страницу ${index + 1}?`)) return;
  manageLog.clear();
  try {
    const { data, sha } = await readComicsJson();
    const c = data.comics.find(x => x.slug === slug);
    if (!c) return;
    const pages = comicPages(c);
    const target = pages[index];

    if (!/^https?:/i.test(target)) {
      try { await ghDeleteFile(target, `Удалена страница ${index + 1} — ${c.title}`); }
      catch (e) { console.warn(e); }
    }

    pages.splice(index, 1);
    c.pages = pages;
    c.pageCount = pages.length;
    if (pages.length) c.cover = pages[0];
    delete c.pagesBase; delete c.pagesFullBase; delete c.pageExt;

    await writeComicsJson(data, sha, `Страница удалена — ${c.title}`);
    manageLog.line("Страница удалена ✓", "ok");
    loadComics();
  } catch (err) { manageLog.line("Ошибка: " + err.message, "err"); }
}

addPagesInput.addEventListener("change", async () => {
  const newFiles = Array.from(addPagesInput.files);
  addPagesInput.value = "";
  if (!newFiles.length || !addPagesTargetSlug) return;

  manageLog.clear();
  const slug = addPagesTargetSlug;
  try {
    const { data, sha } = await readComicsJson();
    const c = data.comics.find(x => x.slug === slug);
    if (!c) return;
    const pages = comicPages(c);

    manageLog.line(`Догружаю ${newFiles.length} страниц...`);
    let n = pages.length;
    for (const f of newFiles) {
      n += 1;
      const path = `comics/${slug}/${n}.${ext(f.name)}`;
      await ghPutFile(path, await fileToBase64(f), `Страница ${n} — ${c.title}`);
      pages.push(path);
      manageLog.line(`✓ страница ${n}`, "ok");
    }

    c.pages = pages;
    c.pageCount = pages.length;
    if (!c.cover) c.cover = pages[0];
    delete c.pagesBase; delete c.pagesFullBase; delete c.pageExt;

    await writeComicsJson(data, sha, `Добавлены страницы — ${c.title}`);
    manageLog.line("Готово ✓", "ok");
    loadComics();
  } catch (err) { manageLog.line("Ошибка: " + err.message, "err"); }
});

// ============ ВКЛАДКА 3: МОДЕРАЦИЯ ============

const modLog = makeLogger("modLog");
const modListEl = document.getElementById("modList");
const modFilter = document.getElementById("modFilter");
let comicTitles = {};

function fillModFilter(comics) {
  comicTitles = { general: "Болталка" };
  comics.forEach(c => { comicTitles[c.slug] = c.title; });
  const current = modFilter.value;
  modFilter.innerHTML = `<option value="">Все обсуждения</option>
    <option value="general">Болталка</option>` +
    comics.map(c => `<option value="${escapeHtml(c.slug)}">${escapeHtml(c.title)}</option>`).join("");
  modFilter.value = current;
}

modFilter.addEventListener("change", loadModeration);
document.getElementById("modRefresh").addEventListener("click", loadModeration);

async function loadModeration() {
  const sb = getSupabase();
  if (!sb) { modListEl.innerHTML = `<p class="hint">База данных не подключена.</p>`; return; }

  modListEl.innerHTML = `<p class="hint">Загружаю...</p>`;
  let q = sb.from("comments").select("*").order("created_at", { ascending: false }).limit(200);
  if (modFilter.value) q = q.eq("comic_slug", modFilter.value);

  const { data, error } = await q;
  if (error) { modListEl.innerHTML = `<p class="hint">Ошибка: ${escapeHtml(error.message)}</p>`; return; }
  if (!data.length) { modListEl.innerHTML = `<p class="hint">Сообщений нет.</p>`; return; }

  modListEl.innerHTML = data.map(m => `
    <div class="mod-msg" data-id="${m.id}">
      <div class="top">
        <span class="who">${escapeHtml(m.author)}</span>
        <span class="when">${timeAgo(m.created_at)}</span>
      </div>
      <div class="body">${escapeHtml(m.text)}</div>
      <div class="where">${escapeHtml(comicTitles[m.comic_slug] || m.comic_slug)}${m.parent_id ? " · ответ" : ""}</div>
      <button class="del-btn">Удалить сообщение</button>
    </div>`).join("");

  modListEl.querySelectorAll(".mod-msg").forEach(el => {
    el.querySelector(".del-btn").addEventListener("click", async () => {
      if (!confirm("Удалить это сообщение?")) return;
      const id = el.dataset.id;
      const { error } = await sb.from("comments").delete().eq("id", id);
      modLog.clear();
      if (error) { modLog.line("Не удалось удалить: " + error.message, "err"); return; }
      el.remove();
      modLog.line("Сообщение удалено ✓", "ok");
    });
  });
}
