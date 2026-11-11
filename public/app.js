// Frontend Media Downloader — vanilla JS, tanpa framework.
// Desain: "Villain Kalem Arang" (struktur Stiker).
// Riwayat PER-PERANGKAT: localStorage key "md-history-v1", maks 200 item,
// dedupe per URL, terbaru dulu. Tidak dikirim/disimpan di server.
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

const HISTORY_KEY = "md-history-v1";
const HISTORY_MAX = 200;
const MAX_URLS = 20;

// --- Elemen ---
const tabUnduh = $("#tab-unduh");
const tabRiwayat = $("#tab-riwayat");
const paneUnduh = $("#pane-unduh");
const paneRiwayat = $("#pane-riwayat");
const urlsInput = $("#urls");
const btnResolve = $("#btn-resolve");
const statusLine = $("#status-line");
const resultsEl = $("#results");
const histSearch = $("#hist-search");
const historyList = $("#history-list");
const btnClear = $("#btn-clear");

// Modal (popup hasil)
const modalBackdrop = $("#modal-backdrop");
const modalVideoWrap = $("#modal-video-wrap");
const modalVideo = $("#modal-video");
const modalThumbFallback = $("#modal-thumb-fallback");
const modalBadge = $("#modal-badge");
const modalTitle = $("#modal-title");
const modalUrl = $("#modal-url");
const modalNote = $("#modal-note");
const modalDls = $("#modal-dls");
const modalItems = $("#modal-items");
const modalError = $("#modal-error");
const modalOpentab = $("#modal-opentab");
const modalOpentabLink = $("#modal-opentab-link");

let lastResults = []; // hasil resolve terakhir (klik kartu -> popup)
let resolving = false;
let histQuery = "";
let histFilter = "Semua";
let modalOpen = false;
let modalVideoUrls = []; // URL video untuk preview, dicoba satu per satu
let modalVideoIdx = 0;

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function newId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

function platformOf(url) {
  const h = hostOf(url);
  if (h.includes("tiktok.com")) return "TikTok";
  if (h.includes("instagram.com")) return "Instagram";
  if (h.includes("youtube.com") || h === "youtu.be" || h.endsWith(".youtu.be")) return "YouTube";
  return "Lainnya";
}

// --- Tab ---
function switchTab(which) {
  const toRiwayat = which === "riwayat";
  tabUnduh.classList.toggle("active", !toRiwayat);
  tabRiwayat.classList.toggle("active", toRiwayat);
  tabUnduh.setAttribute("aria-selected", String(!toRiwayat));
  tabRiwayat.setAttribute("aria-selected", String(toRiwayat));
  paneUnduh.classList.toggle("hidden", toRiwayat);
  paneRiwayat.classList.toggle("hidden", !toRiwayat);
  if (toRiwayat) renderHistory();
}
tabUnduh.addEventListener("click", () => switchTab("unduh"));
tabRiwayat.addEventListener("click", () => switchTab("riwayat"));

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

// --- Popup hasil (modal) ---
function playVideoAt(i) {
  if (i >= modalVideoUrls.length) {
    showVideoFallback();
    return;
  }
  modalVideoIdx = i;
  modalVideoWrap.classList.remove("hidden");
  modalThumbFallback.classList.add("hidden");
  modalThumbFallback.innerHTML = "";
  modalVideo.src = modalVideoUrls[i];
  modalVideo.load();
}

function showVideoFallback() {
  // Tidak ada URL video yang bisa diputar inline: tampilkan thumbnail + catatan.
  modalVideo.pause();
  modalVideo.removeAttribute("src");
  modalVideo.load();
  modalVideoWrap.classList.add("hidden");
  const thumb = modalVideo.getAttribute("poster");
  modalThumbFallback.classList.remove("hidden");
  modalThumbFallback.innerHTML =
    (thumb
      ? `<img src="${esc(thumb)}" alt="" onerror="this.style.display='none'">`
      : `<div class="thumb-ph">Preview tidak tersedia</div>`) +
    `<p class="note">Preview tidak bisa diputar di sini — pakai tombol download di bawah atau buka video di tab baru.</p>`;
}

