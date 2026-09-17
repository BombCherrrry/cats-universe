// Ветка обсуждений для одного "канала" (comic_slug; для общего чата — "general").
// Таблица comments: id, comic_slug, parent_id, author (имя), text, created_at

async function initThread(slug, opts) {
  opts = opts || {};
  const listEl = document.getElementById("threadList");
  const composerEl = document.getElementById("composer");
  if (!listEl || !composerEl) return;

  const sb = getSupabase();
  if (!sb) return;

  composerEl.innerHTML = `
    <textarea id="threadInput" placeholder="${opts.placeholder || 'Написать...'}"></textarea>
    <button id="threadSend">Отправить</button>`;

  async function loadAll() {
    const { data, error } = await sb
      .from("comments")
      .select("*")
      .eq("comic_slug", slug)
      .order("created_at", { ascending: true });
    if (error) { console.error(error); listEl.innerHTML = `<p class="empty-thread">Не получилось загрузить обсуждение.</p>`; return; }
    render(data);
  }

  function render(rows) {
    if (!rows.length) {
      listEl.innerHTML = `<p class="empty-thread">${opts.emptyText || 'Пока тихо. Будь первым, кто что-то напишет.'}</p>`;
      return;
    }
    const top = rows.filter(r => !r.parent_id);
    const byParent = {};
    rows.filter(r => r.parent_id).forEach(r => {
      (byParent[r.parent_id] = byParent[r.parent_id] || []).push(r);
    });

    listEl.innerHTML = top.map(c => renderComment(c, byParent[c.id] || [])).join("");

    listEl.querySelectorAll(".reply-link").forEach(btn => {
      btn.addEventListener("click", () => openReplyBox(btn.dataset.id));
    });
  }

  function renderComment(c, replies) {
    return `
      <div class="comment" data-id="${c.id}">
        <div class="avatar">${escapeHtml(initials(c.author))}</div>
        <div class="body">
          <div class="row1">
            <span class="name">${escapeHtml(c.author)}</span>
            <span class="time">${timeAgo(c.created_at)}</span>
          </div>
          <div class="text">${escapeHtml(c.text)}</div>
          ${opts.allowReplies !== false ? `<button class="reply-link" data-id="${c.id}">Ответить</button>` : ""}
          <div class="reply-slot" id="replySlot_${c.id}"></div>
          ${replies.length ? `<div class="replies">${replies.map(r => renderComment(r, [])).join("")}</div>` : ""}
        </div>
      </div>`;
  }

  function openReplyBox(parentId) {
    const slot = document.getElementById("replySlot_" + parentId);
    if (!slot || slot.dataset.open) return;
    slot.dataset.open = "1";
    slot.style.marginTop = "10px";
    slot.innerHTML = `
      <div class="composer" style="margin-bottom:10px;">
        <textarea placeholder="Ответить..." style="min-height:40px;"></textarea>
        <button>Ответить</button>
      </div>`;
    const ta = slot.querySelector("textarea");
    const btn = slot.querySelector("button");
    btn.addEventListener("click", async () => {
      await send(ta.value, parentId);
      slot.innerHTML = "";
      delete slot.dataset.open;
    });
  }

  async function send(text, parentId) {
    text = (text || "").trim();
    if (!text) return;
    const name = getUserName();
    if (!name) { ensureName((n) => doSend(text, parentId, n)); return; }
    await doSend(text, parentId, name);
  }

  async function doSend(text, parentId, name) {
    const btn = document.getElementById("threadSend");
    if (btn) btn.disabled = true;
    const { error } = await sb.from("comments").insert({
      comic_slug: slug,
      parent_id: parentId || null,
      author: name,
      text,
    });
    if (error) console.error(error);
    if (btn) btn.disabled = false;
    const input = document.getElementById("threadInput");
    if (input && !parentId) input.value = "";
    await loadAll();
  }

  document.getElementById("threadSend").addEventListener("click", () => {
    send(document.getElementById("threadInput").value, null);
  });

  await loadAll();

  sb.channel("comments_" + slug)
    .on("postgres_changes", { event: "*", schema: "public", table: "comments", filter: `comic_slug=eq.${slug}` }, loadAll)
    .subscribe();
}
