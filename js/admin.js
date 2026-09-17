// Загрузка нового комикса прямо с сайта через GitHub Contents API.
// Токен хранится только в localStorage этого браузера.

const TOKEN_KEY = "cu_gh_token";
const owner = location.hostname.split(".")[0];
const repo = location.pathname.split("/").filter(Boolean)[0] || "cats-universe";

document.getElementById("repoNameHint").textContent = `${owner}/${repo}`;

renderWho();

const gateView = document.getElementById("gateView");
const formView = document.getElementById("formView");

function getToken() { return localStorage.getItem(TOKEN_KEY) || ""; }

function showGate() {
  gateView.style.display = "block";
  formView.style.display = "none";
}
function showForm() {
  gateView.style.display = "none";
  formView.style.display = "block";
}

if (getToken()) showForm(); else showGate();

document.getElementById("saveTokenBtn").addEventListener("click", () => {
  const t = document.getElementById("tokenInput").value.trim();
  if (!t) return;
  localStorage.setItem(TOKEN_KEY, t);
  showForm();
});

document.getElementById("logoutLink").addEventListener("click", (e) => {
  e.preventDefault();
  localStorage.removeItem(TOKEN_KEY);
  showGate();
});

// ---- выбор и порядок страниц ----

let files = [];
const dropzone = document.getElementById("dropzone");
const pagesInput = document.getElementById("pagesInput");
const pagelist = document.getElementById("pagelist");

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

// ---- транслитерация для slug ----

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

// ---- GitHub API ----

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
  try {
    const existing = await ghRequest(path);
    sha = existing.sha;
  } catch (e) { /* файла ещё нет — создаём новый */ }

  return ghRequest(path, {
    method: "PUT",
    body: JSON.stringify({ message, content: base64Content, sha }),
  });
}

// ---- логирование в UI ----

const logEl = document.getElementById("statusLog");
function log(text, cls) {
  const line = document.createElement("div");
  if (cls) line.className = cls;
  line.textContent = text;
  logEl.appendChild(line);
}

// ---- основной сценарий загрузки ----

document.getElementById("uploadBtn").addEventListener("click", async () => {
  const title = document.getElementById("titleInput").value.trim();
  const subtitle = document.getElementById("subInput").value.trim();

  if (!title) { alert("Впиши название выпуска"); return; }
  if (!files.length) { alert("Выбери хотя бы одну страницу"); return; }

  const btn = document.getElementById("uploadBtn");
  btn.disabled = true;
  logEl.innerHTML = "";

  const slug = slugify(title);
  const author = getUserName() || "Аноним";
  const pagePaths = [];

  try {
    log(`Загружаю ${files.length} страниц в comics/${slug}/ ...`);
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const e = ext(f.name);
      const path = `comics/${slug}/${i + 1}.${e}`;
      const b64 = await fileToBase64(f);
      await ghPutFile(path, b64, `Добавлена страница ${i + 1} — ${title}`);
      pagePaths.push(path);
      log(`✓ страница ${i + 1}/${files.length}`, "ok");
    }

    log("Обновляю список комиксов...");
    const current = await ghRequest("data/comics.json");
    const currentText = decodeURIComponent(escape(atob(current.content)));
    const data = JSON.parse(currentText);

    data.comics.push({
      slug,
      title,
      subtitle: subtitle || "",
      author,
      added: new Date().toISOString().slice(0, 10),
      cover: pagePaths[0],
      pageCount: pagePaths.length,
      pages: pagePaths,
    });

    const newContent = btoa(unescape(encodeURIComponent(JSON.stringify(data, null, 2))));
    await ghRequest("data/comics.json", {
      method: "PUT",
      body: JSON.stringify({
        message: `Новый выпуск: ${title}`,
        content: newContent,
        sha: current.sha,
      }),
    });

    log("Готово! Выпуск опубликован 🎉", "ok");
    log("Сайт обновится через 1-2 минуты.");
    files = [];
    renderPageList();
    document.getElementById("titleInput").value = "";
    document.getElementById("subInput").value = "";
  } catch (err) {
    console.error(err);
    log("Ошибка: " + err.message, "err");
    if (String(err.message).includes("401") || String(err.message).includes("403")) {
      log("Похоже, токен неверный или без прав записи — попробуй выйти и вставить новый.", "err");
    }
  } finally {
    btn.disabled = false;
  }
});