function openModal(r) {
  // r: hasil resolve {url, ok, title, thumbnail, type, downloads, items, note, error}
  // atau item riwayat (diperlakukan ok:true).
  const ok = r.ok !== false;

  modalBadge.textContent = platformOf(r.url);
  modalTitle.textContent = r.title || r.url;
  modalUrl.textContent = r.url;

  // Reset video + isi lama
  modalVideo.pause();
  modalVideo.removeAttribute("src");
  modalVideo.load();
  modalVideoWrap.classList.add("hidden");
  modalThumbFallback.classList.add("hidden");
  modalThumbFallback.innerHTML = "";
  modalError.classList.add("hidden");
  modalError.textContent = "";
  modalDls.innerHTML = "";
  modalItems.innerHTML = "";
  modalNote.classList.add("hidden");
  modalNote.textContent = "";
  modalOpentab.classList.add("hidden");

  if (ok) {
    // Preview: coba tiap URL video satu per satu. URL dari layanan
    // downloader (rapidcdn/snaptik/tiktokio) sering merespons
    // Content-Disposition: attachment sehingga <video> tidak bisa
    // memutarnya inline — kalau tidak ada yang bisa diputar, tampilkan
    // thumbnail + tautan "Buka video di tab baru".
    modalVideoUrls = (r.downloads || [])
      .filter((d) => (d.type || "").toLowerCase() === "video" && d.url)
      .map((d) => d.url);
    modalVideoIdx = 0;
    if (modalVideoUrls.length) {
      if (r.thumbnail) modalVideo.setAttribute("poster", r.thumbnail);
      else modalVideo.removeAttribute("poster");
      modalOpentabLink.href = modalVideoUrls[0];
      modalOpentab.classList.remove("hidden");
      playVideoAt(0);
    } else if (r.thumbnail) {
      // Tidak ada file video langsung (mis. playlist / audio saja): tampilkan thumbnail.
      modalThumbFallback.classList.remove("hidden");
      modalThumbFallback.innerHTML = `<img src="${esc(r.thumbnail)}" alt="" onerror="this.style.display='none'">`;
    }
    if (r.downloads && r.downloads.length) {
      modalDls.innerHTML = r.downloads
        .map(
          (d) =>
            `<a class="res-row" href="${esc(d.url)}" target="_blank" rel="noopener">${esc(d.label || "Download")}</a>`
        )
        .join("");
    }
    if (r.items && r.items.length) {
      modalItems.innerHTML =
        `<p class="lbl">Isi playlist</p>` +
        r.items
          .map(
            (it) =>
              `<a class="res-row" href="${esc(it.url)}" target="_blank" rel="noopener">${esc(it.title || it.url)}</a>`
          )
          .join("");
    }
    if (r.note) {
      modalNote.textContent = r.note;
      modalNote.classList.remove("hidden");
    }
  } else {
    modalError.textContent = r.error || "Gagal — tidak diketahui.";
    modalError.classList.remove("hidden");
  }

  modalBackdrop.classList.remove("hidden");
  document.body.style.overflow = "hidden";
  modalOpen = true;
}

function closeModal() {
  if (!modalOpen) return;
  modalVideo.pause();
  modalBackdrop.classList.add("hidden");
  document.body.style.overflow = "";
  modalOpen = false;
}

modalVideo.addEventListener("error", () => {
  // URL video ini tidak bisa diputar inline: coba URL video berikutnya.
  if (!modalOpen) return;
  playVideoAt(modalVideoIdx + 1);
});

$("#modal-close").addEventListener("click", closeModal);
$("#modal-close-btn").addEventListener("click", closeModal);
modalBackdrop.addEventListener("click", (ev) => {
  if (ev.target === modalBackdrop) closeModal();
});
document.addEventListener("keydown", (ev) => {
  if (ev.key === "Escape") closeModal();
});

