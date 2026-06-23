const state = {
  entries: [],
  insights: {},
  selectedMood: null
};

const moodMeta = {
  happy: { emoji: "😊", label: "Среќно", score: 4 },
  okay: { emoji: "🙂", label: "ОК", score: 3 },
  sad: { emoji: "😔", label: "Тажно", score: 1 },
  stressed: { emoji: "😫", label: "Под стрес", score: 2 }
};

const weekdays = ["Нед", "Пон", "Вто", "Сре", "Чет", "Пет", "Саб"];
const months = ["јануари", "февруари", "март", "април", "мај", "јуни", "јули", "август", "септември", "октомври", "ноември", "декември"];

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];

async function request(url, options) {
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options
  });
  if (!response.ok) throw new Error((await response.json()).error || "Грешка");
  return response.json();
}

async function loadData() {
  [state.entries, state.insights] = await Promise.all([
    request("/api/entries"),
    request("/api/insights")
  ]);
  renderAll();
}

function renderAll() {
  renderStats();
  renderWeek();
  renderCharts();
  renderJournal();
}

function renderStats() {
  const { streak = 0, averageStress = 0, averageSleep = 0, activeDays = 0, positivePercent = 0 } = state.insights;
  $("#streakValue").textContent = streak;
  $("#sleepStat").textContent = `${averageSleep.toFixed(1)} часа`;
  $("#stressStat").textContent = `${averageStress.toFixed(1)} / 5`;
  $("#activeStat").textContent = `${activeDays} од 7`;
  $("#positivePercent").textContent = `${positivePercent}%`;
  $("#sleepInsight").textContent = `${averageSleep.toFixed(1)} часа`;
  $("#stressInsight").textContent = `${averageStress.toFixed(1)} / 5`;
  $("#movementInsight").textContent = `${activeDays} дена`;
}

function renderWeek() {
  const recentDates = new Set(state.entries.slice(-7).map(entry => entry.date));
  const days = [];
  const latest = state.entries.at(-1)?.date ? new Date(`${state.entries.at(-1).date}T12:00:00`) : new Date();
  for (let offset = 6; offset >= 0; offset--) {
    const date = new Date(latest);
    date.setDate(latest.getDate() - offset);
    const iso = date.toISOString().slice(0, 10);
    days.push(`<div class="day-dot ${recentDates.has(iso) ? "done" : ""}"><i>${recentDates.has(iso) ? "✓" : ""}</i><span>${weekdays[date.getDay()]}</span></div>`);
  }
  $("#weekDots").innerHTML = days.join("");
}

function renderCharts() {
  drawChart($("#moodChart"), state.entries.slice(-7));
  drawChart($("#bigMoodChart"), state.entries.slice(-14));
}

function drawChart(svg, entries) {
  if (!entries.length) {
    svg.innerHTML = `<text x="50%" y="50%" text-anchor="middle" class="chart-label">Нема доволно податоци</text>`;
    return;
  }
  const width = 720, height = svg.id === "bigMoodChart" ? 280 : 240;
  const left = 35, right = 20, top = 25, bottom = 38;
  const usableW = width - left - right, usableH = height - top - bottom;
  const points = entries.map((entry, index) => {
    const x = entries.length === 1 ? width / 2 : left + (index / (entries.length - 1)) * usableW;
    const y = top + ((4 - moodMeta[entry.mood].score) / 3) * usableH;
    return { x, y, entry };
  });
  const line = points.map((point, i) => `${i ? "L" : "M"} ${point.x} ${point.y}`).join(" ");
  const area = `${line} L ${points.at(-1).x} ${height - bottom} L ${points[0].x} ${height - bottom} Z`;
  const grid = [1, 2, 3, 4].map(score => {
    const y = top + ((4 - score) / 3) * usableH;
    return `<line x1="${left}" y1="${y}" x2="${width - right}" y2="${y}" class="chart-grid"/>`;
  }).join("");
  const labels = points.map(point => {
    const date = new Date(`${point.entry.date}T12:00:00`);
    return `<text x="${point.x}" y="${height - 12}" text-anchor="middle" class="chart-label">${date.getDate()} ${months[date.getMonth()].slice(0,3)}</text>`;
  }).join("");
  const circles = points.map(point => `
    <circle cx="${point.x}" cy="${point.y}" r="5" class="chart-point"/>
    <text x="${point.x}" y="${point.y - 12}" text-anchor="middle" font-size="15">${moodMeta[point.entry.mood].emoji}</text>
  `).join("");
  svg.innerHTML = `
    <defs><linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#7655ef" stop-opacity=".22"/><stop offset="100%" stop-color="#7655ef" stop-opacity="0"/></linearGradient></defs>
    ${grid}<path d="${area}" class="chart-area"/><path d="${line}" class="chart-line"/>${circles}${labels}
  `;
}

