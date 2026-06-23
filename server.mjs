import { createServer } from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL(".", import.meta.url));
const PUBLIC = join(ROOT, "public");
const DATA_DIR = join(ROOT, "data");
const DB_FILE = join(DATA_DIR, "moods.json");
const PORT = Number(process.env.PORT || 4173);

const seed = [
  { id: "seed-1", date: "2026-06-17", mood: "happy", stress: 2, sleep: 8, activity: 45, note: "Убав ден со другарите.", challengeDone: true },
  { id: "seed-2", date: "2026-06-18", mood: "okay", stress: 3, sleep: 7, activity: 25, note: "Имав многу домашни задачи.", challengeDone: false },
  { id: "seed-3", date: "2026-06-19", mood: "stressed", stress: 5, sleep: 6, activity: 10, note: "Се подготвував за тест.", challengeDone: true },
  { id: "seed-4", date: "2026-06-20", mood: "sad", stress: 4, sleep: 6.5, activity: 15, note: "Ми недостасуваше одмор.", challengeDone: false },
  { id: "seed-5", date: "2026-06-21", mood: "okay", stress: 3, sleep: 7.5, activity: 30, note: "Подобар ден.", challengeDone: true },
  { id: "seed-6", date: "2026-06-22", mood: "happy", stress: 2, sleep: 8.5, activity: 55, note: "Прошетка и музика.", challengeDone: true }
];

async function ensureDb() {
  await mkdir(DATA_DIR, { recursive: true });
  if (!existsSync(DB_FILE)) await writeFile(DB_FILE, JSON.stringify(seed, null, 2), "utf8");
}

async function getEntries() {
  await ensureDb();
  return JSON.parse(await readFile(DB_FILE, "utf8"));
}

async function saveEntries(entries) {
  await writeFile(DB_FILE, JSON.stringify(entries, null, 2), "utf8");
}

function json(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

async function body(req) {
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 100_000) throw new Error("Payload too large");
  }
  return JSON.parse(raw || "{}");
}

function adviceFor(entry) {
  if (entry.stress >= 4 && entry.sleep < 7) {
    return "Денес си под поголем притисок и ти недостига сон. Пробај 3 минути мирно дишење и подготви се за порано легнување.";
  }
  if (entry.mood === "sad") {
    return "Твоето чувство е важно. Напиши една личност со која би можел/а да разговараш и направи нешто мало што ти носи мир.";
  }
  if (entry.activity < 20) {
    return "Кратко движење може да го освежи денот. Пробај 15-минутна прошетка без телефон.";
  }
  if (entry.mood === "happy") {
    return "Убаво е што денес се чувствуваш добро! Запиши што придонесе за тоа — така полесно ќе ги препознаваш навиките што ти помагаат.";
  }
  return "Добро е што одвои момент за себе. Направи една кратка пауза, напиј се вода и избери мала цел за остатокот од денот.";
}

function motivationalMessage(entry) {
  const messages = {
    happy: "Зачувај го ова чувство — малите убави моменти се важни. ✨",
    okay: "Не мора секој ден да биде совршен. И мирниот ден е добар ден. 🌿",
    sad: "Тежок момент не значи тежок живот. Биди нежен/на со себе денес. 💛",
    stressed: "Еден здив, еден чекор, една задача. Не мора сè одеднаш. 🌊"
  };
  return messages[entry.mood] || messages.okay;
}

async function api(req, res, url) {
  if (url.pathname === "/api/entries" && req.method === "GET") {
    return json(res, 200, await getEntries());
  }

  if (url.pathname === "/api/entries" && req.method === "POST") {
    const input = await body(req);
    const entry = {
      id: crypto.randomUUID(),
      date: String(input.date || "").slice(0, 10),
      mood: input.mood,
      stress: Number(input.stress),
      sleep: Number(input.sleep),
      activity: Number(input.activity),
      note: String(input.note || "").slice(0, 300),
      challengeDone: Boolean(input.challengeDone)
    };
    const validMoods = ["happy", "okay", "sad", "stressed"];
    if (!entry.date || !validMoods.includes(entry.mood) || entry.stress < 1 || entry.stress > 5) {
      return json(res, 400, { error: "Невалидни податоци." });
    }
    const entries = await getEntries();
    const existing = entries.findIndex(item => item.date === entry.date);
    if (existing >= 0) entries[existing] = entry;
    else entries.push(entry);
    entries.sort((a, b) => a.date.localeCompare(b.date));
    await saveEntries(entries);
    return json(res, 201, { entry, advice: adviceFor(entry), message: motivationalMessage(entry) });
  }

  if (url.pathname.startsWith("/api/entries/") && req.method === "DELETE") {
    const id = decodeURIComponent(url.pathname.split("/").pop());
    const entries = await getEntries();
    await saveEntries(entries.filter(item => item.id !== id));
    return json(res, 200, { ok: true });
  }

  if (url.pathname === "/api/insights" && req.method === "GET") {
    const entries = await getEntries();
    const recent = entries.slice(-7);
    const avg = key => recent.length ? recent.reduce((sum, item) => sum + Number(item[key]), 0) / recent.length : 0;
    const positive = recent.filter(item => ["happy", "okay"].includes(item.mood)).length;
    return json(res, 200, {
      streak: calculateStreak(entries),
      averageStress: avg("stress"),
      averageSleep: avg("sleep"),
      activeDays: recent.filter(item => item.activity >= 30).length,
      positivePercent: recent.length ? Math.round((positive / recent.length) * 100) : 0
    });
  }

  json(res, 404, { error: "Not found" });
}

function calculateStreak(entries) {
  if (!entries.length) return 0;
  const dates = [...new Set(entries.map(item => item.date))].sort().reverse();
  let streak = 1;
  for (let i = 1; i < dates.length; i++) {
    const previous = new Date(`${dates[i - 1]}T12:00:00`);
    const current = new Date(`${dates[i]}T12:00:00`);
    if ((previous - current) / 86_400_000 === 1) streak++;
    else break;
  }
  return streak;
}

const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8"
};

async function serveStatic(res, pathname) {
  const relative = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const safePath = normalize(relative).replace(/^(\.\.[/\\])+/, "");
  const file = join(PUBLIC, safePath);
  try {
    const content = await readFile(file);
    res.writeHead(200, { "Content-Type": mime[extname(file)] || "application/octet-stream" });
    res.end(content);
  } catch {
    const content = await readFile(join(PUBLIC, "index.html"));
    res.writeHead(200, { "Content-Type": mime[".html"] });
    res.end(content);
  }
}

await ensureDb();
createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname.startsWith("/api/")) await api(req, res, url);
    else await serveStatic(res, url.pathname);
  } catch (error) {
    console.error(error);
    json(res, 500, { error: "Настана грешка на серверот." });
  }
}).listen(PORT, () => {
  console.log(`MoodMate is running at http://localhost:${PORT}`);
});
