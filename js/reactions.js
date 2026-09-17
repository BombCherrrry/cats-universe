// Блок реакций для одного комикса (comic_slug).
// Таблица reactions: id, comic_slug, emoji, author, created_at
// уникальность (comic_slug, emoji, author) — повторный клик снимает реакцию.

async function initReactions(slug) {
  const box = document.getElementById("reactions");
  if (!box) return;
  const sb = getSupabase();
  if (!sb) { box.remove(); return; }

  box.innerHTML = window.REACTIONS.map(e =>
    `<button class="reaction-btn" data-emoji="${e}"><span class="e">${e}</span><span class="n">0</span></button>`
  ).join("");

  const userId = getUserId();

  async function loadCounts() {
    const { data, error } = await sb
      .from("reactions")
      .select("emoji, author")
      .eq("comic_slug", slug);
    if (error) { console.error(error); return; }

    const counts = {};
    const mine = new Set();
    for (const row of data) {
      counts[row.emoji] = (counts[row.emoji] || 0) + 1;
      if (row.author === userId) mine.add(row.emoji);
    }
    box.querySelectorAll(".reaction-btn").forEach(btn => {
      const e = btn.dataset.emoji;
      btn.querySelector(".n").textContent = counts[e] || 0;
      btn.classList.toggle("mine", mine.has(e));
    });
  }

  box.querySelectorAll(".reaction-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      const name = getUserName();
      if (!name) { ensureName(() => toggle(btn)); return; }
      toggle(btn);
    });
  });

  async function toggle(btn) {
    const emoji = btn.dataset.emoji;
    btn.disabled = true;
    const isMine = btn.classList.contains("mine");
    if (isMine) {
      await sb.from("reactions").delete()
        .eq("comic_slug", slug).eq("emoji", emoji).eq("author", userId);
    } else {
      await sb.from("reactions").insert({ comic_slug: slug, emoji, author: userId });
    }
    await loadCounts();
    btn.disabled = false;
  }

  loadCounts();

  sb.channel("reactions_" + slug)
    .on("postgres_changes", { event: "*", schema: "public", table: "reactions", filter: `comic_slug=eq.${slug}` }, loadCounts)
    .subscribe();
}
