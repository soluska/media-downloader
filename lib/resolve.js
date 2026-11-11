// Router resolve: pilih rantai scraper scrapr berdasarkan host URL.
// Sumber: README scrapr (github.com/coflyn/scrapr) — tiap platform punya
// beberapa scraper; dicoba berurutan sampai ada yang berhasil (fallback chain).
// Scraper yang butuh headless browser (savetik, fdown, snapinsta) TIDAK
// dipakai: butuh Chrome/Playwright yang tidak ada di deploy standar.

const scrapr = require("@coflyn/scrapr");

const PER_URL_TIMEOUT_MS = 60_000;

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

function matchHost(host, patterns) {
  return patterns.some((p) => p.test(host));
}

// [pola host, daftar scraper (berurutan), catatan]
const CHAINS = [
  {
    hosts: [/^(vt|vm)\.tiktok\.com$/, /^tiktok\.com$/, /^tt\.site$/],
    fns: [
      scrapr.tiktok && scrapr.tiktok.snaptik,
      scrapr.tiktok && scrapr.tiktok.tiktokio,
      scrapr.tiktok && scrapr.tiktok.ssstik,
      scrapr.tiktok && scrapr.tiktok.tikdownloader,
    ],
  },
  {
    hosts: [/^instagram\.com$/],
    fns: [
      scrapr.instagram && scrapr.instagram.direct,
      scrapr.instagram && scrapr.instagram.indown,
      scrapr.instagram && scrapr.instagram.snapsave,
    ],
  },
  {
    hosts: [/^youtube\.com$/, /^youtu\.be$/, /^music\.youtube\.com$/],
    fns: [
      scrapr.youtube && scrapr.youtube.ytmp3gg,
      scrapr.youtube && scrapr.youtube.ytmp3,
    ],
    playlist: scrapr.youtube && scrapr.youtube.playlist,
  },
  {
    hosts: [/^twitter\.com$/, /^x\.com$/],
    fns: [
      scrapr.twitter && scrapr.twitter.direct,
      scrapr.twitter && scrapr.twitter.tvd,
      scrapr.twitter && scrapr.twitter.tweeload,
      scrapr.twitter && scrapr.twitter.savetwt,
    ],
  },
  {
    hosts: [/^facebook\.com$/, /^fb\.watch$/],
    fns: [scrapr.facebook && scrapr.facebook.snapsave],
  },
  {
    hosts: [/^open\.spotify\.com$/, /^spotify\.com$/],
    fns: [
      scrapr.spotify && scrapr.spotify.spotisaver,
      scrapr.spotify && scrapr.spotify.spotidown,
      scrapr.spotify && scrapr.spotify.spotmate,
      scrapr.spotify && scrapr.spotify.soundloaders,
    ],
  },
  {
    hosts: [/^soundcloud\.com$/],
    fns: [scrapr.soundcloud && scrapr.soundcloud.klickaud],
  },
  {
    hosts: [/^pinterest\.com$/, /^pin\.it$/],
    fns: [
      scrapr.pinterest && scrapr.pinterest.direct,
      scrapr.pinterest && scrapr.pinterest.pindown,
    ],
  },
  {
    hosts: [/^bandcamp\.com$/],
    fns: [
      scrapr.bandcamp && scrapr.bandcamp.direct,
      scrapr.bandcamp && scrapr.bandcamp.bandcampdownloader,
    ],
  },
  {
    hosts: [/^bilibili\.com$/, /^b23\.tv$/, /^bilibili\.tv$/],
    fns: [scrapr.bilibili && scrapr.bilibili.direct],
  },
  {
    hosts: [/^douyin\.com$/],
    fns: [scrapr.douyin && scrapr.douyin.direct],
  },
  {
    hosts: [/^threads\.net$/],
    fns: [scrapr.threads && scrapr.threads.threadster],
  },
  {
    hosts: [/^reddit\.com$/, /^redd\.it$/],
    fns: [scrapr.reddit && scrapr.reddit.rapidsave],
  },
  {
    hosts: [/^pixiv\.net$/],
    fns: [scrapr.pixiv && scrapr.pixiv.ajax],
  },
  {
    hosts: [/^xiaohongshu\.com$/, /^xhslink\.com$/],
    fns: [scrapr.rednote && scrapr.rednote.direct],
  },
  {
    hosts: [/^music\.apple\.com$/],
    fns: [scrapr.applemusic && scrapr.applemusic.aplmate],
  },
  {
    hosts: [/^terabox\.com$/, /^1024terabox\.com$/, /^teraboxapp\.com$/],
    fns: [scrapr.terabox && scrapr.terabox.sechno],
  },
  {
    hosts: [/^mediafire\.com$/],
    fns: [scrapr.resolver && scrapr.resolver.mediafire],
  },
  {
    hosts: [/^sfile\.mobi$/, /^sfile\.co$/],
    fns: [scrapr.resolver && scrapr.resolver.sfile],
  },
  {
    hosts: [/^pixeldrain\.com$/],
    fns: [scrapr.resolver && scrapr.resolver.pixeldrain],
  },
  {
    hosts: [/^catbox\.moe$/, /^files\.catbox\.moe$/, /^litter\.catbox\.moe$/],
    fns: [scrapr.resolver && scrapr.resolver.catbox],
  },
  {
    hosts: [/^drive\.google\.com$/],
    fns: [scrapr.resolver && scrapr.resolver.gdrive],
  },
  {
    hosts: [/^krakenfiles\.com$/],
    fns: [scrapr.resolver && scrapr.resolver.krakenfiles],
  },
  {
    hosts: [/^dood\.to$/, /^doodstream\.com$/, /^ds2play\.com$/],
    fns: [scrapr.resolver && scrapr.resolver.doodstream],
  },
  {
    hosts: [/^sub2unlock\.(io|com)$/, /^sub4unlock\.com$/],
    fns: [scrapr.resolver && scrapr.resolver.sub2unlock],
  },
  {
    hosts: [/^rekonise\.com$/],
    fns: [scrapr.resolver && scrapr.resolver.rekonise],
  },
  {
    hosts: [/^safelinku\.com$/, /^sfl\.gl$/],
    fns: [scrapr.resolver && scrapr.resolver.safelinku],
  },
];