// --- Resolve (tab Unduh) ---
function resultCard(r, state, idx) {
  // state: "wait" | "ok" | "fail"
  const thumb = r.thumbnail
    ? `<img class="thumb" src="${esc(r.thumbnail)}" alt="" loading="lazy" onerror="this.style.display='none'">`
    : `<div class="thumb-ph">${esc(platformOf(r.url))}</div>`;
  let statusHtml = "";
  if (state === "wait") statusHtml = `<p class="status wait">Memproses…</p>`;
  if (state === "ok")
    statusHtml = `<p class="status ok">Selesai — ${
      r.downloads && r.downloads.length
        ? r.downloads.length + " link download"
        : "tidak ada file langsung"
    }. Ketuk kartu untuk melihat hasil.</p>`;
  if (state === "fail")
    statusHtml = `<p class="status fail">Gagal. Ketuk kartu untuk melihat alasannya.</p><p class="err">${esc(
      r.error || "Tidak diketahui"
    )}</p><div class="card-actions"><button class="btn-outline btn-small" data-act="retry" type="button">Coba lagi</button></div>`;

  const note = r.note ? `<p class="note">${esc(r.note)}</p>` : "";
  return `<article class="card" data-idx="${idx}" tabindex="0" role="button" aria-label="Lihat hasil ${esc(
    r.title || r.url
  )}">
    <div class="card-top">${thumb}
      <div>
        <p class="card-title">${esc(r.title || r.url)}</p>
        <p class="card-url">${esc(r.url)}</p>
      </div>
    </div>
    ${statusHtml}${note}
  </article>`;
}

async function doResolve() {
  const urls = urlsInput.value.split("\n").map((u) => u.trim()).filter(Boolean);
  if (!urls.length) {
    statusLine.textContent = "Tempel dulu minimal satu link.";
    return;
  }
  const batch = urls.slice(0, MAX_URLS);
  const trimmed = urls.length > MAX_URLS;
  btnResolve.disabled = true;
  resolving = true;
  statusLine.textContent =
    `Memproses ${batch.length} link…` +
    (trimmed ? ` (maksimal ${MAX_URLS} link, sisanya tidak diproses)` : "");
  lastResults = [];
  // Kartu status jujur per item: langsung tampil "Memproses", diisi setelah respons.
  resultsEl.innerHTML = batch.map((u, i) => resultCard({ url: u, title: u }, "wait", i)).join("");

  try {
    const res = await fetch("/api/resolve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ urls: batch }),
    });
    const data = await res.json();
    if (!res.ok) {
      statusLine.textContent = data.error || "Terjadi kesalahan server.";
      resultsEl.innerHTML = "";
      return;
    }
    lastResults = data.results || [];
    const done = lastResults.filter((r) => r.ok).length;
    const failed = lastResults.length - done;
    statusLine.textContent =
      `Selesai: ${done} berhasil` +
      (failed ? `, ${failed} gagal` : "") +
      ". Hasil yang berhasil sudah tersimpan di Riwayat perangkat ini.";
    addToLocalHistory(lastResults);
    resultsEl.innerHTML = lastResults.map((r, i) => resultCard(r, r.ok ? "ok" : "fail", i)).join("");
    const firstOk = lastResults.find((r) => r.ok);
    if (firstOk) openModal(firstOk);
  } catch (e) {
    statusLine.textContent = "Tidak bisa menghubungi server. Coba lagi sebentar lagi.";
    resultsEl.innerHTML = "";
  } finally {
    btnResolve.disabled = false;
    resolving = false;
  }
}
btnResolve.addEventListener("click", doResolve);

