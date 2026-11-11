// Frontend Media Downloader — vanilla JS, tanpa framework.
// Riwayat PER-PERANGKAT: disimpan di localStorage browser ini saja
// (key "md-history-v1"), tidak dikirim ke atau disimpan di server.
// Jadi riwayat hanya terlihat di perangkat ini, bukan oleh pengunjung lain.
const $ = (s) => document.querySelector(s);

const HISTORY_KEY = "md-history-v1";
const HISTORY_MAX = 200;

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

function newId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// --- Riwayat lokal (localStorage) ---
function loadLocalHistory() {
  try {
    const arr = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function saveLocalHistory(items) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(items.slice(0, HISTORY_MAX)));
  } catch {
    // localStorage penuh / tidak tersedia — abaikan, resolve tetap jalan.
  }
}

// Simpan hasil resolve yang sukses ke riwayat perangkat ini,
// langsung saat hasil diterima (history-first per perangkat).
function addToLocalHistory(results) {
  const fresh = results
    .filter((r) => r.ok)
    .map((r) => ({
      id: newId(),
      url: r.url,
      title: r.title,
      thumbnail: r.thumbnail,
      type: r.type,
      downloads: r.downloads,
      items: r.items || null,
      note: r.note || null,
      createdAt: new Date().toISOString(),
    }));
  if (!fresh.length) return;
  const urls = new Set(fresh.map((i) => i.url));
  const kept = loadLocalHistory().filter((i) => !urls.has(i.url));
  saveLocalHistory([...fresh, ...kept]);
}

function removeFromLocalHistory(id) {
  saveLocalHistory(loadLocalHistory().filter((i) => i.id !== id));
}

function updateLocalHistory(id, patch) {
  const items = loadLocalHistory();
  const idx = items.findIndex((i) => i.id === id);
  if (idx === -1) return null;
  items[idx] = { ...items[idx], ...patch };
  saveLocalHistory(items);
  return items[idx];
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
      `Selesai: ${done} berhasil` + (failed ? `, ${failed} gagal` : "") + ". Hasil yang berhasil sudah tersimpan di Riwayat perangkat ini.";
    addToLocalHistory(data.results);
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

function loadHistory() {
  const items = loadLocalHistory();
  if (!items.length) {
    historyList.innerHTML = `<p class="empty">Belum ada riwayat di perangkat ini. Hasil resolve yang berhasil akan muncul di sini.</p>`;
    return;
  }
  historyList.innerHTML = items.map(historyCard).join("");
}

historyList.addEventListener("click", async (ev) => {
  const btn = ev.target.closest("button[data-act]");
  if (!btn) return;
  const card = ev.target.closest(".card[data-id]");
  const id = card && card.dataset.id;
  if (!id) return;
  if (btn.dataset.act === "del") {
    removeFromLocalHistory(id);
    loadHistory();
  }
  if (btn.dataset.act === "retry") {
    const item = loadLocalHistory().find((i) => i.id === id);
    if (!item) return;
    btn.disabled = true;
    btn.textContent = "Memproses…";
    try {
      const res = await fetch("/api/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls: [item.url] }),
      });
      const data = await res.json();
      const r = data.results && data.results[0];
      if (!res.ok || !r || !r.ok) {
        throw new Error((r && r.error) || data.error || "tidak diketahui");
      }
      updateLocalHistory(id, {
        title: r.title,
        thumbnail: r.thumbnail,
        type: r.type,
        downloads: r.downloads,
        items: r.items || null,
        note: r.note || null,
      });
      loadHistory();
    } catch (e) {
      btn.disabled = false;
      btn.textContent = "Coba Lagi";
      alert("Gagal resolve ulang: " + (e.message || "tidak diketahui"));
    }
  }
});

$("#btn-clear").addEventListener("click", () => {
  if (!confirm("Hapus semua riwayat di perangkat ini?")) return;
  saveLocalHistory([]);
  loadHistory();
});
