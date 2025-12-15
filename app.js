// Core state
let currentMood = "happy";
let currentQuote = "";
let favorites = [];

const MOOD_CONFIG = {
  happy: { label: "Happy", animation: "animate-bounce" },
  sad: { label: "Sad", animation: "animate-fade" },
  angry: { label: "Angry", animation: "animate-shake" },
  chill: { label: "Chill", animation: "animate-dissolve" },
};

document.addEventListener("DOMContentLoaded", () => {
  cacheDom();
  restoreState();
  bindEvents();
  setMood(currentMood, true);
  showQuote(pickQuote(currentMood), false);
  renderFavorites();
});

const els = {};

function cacheDom() {
  els.moodButtons = Array.from(document.querySelectorAll(".mood-btn"));
  els.quoteText = document.getElementById("quoteText");
  els.moodBadge = document.getElementById("moodBadge");
  els.generateBtn = document.getElementById("generateBtn");
  els.copyBtn = document.getElementById("copyBtn");
  els.saveBtn = document.getElementById("saveBtn");
  els.copyStatus = document.getElementById("copyStatus");
  els.favoritesList = document.getElementById("favoritesList");
  els.clearFavBtn = document.getElementById("clearFavBtn");
}

function bindEvents() {
  els.moodButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const mood = btn.dataset.mood;
      setMood(mood);
      showQuote(pickQuote(mood));
    });
  });

  els.generateBtn.addEventListener("click", () => {
    showQuote(pickQuote(currentMood));
  });

  els.copyBtn.addEventListener("click", async () => {
    await copyQuote();
  });

  els.saveBtn.addEventListener("click", () => {
    saveCurrentQuote();
  });

  els.clearFavBtn.addEventListener("click", clearFavorites);
}

function setMood(mood, skipSave = false) {
  if (!MOOD_CONFIG[mood]) return;
  currentMood = mood;
  document.body.className = `mood-${mood}`;
  els.moodBadge.textContent = MOOD_CONFIG[mood].label;
  els.moodButtons.forEach((b) => b.classList.toggle("active", b.dataset.mood === mood));
  if (!skipSave) {
    localStorage.setItem("tm-current-mood", mood);
  }
}

function pickQuote(mood) {
  const moodQuotes = quotes?.[mood] || [];
  if (!moodQuotes.length) return "Silence. The worst advice of all.";

  let next = moodQuotes[Math.floor(Math.random() * moodQuotes.length)];
  if (moodQuotes.length > 1) {
    let attempts = 0;
    while (next === currentQuote && attempts < 10) {
      next = moodQuotes[Math.floor(Math.random() * moodQuotes.length)];
      attempts += 1;
    }
  }
  return next;
}

function showQuote(text, animate = true) {
  currentQuote = text;
  els.quoteText.textContent = text;
  if (animate) {
    const animClass = MOOD_CONFIG[currentMood].animation;
    els.quoteText.classList.remove(...Object.values(MOOD_CONFIG).map((c) => c.animation));
    void els.quoteText.offsetWidth; // reset animation
    els.quoteText.classList.add(animClass);
  }
}

async function copyQuote() {
  const payload = `${MOOD_CONFIG[currentMood].label} mood:\n"${currentQuote}"`;
  try {
    await navigator.clipboard.writeText(payload);
    flashStatus("Copied!", true);
  } catch (err) {
    flashStatus("Clipboard blocked", false);
  }
}

function flashStatus(msg, success) {
  if (!els.copyStatus) return;
  els.copyStatus.textContent = msg;
  els.copyStatus.style.borderColor = success ? "var(--accent)" : "rgba(255,255,255,0.3)";
  els.copyStatus.classList.add("show");
  setTimeout(() => els.copyStatus.classList.remove("show"), 1400);
}

function saveCurrentQuote() {
  if (!currentQuote) return;
  const exists = favorites.some((f) => f.text === currentQuote && f.mood === currentMood);
  if (exists) {
    flashStatus("Already saved", false);
    return;
  }
  favorites.unshift({
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    text: currentQuote,
    mood: currentMood,
  });
  persistFavorites();
  renderFavorites();
  flashStatus("Saved", true);
}

function renderFavorites() {
  els.favoritesList.innerHTML = "";
  if (!favorites.length) {
    const p = document.createElement("p");
    p.className = "empty";
    p.textContent = 'Nothing saved yet. Lower your standards and hit "Save".';
    els.favoritesList.appendChild(p);
    return;
  }

  favorites.forEach((fav) => {
    const item = document.createElement("div");
    item.className = "favorite-item";

    const meta = document.createElement("div");
    meta.className = "meta";
    meta.textContent = `${MOOD_CONFIG[fav.mood]?.label || fav.mood}`;

    const text = document.createElement("p");
    text.className = "text";
    text.textContent = fav.text;

    const del = document.createElement("button");
    del.type = "button";
    del.textContent = "✕";
    del.addEventListener("click", () => {
      favorites = favorites.filter((f) => f.id !== fav.id);
      persistFavorites();
      renderFavorites();
    });

    item.appendChild(meta);
    item.appendChild(text);
    item.appendChild(del);
    els.favoritesList.appendChild(item);
  });
}

function clearFavorites() {
  favorites = [];
  persistFavorites();
  renderFavorites();
}

function persistFavorites() {
  localStorage.setItem("tm-favorites", JSON.stringify(favorites));
}

function restoreState() {
  const storedMood = localStorage.getItem("tm-current-mood");
  if (storedMood && MOOD_CONFIG[storedMood]) {
    currentMood = storedMood;
  }
  try {
    const raw = localStorage.getItem("tm-favorites");
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        favorites = parsed;
      }
    }
  } catch (e) {
    favorites = [];
  }
}