// Ketuk kartu hasil -> popup (abaikan selama masih memproses).
resultsEl.addEventListener("click", (ev) => {
  if (resolving) return;
  const retryBtn = ev.target.closest("button[data-act='retry']");
  if (retryBtn) {
    const card = ev.target.closest(".card[data-idx]");
    if (card) retryResolve(Number(card.dataset.idx), retryBtn);
    return;
  }
  const card = ev.target.closest(".card[data-idx]");
  if (!card) return;
  const r = lastResults[Number(card.dataset.idx)];
  if (r) openModal(r);
});
resultsEl.addEventListener("keydown", (ev) => {
  if (resolving) return;
  if (ev.key !== "Enter" && ev.key !== " ") return;
  if (ev.target.closest("button")) return;
  const card = ev.target.closest(".card[data-idx]");
  if (!card) return;
  ev.preventDefault();
  const r = lastResults[Number(card.dataset.idx)];
  if (r) openModal(r);
});

async function retryResolve(idx, btn) {
  const prev = lastResults[idx];
  if (!prev) return;
  btn.disabled = true;
  btn.textContent = "Memproses…";
  try {
    const res = await fetch("/api/resolve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ urls: [prev.url] }),
    });
    const data = await res.json();
    const r = data.results && data.results[0];
    if (!res.ok || !r) throw new Error((data && data.error) || "tidak diketahui");
    lastResults[idx] = r;
    addToLocalHistory([r]);
    resultsEl.innerHTML = lastResults.map((x, i) => resultCard(x, x.ok ? "ok" : "fail", i)).join("");
    if (r.ok) openModal(r);
  } catch (e) {
    btn.disabled = false;
    btn.textContent = "Coba lagi";
    statusLine.textContent = "Gagal resolve ulang: " + (e.message || "tidak diketahui");
  }
}

// --- Riwayat (tab Riwayat) ---
function qualityLabel(item) {
  const d = item.downloads && item.downloads[0];
  if (!d) return "";
  return d.quality || d.label || "";
}

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function groupOf(createdAt) {
  const t = new Date(createdAt);
  if (Number.isNaN(t.getTime())) return "Lebih lama";
  const diff = Math.round((startOfDay(new Date()) - startOfDay(t)) / 86400000);
  if (diff <= 0) return "Hari ini";
  if (diff === 1) return "Kemarin";
  if (diff <= 6) return "Minggu ini";
  return "Lebih lama";
}

const GROUP_ORDER = ["Hari ini", "Kemarin", "Minggu ini", "Lebih lama"];

