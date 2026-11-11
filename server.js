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

// GET /api/dl?u=<url file>&dl=1 — proxy download.
// Kenapa perlu: link unduhan dari gateway (snaptik dkk.) memakai token yang
// terikat ke IP/referer server yang me-resolve; dibuka langsung dari HP
// pengguna sering ditolak (snaptik: {"error":true,"message":"Forbidden"}).
// Lewat proxy ini file diambil server (IP yang sama dengan saat resolve)
// lalu diteruskan ke pengguna. dl=1 -> Content-Disposition: attachment
// (unduh file); tanpa dl -> inline (untuk <video> preview), dengan
// dukungan Range. Keamanan: hanya host di DL_HOSTS (gateway/CDN yang
// dipakai scrapr) yang boleh diproxy; host akhir setelah redirect dicek juga.
const DL_HOSTS = [
  "snaptik.app",
  "tiktokio.com",
  "ssstik.io",
  "tikdownloader.io",
  "rapidcdn.app",
  "savetik.co",
  "indown.net",
  "snapsave.app",
  "snapinsta.to",
  "fdown.net",
  "ytmp3.gg",
  "rapidsave.com",
  "pindown.io",
  "spotidown.app",
  "spotimate.app",
  "spotisaver.net",
  "pixeldrain.com",
  "krakenfiles.com",
  "drive.usercontent.google.com",
  "docs.google.com",
  "drive.google.com",
  "tiktokcdn.com",
  "tiktokcdn-us.com",
  "akamaized.net",
  "bandcampdownloader.app",
  "threadster.app",
  "savetwt.com",
  "tweeload.com",
  "twittervideodownloader.com",
  "sechno.com",
  "megaplay.buzz",
  "hub.convert1s.com",
  "api.fxtwitter.com",
  "i.ytimg.com",
  "ttwid.bytedance.com",
  "aweme.snssdk.com",
  "a.ymcdn.org",
];

function dlHostAllowed(host) {
  const h = String(host || "").toLowerCase();
  return DL_HOSTS.some((d) => h === d || h.endsWith("." + d));
}

function extFromContentType(ct) {
  const c = String(ct || "").toLowerCase();
  if (c.includes("video/mp4") || c.includes("mp4")) return "mp4";
  if (c.includes("audio/mpeg") || c.includes("mp3")) return "mp3";
  if (c.includes("video/webm")) return "webm";
  if (c.includes("audio/webm")) return "webm";
  if (c.includes("image/jpeg")) return "jpg";
  if (c.includes("image/png")) return "png";
  return "bin";
}

app.get("/api/dl", async (req, res) => {
  const raw = req.query.u;
  if (typeof raw !== "string" || !raw) {
    return res.status(400).json({ error: "Parameter u (URL file) wajib diisi" });
  }
  let target;
  try {
    target = new URL(raw);
  } catch {
    return res.status(400).json({ error: "URL tidak valid" });
  }
  if (target.protocol !== "http:" && target.protocol !== "https:") {
    return res.status(400).json({ error: "URL harus http(s)" });
  }
  if (!dlHostAllowed(target.hostname)) {
    return res.status(400).json({ error: "Host file tidak diizinkan" });
  }

  try {
    // Ambil file dari upstream; coba sekali lagi kalau koneksi putus
    // (gateway sering menutup koneksi keep-alive — retry pakai koneksi baru).
    let upstream = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        upstream = await axios({
          method: "get",
          url: raw,
          responseType: "stream",
          maxRedirects: 5,
          timeout: 120000,
          validateStatus: null,
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            Referer: `${target.protocol}//${target.host}/`,
            ...(req.headers.range ? { Range: req.headers.range } : {}),
          },
        });
        break;
      } catch (e) {
        const retryable =
          !e.response &&
          (["ECONNRESET", "ECONNABORTED", "ETIMEDOUT", "EPIPE"].includes(e.code) ||
            /socket hang up/i.test(e.message || ""));
        if (!retryable || attempt === 1) throw e;
        await new Promise((r) => setTimeout(r, 500));
      }
    }

    // Host akhir setelah redirect harus tetap diizinkan.
    let finalHost = target.hostname;
    try {
      const finalUrl =
        upstream.request && upstream.request.res && upstream.request.res.responseUrl;
      if (finalUrl) finalHost = new URL(finalUrl).hostname;
    } catch {
      // abaikan — pakai host awal
    }
    if (!dlHostAllowed(finalHost)) {
      upstream.data.destroy();
      return res.status(400).json({ error: "Redirect ke host yang tidak diizinkan" });
    }

    const status = upstream.status;
    if (status < 200 || status >= 300) {
      upstream.data.destroy();
      return res
        .status(status)
        .json({ error: `Server sumber menolak (${status}) — coba link lain` });
    }

    const h = upstream.headers || {};
    if (h["content-type"]) res.setHeader("Content-Type", h["content-type"]);
    if (h["content-length"]) res.setHeader("Content-Length", h["content-length"]);
    if (h["accept-ranges"]) res.setHeader("Accept-Ranges", h["accept-ranges"]);
    if (h["content-range"]) res.setHeader("Content-Range", h["content-range"]);
    if (req.query.dl === "1") {
      let filename = null;
      const disp = h["content-disposition"];
      if (disp) {
        const m = /filename\*?=(?:UTF-8''|")?([^";]+)/i.exec(disp);
        if (m) {
          try {
            filename = decodeURIComponent(m[1].replace(/"/g, ""));
          } catch {
            filename = m[1].replace(/"/g, "");
          }
        }
      }
      if (!filename) filename = `media-downloader.${extFromContentType(h["content-type"])}`;
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${filename.replace(/["\r\n]/g, "")}"`
      );
    }
    res.status(status);
    upstream.data.pipe(res);
    upstream.data.on("error", () => {
      try {
        res.end();
      } catch {
        // abaikan
      }
    });
  } catch (e) {
    console.error("[dl] upstream error:", e && e.message ? e.message : String(e));
    return res.status(502).json({ error: "Tidak bisa mengambil file dari server sumber" });
  }
});

app.listen(PORT, () => {
  console.log(`Media Downloader jalan di http://localhost:${PORT}`);
});
