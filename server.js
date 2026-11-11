// Media Downloader — standalone.
// Server Node.js + Express. Resolve link media via scrapr.
// Riwayat TIDAK disimpan di server: tiap perangkat menyimpan
// riwayatnya sendiri di localStorage browser (lihat public/app.js).
// Server ini stateless soal riwayat — hanya resolve + health check.

const path = require("path");
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

const app = express();
const PORT = process.env.PORT || 3000;
const MAX_URLS_PER_REQUEST = 20;

app.use(express.json({ limit: "100kb" }));
app.use(express.static(path.join(__dirname, "public")));

// POST /api/resolve — { urls: ["...", ...] }
// Resolve paralel semua URL. Tidak menyimpan apa pun ke server.
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

  res.json({ results });
});

app.get("/api/health", (req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`Media Downloader jalan di http://localhost:${PORT}`);
});