function fmtDateTime(iso) {
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return "";
  return t.toLocaleString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function historyCard(item) {
  const platform = platformOf(item.url);
  const thumb = item.thumbnail
    ? `<img class="thumb" src="${esc(item.thumbnail)}" alt="" loading="lazy" onerror="this.style.display='none'">`
    : `<div class="thumb-ph">${esc(platform)}</div>`;
  const meta = [fmtDateTime(item.createdAt), qualityLabel(item)].filter(Boolean).join(" · ");
  const note = item.note ? `<p class="note">${esc(item.note)}</p>` : "";
  return `<article class="card" data-id="${esc(item.id)}">
    <div class="card-top">${thumb}
      <div>
        <span class="badge">${esc(platform)}</span>
        <p class="card-title">${esc(item.title || item.url)}</p>
        <p class="card-url">${esc(item.url)}</p>
      </div>
    </div>
    ${note}
    <p class="meta">${esc(meta)}</p>
    <div class="card-actions">
      <button class="btn-outline btn-small" data-act="open" type="button">Unduh lagi</button>
      <button class="btn-outline btn-small" data-act="retry" type="button">Resolve ulang</button>
      <button class="btn-outline btn-small" data-act="del" type="button">Hapus</button>
    </div>
  </article>`;
}

function renderHistory() {
  const all = loadLocalHistory()
    .slice()
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  btnClear.style.display = all.length ? "" : "none";

  const q = histQuery.trim().toLowerCase();
  const filtered = all.filter((item) => {
    if (histFilter !== "Semua" && platformOf(item.url) !== histFilter) return false;
    if (
      q &&
      !((item.title || "").toLowerCase().includes(q) || (item.url || "").toLowerCase().includes(q))
    )
      return false;
    return true;
  });

  if (!all.length) {
    historyList.innerHTML = `<div class="empty">
      <p class="empty-title">Belum ada riwayat</p>
      <p class="empty-sub">Resolve link dulu, hasilnya akan tersimpan di sini.</p>
      <button class="btn-primary" id="empty-goto-unduh" type="button">Ke menu Unduh</button>
    </div>`;
    const b = $("#empty-goto-unduh");
    if (b) b.addEventListener("click", () => switchTab("unduh"));
    return;
  }

  if (!filtered.length) {
    historyList.innerHTML = `<div class="empty">
      <p class="empty-title">Tidak ada hasil yang cocok</p>
      <p class="empty-sub">Coba kata kunci lain atau ubah filter platform.</p>
      <button class="btn-outline" id="empty-reset" type="button">Reset pencarian</button>
    </div>`;
    const b = $("#empty-reset");
    if (b)
      b.addEventListener("click", () => {
        histQuery = "";
        histSearch.value = "";
        histFilter = "Semua";
        $$(".chip").forEach((c) => c.classList.toggle("active", c.dataset.filter === "Semua"));
        renderHistory();
      });
    return;
  }

  const groups = {};
  for (const item of filtered) {
    const g = groupOf(item.createdAt);
    (groups[g] = groups[g] || []).push(item);
  }
  historyList.innerHTML = GROUP_ORDER.filter((g) => groups[g] && groups[g].length)
    .map(
      (g) =>
        `<div class="hist-group"><h3 class="hist-group-title">${g}</h3>${groups[g]
          .map(historyCard)
          .join("")}</div>`
    )
    .join("");
}

histSearch.addEventListener("input", () => {
  histQuery = histSearch.value;
  renderHistory();
});

$$(".chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    histFilter = chip.dataset.filter;
    $$(".chip").forEach((c) => c.classList.toggle("active", c === chip));
    renderHistory();
  });
});

historyList.addEventListener("click", async (ev) => {
  const btn = ev.target.closest("button[data-act]");
  if (!btn) return;
  const card = ev.target.closest(".card[data-id]");
  const id = card && card.dataset.id;
  if (!id) return;
  const item = loadLocalHistory().find((i) => i.id === id);
  if (!item) return;

  if (btn.dataset.act === "del") {
    removeFromLocalHistory(id);
    renderHistory();
    return;
  }
  if (btn.dataset.act === "open") {
    openModal({ ...item, ok: true });
    return;
  }
  if (btn.dataset.act === "retry") {
    btn.disabled = true;
    const original = btn.textContent;
    btn.textContent = "Mengambil ulang…";
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
        createdAt: new Date().toISOString(),
      });
      renderHistory();
      openModal(r);
    } catch (e) {
      btn.disabled = false;
      btn.textContent = original;
      alert("Gagal resolve ulang: " + (e.message || "tidak diketahui"));
    }
  }
});

// Hapus Semua — konfirmasi dua ketuk; batal otomatis ~3,5 detik / ketuk di luar.
let clearArmed = false;
let clearTimer = null;

function disarmClear() {
  clearArmed = false;
  btnClear.textContent = "Hapus Semua";
  btnClear.classList.remove("armed");
  if (clearTimer) {
    clearTimeout(clearTimer);
    clearTimer = null;
  }
}

btnClear.addEventListener("click", (ev) => {
  ev.stopPropagation();
  if (!clearArmed) {
    clearArmed = true;
    btnClear.textContent = "Yakin hapus semua?";
    btnClear.classList.add("armed");
    clearTimer = setTimeout(disarmClear, 3500);
    return;
  }
  saveLocalHistory([]);
  disarmClear();
  renderHistory();
});

document.addEventListener("click", (ev) => {
  if (clearArmed && !btnClear.contains(ev.target)) disarmClear();
});