function renderJournal() {
  const list = $("#journalList");
  if (!state.entries.length) {
    list.innerHTML = `<div class="empty-state">Сè уште немаш записи. Направи го првиот check-in 💜</div>`;
    return;
  }
  list.innerHTML = [...state.entries].reverse().map(entry => {
    const date = new Date(`${entry.date}T12:00:00`);
    const meta = moodMeta[entry.mood];
    return `<article class="journal-entry">
      <div class="entry-emoji">${meta.emoji}</div>
      <div class="entry-date"><strong>${date.getDate()} ${months[date.getMonth()]}</strong><span>${weekdays[date.getDay()]}</span></div>
      <div class="entry-copy"><strong>${meta.label}</strong><p>${escapeHtml(entry.note || "Без белешка за овој ден.")}</p>
        <div class="entry-metrics"><span>⚡ Стрес ${entry.stress}/5</span><span>🌙 ${entry.sleep}ч.</span><span>🏃 ${entry.activity} мин.</span></div>
      </div>
      <button class="delete-button" data-delete="${entry.id}" aria-label="Избриши запис">×</button>
    </article>`;
  }).join("");
}

function escapeHtml(text) {
  return text.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char]);
}

function navigate(pageId) {
  $$(".page").forEach(page => page.classList.toggle("active", page.id === pageId));
  $$(".nav-link").forEach(link => link.classList.toggle("active", link.dataset.page === pageId));
  $(".sidebar").classList.remove("open");
  window.scrollTo({ top: 0, behavior: "smooth" });
  history.replaceState(null, "", `#${pageId}`);
}

function selectMood(mood) {
  state.selectedMood = mood;
  $$(".mood-option").forEach(button => button.classList.toggle("selected", button.dataset.mood === mood));
}

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 2600);
}

function openModal(id) { $(`#${id}`).classList.add("open"); }
function closeModal(id) { $(`#${id}`).classList.remove("open"); }

$$(".nav-link").forEach(link => link.addEventListener("click", event => {
  event.preventDefault();
  navigate(link.dataset.page);
}));
$$("[data-go]").forEach(button => button.addEventListener("click", () => navigate(button.dataset.go)));
$$(".mood-option").forEach(button => button.addEventListener("click", () => selectMood(button.dataset.mood)));
$$("[data-close]").forEach(button => button.addEventListener("click", () => closeModal(button.dataset.close)));

$("#continueCheckin").addEventListener("click", () => {
  if (!state.selectedMood) return showToast("Прво избери како се чувствуваш.");
  navigate("checkin");
});
$("#stressInput").addEventListener("input", event => $("#stressOutput").textContent = event.target.value);
$("#noteInput").addEventListener("input", event => $("#charCount").textContent = event.target.value.length);
$("#menuBtn").addEventListener("click", () => $(".sidebar").classList.toggle("open"));

$("#checkinForm").addEventListener("submit", async event => {
  event.preventDefault();
  if (!state.selectedMood) return showToast("Избери расположение за денес.");
  const payload = {
    date: new Date().toISOString().slice(0, 10),
    mood: state.selectedMood,
    stress: Number($("#stressInput").value),
    sleep: Number($("#sleepInput").value),
    activity: Number($("#activityInput").value),
    note: $("#noteInput").value.trim(),
    challengeDone: $(".challenge-card").classList.contains("completed")
  };
  try {
    const result = await request("/api/entries", { method: "POST", body: JSON.stringify(payload) });
    $("#resultTitle").textContent = `Денес се чувствуваш: ${moodMeta[payload.mood].label}`;
    $("#resultMessage").textContent = result.message;
    $("#resultAdvice").textContent = result.advice;
    openModal("resultModal");
    $("#noteInput").value = "";
    $("#charCount").textContent = "0";
    await loadData();
  } catch (error) {
    showToast(error.message);
  }
});

$("#journalList").addEventListener("click", async event => {
  const id = event.target.dataset.delete;
  if (!id) return;
  await request(`/api/entries/${encodeURIComponent(id)}`, { method: "DELETE" });
  showToast("Записот е избришан.");
  await loadData();
});

$("#challengeBtn").addEventListener("click", () => {
  const card = $(".challenge-card");
  card.classList.toggle("completed");
  $("#challengeBtn").textContent = card.classList.contains("completed") ? "Предизвикот е прифатен ✓" : "Го прифаќам предизвикот";
  showToast(card.classList.contains("completed") ? "Одличен избор! Твојот ум ќе ти биде благодарен." : "Предизвикот е откажан.");
});

$("#breatheBtn").addEventListener("click", () => openModal("breatheModal"));
let breathingIn = true;
setInterval(() => {
  breathingIn = !breathingIn;
  $("#breathingText").textContent = breathingIn ? "Вдиши" : "Издиши";
}, 4000);

$(".kind-note button").addEventListener("click", () => $(".kind-note").remove());
$(".modal-backdrop").addEventListener("click", event => {
  if (event.target.classList.contains("modal-backdrop")) event.target.classList.remove("open");
});

const now = new Date();
$("#todayLabel").textContent = `${weekdays[now.getDay()]}, ${now.getDate()} ${months[now.getMonth()]} ${now.getFullYear()}`;
const initialPage = location.hash.slice(1);
if (["home", "checkin", "journal", "insights", "support"].includes(initialPage)) navigate(initialPage);

loadData().catch(() => showToast("Не можев да ги вчитам податоците."));
