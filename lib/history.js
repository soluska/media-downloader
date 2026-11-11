// Riwayat resolve, disimpan ke file JSON (data/history.json).
// Tulis atomik: tulis file .tmp lalu rename, supaya file tidak rusak
// kalau proses mati di tengah tulis.

const fs = require("fs");
const path = require("path");

const FILE = path.join(__dirname, "..", "data", "history.json");
const MAX_ITEMS = 200;

function load() {
  try {
    const raw = fs.readFileSync(FILE, "utf8");
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function save(items) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  const tmp = FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(items, null, 2), "utf8");
  fs.renameSync(tmp, FILE);
}

function addMany(newItems) {
  if (!newItems.length) return load();
  const items = load();
  // Terbaru dulu; buang duplikat URL lama (yang baru menang).
  const urls = new Set(newItems.map((i) => i.url));
  const kept = items.filter((i) => !urls.has(i.url));
  const merged = [...newItems, ...kept].slice(0, MAX_ITEMS);
  save(merged);
  return merged;
}

function get(id) {
  return load().find((i) => i.id === id) || null;
}

function update(id, patch) {
  const items = load();
  const idx = items.findIndex((i) => i.id === id);
  if (idx === -1) return null;
  items[idx] = { ...items[idx], ...patch, updatedAt: new Date().toISOString() };
  save(items);
  return items[idx];
}

function remove(id) {
  const items = load();
  const next = items.filter((i) => i.id !== id);
  if (next.length === items.length) return false;
  save(next);
  return true;
}

function clear() {
  save([]);
}

module.exports = { load, save, addMany, get, update, remove, clear };
