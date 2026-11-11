// Frontend Media Downloader — vanilla JS, tanpa framework.
const $ = (s) => document.querySelector(s);

const tabUnduh = $("#tab-unduh");
const tabRiwayat = $("#tab-riwayat");
const paneUnduh = $("#pane-unduh");
const paneRiwayat = $("#pane-riwayat");
const urlsInput = $("#urls");
const btnResolve = $("#btn-resolve");
const statusLine = $("#status-line");
const resultsEl = $("#results");
const historyList = $("#history-list");

function switchTab(which) {
  const toRiwayat = which === "riwayat";
  tabUnduh.classList.toggle("active", !toRiwayat);
  tabRiwayat.classList.toggle("active", toRiwayat);
  tabUnduh.setAttribute("aria-selected", String(!toRiwayat));
  tabRiwayat.setAttribute("aria-selected", String(toRiwayat));
  paneUnduh.classList.toggle("hidden", toRiwayat);
  paneRiwayat.classList.toggle("hidden", !toRiwayat);
  if (toRiwayat) loadHistory();
}
tabUnduh.addEventListener("click", () => switchTab("unduh"));
tabRiwayat.addEventListener("click", () => switchTab("riwayat"));

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function downloadLinks(downloads) {
  if (!downloads || !downloads.length) return "";
  return `<div class="dl-list">${downloads
    .map(
      (d, i) =>
        `<a class="dl ${i === 0 ? "dl-first" : "dl-rest"}" href="${esc(d.url)}" target="_blank" rel="noopener">${esc(d.label || "Download")}</a>`
    )
    .join("")}</div>`;
}

function playlistLinks(items) {
  if (!items || !items.length) return "";
  return `<div class="dl-list">${items
    .map(
      (it) =>
        `<a class="dl dl-item" href="${esc(it.url)}" target="_blank" rel="noopener">${esc(it.title || "Buka video")}</a>`
    )
    .join("")}</div>`;
}

function resultCard(r, state) {
  // state: "wait" | "ok" | "fail"
  const thumb = r.thumbnail
    ? `<img class="thumb" src="${esc(r.thumbnail)}" alt="" loading="lazy" onerror="this.style.display='none'">`
    : "";
  let statusHtml = "";
  if (state === "wait") statusHtml = `<p class="status wait">Memproses…</p>`;
  if (state === "ok")
    statusHtml = `<p class="status ok">Selesai — ${r.downloads && r.downloads.length ? r.downloads.length + " link download" : "tidak ada file langsung"}.</p>`;
  if (state === "fail")
    statusHtml = `<p class="status fail">Gagal.</p><p class="err">${esc(r.error || "Tidak diketahui")}</p>`;

  const note = r.note ? `<p class="note">${esc(r.note)}</p>` : "";
  const dls = state === "ok" ? downloadLinks(r.downloads) + playlistLinks(r.items) : "";
  return `<article class="card">
    <div class="card-top">${thumb}
      <div>
        <p class="card-title">${esc(r.title || r.url)}</p>
        <p class="card-url">${esc(r.url)}</p>
      </div>
    </div>
    ${statusHtml}${note}${dls}
  </article>`;
}

async function doResolve() {
  const urls = urlsInput.value.split("\n").map((u) => u.trim()).filter(Boolean);
  if (!urls.length) {
    statusLine.textContent = "Tempel dulu minimal satu link.";
    return;
  }
  btnResolve.disabled = true;
  statusLine.textContent = `Memproses ${urls.length} link…`;
  // Kartu status jujur per item: langsung tampil "Memproses", diisi setelah respons.
  resultsEl.innerHTML = urls
    .map((u) => resultCard({ url: u, title: u }, "wait"))
    .join("");

  try {
    const res = await fetch("/api/resolve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ urls }),
    });
    const data = await res.json();
    if (!res.ok) {
      statusLine.textContent = data.error || "Terjadi kesalahan server.";
      resultsEl.innerHTML = "";
      return;
    }
    const done = data.results.filter((r) => r.ok).length;
    const failed = data.results.length - done;
    statusLine.textContent =
      `Selesai: ${done} berhasil` + (failed ? `, ${failed} gagal` : "") + ". Hasil yang berhasil sudah tersimpan di Riwayat.";
    resultsEl.innerHTML = data.results
      .map((r) => resultCard(r, r.ok ? "ok" : "fail"))
      .join("");
  } catch (e) {
    statusLine.textContent = "Tidak bisa menghubungi server. Coba lagi sebentar lagi.";
    resultsEl.innerHTML = "";
  } finally {
    btnResolve.disabled = false;
  }
}
btnResolve.addEventListener("click", doResolve);

function historyCard(item) {
  const thumb = item.thumbnail
    ? `<img class="thumb" src="${esc(item.thumbnail)}" alt="" loading="lazy" onerror="this.style.display='none'">`
    : "";
  const date = item.createdAt
    ? new Date(item.createdAt).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
    : "";
  const note = item.note ? `<p class="note">${esc(item.note)}</p>` : "";
  return `<article class="card" data-id="${esc(item.id)}">
    <div class="card-top">${thumb}
      <div>
        <p class="card-title">${esc(item.title || item.url)}</p>
        <p class="card-url">${esc(item.url)}</p>
      </div>
    </div>
    ${note}
    ${downloadLinks(item.downloads)}${playlistLinks(item.items)}
    <p class="meta">${esc(date)}</p>
    <div class="card-actions">
      <button class="btn-outline btn-small" data-act="retry">Coba Lagi</button>
      <button class="btn-outline btn-small" data-act="del">Hapus</button>
    </div>
  </article>`;
}

async function loadHistory() {
  historyList.innerHTML = `<p class="empty">Memuat riwayat…</p>`;
  try {
    const res = await fetch("/api/history");
    const data = await res.json();
    const items = data.items || [];
    if (!items.length) {
      historyList.innerHTML = `<p class="empty">Belum ada riwayat. Hasil resolve yang berhasil akan muncul di sini.</p>`;
      return;
    }
    historyList.innerHTML = items.map(historyCard).join("");
  } catch {
    historyList.innerHTML = `<p class="empty">Tidak bisa memuat riwayat.</p>`;
  }
}

historyList.addEventListener("click", async (ev) => {
  const btn = ev.target.closest("button[data-act]");
  if (!btn) return;
  const card = ev.target.closest(".card[data-id]");
  const id = card && card.dataset.id;
  if (!id) return;
  if (btn.dataset.act === "del") {
    await fetch(`/api/history/${encodeURIComponent(id)}`, { method: "DELETE" });
    loadHistory();
  }
  if (btn.dataset.act === "retry") {
    btn.disabled = true;
    btn.textContent = "Memproses…";
    const res = await fetch(`/api/history/${encodeURIComponent(id)}/retry`, { method: "POST" });
    const data = await res.json();
    if (!res.ok) {
      btn.disabled = false;
      btn.textContent = "Coba Lagi";
      alert("Gagal resolve ulang: " + (data.error || "tidak diketahui"));
      return;
    }
    switchTab("riwayat"); // muat ulang daftar
  }
});

$("#btn-clear").addEventListener("click", async () => {
  if (!confirm("Hapus semua riwayat?")) return;
  await fetch("/api/history", { method: "DELETE" });
  loadHistory();
});