function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(label)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// Coba SEMUA scraper dalam rantai secara paralel, lalu gabungkan hasilnya.
// Judul/thumbnail dari sukses pertama (urutan rantai); downloads digabung
// dan didedupe per URL. Alasan: tiap scraper mengembalikan pilihan yang
// berbeda (satu hanya 2 video, satu lagi ada MP3) — berhenti di sukses
// pertama membuat pilihan resolusi/audio hilang. Kalau semua gagal,
// lempar error terakhir seperti sebelumnya.
async function tryChainMerged(fns, url) {
  const settled = await Promise.allSettled(
    fns.filter((fn) => typeof fn === "function").map((fn) => fn(url))
  );
  const ok = [];
  let lastError = null;
  for (const r of settled) {
    if (r.status === "fulfilled" && r.value && r.value.status && r.value.result) {
      ok.push(r.value.result);
    } else if (r.status === "rejected") {
      lastError = r.reason instanceof Error ? r.reason : new Error(String(r.reason));
    } else if (r.status === "fulfilled") {
      lastError = new Error(
        r.value && r.value.message ? String(r.value.message) : "Scraper mengembalikan status gagal"
      );
    }
  }
  if (!ok.length) throw lastError || new Error("Semua scraper gagal");
  // Gabung downloads dari semua scraper yang sukses, dedupe per URL.
  const seen = new Set();
  const downloads = [];
  for (const res of ok) {
    if (Array.isArray(res.downloads)) {
      for (const d of res.downloads) {
        if (d && typeof d.url === "string" && d.url && !seen.has(d.url)) {
          seen.add(d.url);
          downloads.push(d);
        }
      }
    }
  }
  const first = ok[0];
  return {
    title: first.title,
    thumbnail: first.thumbnail,
    type: first.type,
    downloads,
    url: first.url || null,
    items: first.items || null,
  };
}

// Label yang jelas untuk pengguna: scraper kadang mengembalikan type
// mentah ("video", "music") tanpa quality — tampilkan sebagai MP4/MP3
// supaya pilihan audio terlihat jelas di popup.
function displayLabel(type, quality) {
  const t = String(type || "").toLowerCase();
  if (quality) return `${type || "File"} · ${quality}`;
  if (t === "video") return "video · MP4";
  if (t === "music" || t === "audio" || t === "mp3") return "audio · MP3";
  return type || "Download";
}

function normalize(url, result) {
  const downloads = [];
  if (Array.isArray(result.downloads)) {
    for (const d of result.downloads) {
      if (d && typeof d.url === "string" && d.url) {
        downloads.push({
          label: displayLabel(d.type, d.quality),
          url: d.url,
          quality: d.quality || null,
          type: d.type || null,
        });
      }
    }
  }
  // Resolver file host kadang mengembalikan satu URL langsung (result.url).
  if (downloads.length === 0 && typeof result.url === "string" && result.url) {
    downloads.push({ label: "Download", url: result.url, quality: null, type: null });
  }
  // Playlist (YouTube/Bandcamp): items berupa video, bukan file langsung.
  let items = null;
  let note = null;
  if (result.type === "playlist" && Array.isArray(result.items) && result.items.length) {
    items = result.items
      .filter((it) => it && it.url)
      .map((it) => ({ title: it.title || it.url, url: it.url, thumbnail: it.thumbnail || null }));
    note = `Playlist berisi ${items.length} video. Resolve tiap video satu per satu untuk link download.`;
  }
  return {
    url,
    ok: true,
    title: result.title || url,
    thumbnail: result.thumbnail || null,
    type: result.type || null,
    downloads,
    items,
    note,
  };
}

/**
 * Resolve satu URL. Mengembalikan objek hasil (ok:true) atau melempar Error
 * dengan pesan yang bisa ditampilkan ke pengguna.
 */
async function resolveUrl(rawUrl) {
  const url = String(rawUrl || "").trim();
  if (!/^https?:\/\//i.test(url)) {
    throw new Error("URL tidak valid — harus diawali http:// atau https://");
  }
  const host = hostOf(url);
  const chain = CHAINS.find((c) => matchHost(host, c.hosts));

  const run = async () => {
    // Playlist YouTube: tangani khusus sebelum rantai biasa.
    if (chain && chain.playlist && /[?&]list=/.test(url)) {
      const res = await chain.playlist(url);
      if (res && res.status && res.result) return normalize(url, res.result);
    }
    if (chain) {
      const fns = chain.fns.filter(Boolean);
      if (fns.length) return normalize(url, await tryChainMerged(fns, url));
    }
    // Fallback umum: unshorten — mengikuti rantai redirect, lalu
    // auto-resolve kalau ujungnya file host yang dikenal.
    if (scrapr.resolver && typeof scrapr.resolver.unshorten === "function") {
      const res = await scrapr.resolver.unshorten(url);
      if (res && res.status && res.result) return normalize(url, res.result);
      throw new Error(
        res && res.message
          ? String(res.message)
          : "Platform belum didukung / link tidak bisa di-resolve"
      );
    }
    throw new Error("Platform belum didukung");
  };

  return withTimeout(run(), PER_URL_TIMEOUT_MS, "Waktu habis (60 detik) — server sumber lambat / tidak merespons");
}

module.exports = { resolveUrl };
