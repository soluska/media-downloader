// Media Downloader — standalone.
// Server Node.js + Express. Resolve link media via scrapr, simpan riwayat
// ke data/history.json (history-first: resolve sukses disimpan dulu
// sebelum hasil dikembalikan ke client).

const path = require("path");
const crypto = require("crypto");
const axios = require("axios");

// Proxy opsional: kalau environment menyediakan HTTPS_PROXY/HTTP_PROXY
// (mis. saat dev di VM ber-proxy), teruskan ke axios agar scrapr bisa
// keluar. Di hosting normal (Render/Docker) variabel ini tidak ada,
// jadi koneksi langsung. Ini mengikuti pola konfigurasi di README scrapr.
(function setupProxyFromEnv() {
  const raw = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || "";
  if (!raw) return;
  try {
    const u = new URL(raw);
    axios.defaults.proxy = {
      protocol: u.protocol.replace(":", ""),
      host: u.hostname,
      port: Number(u.port) || 8080,
      ...(u.username
        ? {
            auth: {
              username: decodeURIComponent(u.username),
              password: decodeURIComponent(u.password),
            },
          }
        : {}),
    };
  } catch {
    // URL proxy tidak valid — abaikan, lanjut koneksi langsung.
  }
})();
axios.defaults.timeout = 25000;

const express = require("express");
const { resolveUrl } = require("./lib/resolve");
const history = require("./lib/history");

const app = express();
const PORT = process.env.PORT || 3000;
const MAX_URLS_PER_REQUEST = 20;

app.use(express.json({ limit: "100kb" }));
app.use(express.static(path.join(__dirname, "public")));

function newId() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// POST /api/resolve — { urls: ["...", ...] }
// Resolve paralel semua URL. Hasil sukses disimpan ke riwayat DULU
// sebelum respons dikembalikan (history-first).
app.post("/api/resolve", async (req, res) => {
  const raw = req.body && req.body.urls;
  if (!Array.isArray(raw)) {
    return res.status(400).json({ error: "Body harus { urls: [...] }" });
  }
  const urls = [...new Set(raw.map((u) => String(u || "").trim()).filter(Boolean))];
  if (!urls.length) {
    return res.status(400).json({ error: "Tidak ada link yang dikirim" });
  }
  if (urls.length > MAX_URLS_PER_REQUEST) {
    return res
      .status(400)
      .json({ error: `Maksimal ${MAX_URLS_PER_REQUEST} link per request` });
  }

  const results = await Promise.all(
    urls.map(async (url) => {
      try {
        return await resolveUrl(url);
      } catch (e) {
        return { url, ok: false, error: e instanceof Error ? e.message : String(e) };
      }
    })
  );

  // History-first: simpan yang sukses sebelum membalas.
  const okItems = results
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
  if (okItems.length) {
    history.addMany(okItems);
    const byUrl = new Map(okItems.map((i) => [i.url, i.id]));
    for (const r of results) {
      if (r.ok) r.historyId = byUrl.get(r.url) || null;
    }
  }

  res.json({ results });
});

// GET /api/history — terbaru dulu.
app.get("/api/history", (req, res) => {
  res.json({ items: history.load() });
});

// DELETE /api/history — hapus semua. (Didefinisikan sebelum :id.)
app.delete("/api/history", (req, res) => {
  history.clear();
  res.json({ ok: true });
});

// DELETE /api/history/:id — hapus satu item.
app.delete("/api/history/:id", (req, res) => {
  if (!history.remove(req.params.id)) {
    return res.status(404).json({ error: "Item tidak ditemukan" });
  }
  res.json({ ok: true });
});

// POST /api/history/:id/retry — resolve ulang URL item itu.
app.post("/api/history/:id/retry", async (req, res) => {
  const item = history.get(req.params.id);
  if (!item) return res.status(404).json({ error: "Item tidak ditemukan" });
  try {
    const r = await resolveUrl(item.url);
    const updated = history.update(item.id, {
      title: r.title,
      thumbnail: r.thumbnail,
      type: r.type,
      downloads: r.downloads,
      items: r.items || null,
      note: r.note || null,
    });
    res.json({ ok: true, item: updated });
  } catch (e) {
    res.status(502).json({
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    });
  }
});

app.get("/api/health", (req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`Media Downloader jalan di http://localhost:${PORT}`);
});
