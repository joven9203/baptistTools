// ======== GLOBAL STATE ========

let bibleFlat = null;              // flat JSON from kjv1611.json
let bible = {};                    // structured: bible[bookSlug][chapter][verse]
let bookMeta = {};                 // bookSlug -> { displayName, chapters: [], verseCounts: {} }
let bookOrder = [];                // ordered list of book slugs

let currentBook = null;
let currentChapter = null;
let currentVerse = null;

let isSearchResultsMode = false;
let searchResults = [];

let presentWindow = null;

// separate font sizes
let centerFontSizePx = 50;
let presenterFontSizePx = 70;

// cached DOM elements
const els = {};

// ======== INIT ========

document.addEventListener("DOMContentLoaded", () => {
  cacheDom();
  wireEvents();
  applyCenterFontSize(centerFontSizePx);
  loadBibleData();
});

// ======== DOM CACHE ========

function cacheDom() {
  els.bookSelect        = document.getElementById("bookSelect");
  els.chapterSelect     = document.getElementById("chapterSelect");
  els.verseSelect       = document.getElementById("verseSelect");
  els.presentBtn        = document.getElementById("presentBtn");

  els.searchToggle      = document.getElementById("searchToggle");
  els.searchDropdown    = document.getElementById("searchDropdown");
  els.searchScope       = document.getElementById("searchScope");
  els.searchInput       = document.getElementById("searchInput");
  els.searchSubmit      = document.getElementById("searchSubmit");
  els.searchClear       = document.getElementById("searchClear");

  els.currentReference  = document.getElementById("currentReference");
  els.currentText       = document.getElementById("currentText");

  els.prevVerseBtn      = document.getElementById("prevVerseBtn");
  els.nextVerseBtn      = document.getElementById("nextVerseBtn");

  els.fontMinus         = document.getElementById("fontMinus");
  els.fontPlus          = document.getElementById("fontPlus");

  els.statusMessage     = document.getElementById("statusMessage");

  els.versesHeader      = document.getElementById("versesHeader");
  els.versesSubHeader   = document.getElementById("versesSubHeader");
  els.versesList        = document.getElementById("versesList");
}

// ======== EVENT WIRING ========

function wireEvents() {
  // Dropdowns
  els.bookSelect.addEventListener("change", onBookChange);
  els.chapterSelect.addEventListener("change", onChapterChange);
  els.verseSelect.addEventListener("change", onVerseChange);

  // Search toggle
  els.searchToggle.addEventListener("click", () => {
    els.searchDropdown.hidden = !els.searchDropdown.hidden;
  });

  // Search actions
  els.searchSubmit.addEventListener("click", runSearch);
  els.searchClear.addEventListener("click", clearSearch);
  els.searchInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") runSearch();
  });

  // Present button
  els.presentBtn.addEventListener("click", openPresenterWindow);

  // Prev / next
  els.prevVerseBtn.addEventListener("click", goToPrevVerse);
  els.nextVerseBtn.addEventListener("click", goToNextVerse);

  // Font size buttons
  els.fontMinus.addEventListener("click", () => {
    // center -1, presenter -2
    centerFontSizePx = centerFontSizePx - 1;
    presenterFontSizePx = presenterFontSizePx - 2;
    applyCenterFontSize(centerFontSizePx);
    pushCurrentVerseToPresenter();
  });

  els.fontPlus.addEventListener("click", () => {
    // center +1, presenter +2
    centerFontSizePx = Math.min(32, centerFontSizePx + 1);
    presenterFontSizePx = Math.min(80, presenterFontSizePx + 2);
    applyCenterFontSize(centerFontSizePx);
    pushCurrentVerseToPresenter();
  });

  // Keyboard arrows for prev/next (not in inputs)
  document.addEventListener("keydown", (e) => {
    const tag = e.target.tagName;
    if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;

    if (e.key === "ArrowRight") {
      e.preventDefault();
      goToNextVerse();
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      goToPrevVerse();
    }
  });
}

// ======== LOAD BIBLE DATA ========

async function loadBibleData() {
  try {
    els.statusMessage.textContent = "Loading Bible data...";

    const res = await fetch("kjv1611.json");
    if (!res.ok) throw new Error("Failed to load kjv1611.json");
    bibleFlat = await res.json();

    buildBibleStructure();
    populateBookSelect();
    setupSearchSuggestions();
    restoreLastLocation();

    els.statusMessage.textContent =
      'Ready. Select a verse or search (e.g. "John 3:16" or keyword).';
  } catch (err) {
    console.error(err);
    els.statusMessage.textContent = "Error loading Bible data.";
  }
}

// ======== STRUCTURE BIBLE ========

function buildBibleStructure() {
  bible = {};
  bookMeta = {};
  bookOrder = [];

  const seenBooks = new Set();

  for (const [key, value] of Object.entries(bibleFlat)) {
    const m = key.match(/(.+?)\s+(\d+):(\d+)$/);
    if (!m) continue;

    const rawBook = m[1];
    const chapter = Number(m[2]);
    const verse = Number(m[3]);
    const bookSlug = normalizeBookName(rawBook);

    if (!seenBooks.has(bookSlug)) {
      seenBooks.add(bookSlug);
      bookOrder.push(bookSlug);

      const ref = value.reference || "";
      const refMatch = ref.match(/^(.+?)\s+\d+:\d+$/);
      const displayName = refMatch ? refMatch[1] : capitalizeWords(rawBook);

      bible[bookSlug] = {};
      bookMeta[bookSlug] = {
        displayName,
        chapters: new Set(),
        verseCounts: {},
      };
    }

    if (!bible[bookSlug][chapter]) {
      bible[bookSlug][chapter] = {};
    }

    const meta = bookMeta[bookSlug];
    const displayName = meta.displayName;

    bible[bookSlug][chapter][verse] = {
      text: value.text || "",
      reference: value.reference || `${displayName} ${chapter}:${verse}`,
    };

    meta.chapters.add(chapter);
    const currentMax = meta.verseCounts[chapter] || 0;
    if (verse > currentMax) {
      meta.verseCounts[chapter] = verse;
    }
  }

  for (const meta of Object.values(bookMeta)) {
    meta.chapters = Array.from(meta.chapters).sort((a, b) => a - b);
  }
}

// ======== DROPDOWNS ========

function populateBookSelect() {
  clearOptions(els.bookSelect, "Select a book...");
  for (const slug of bookOrder) {
    const opt = document.createElement("option");
    opt.value = slug;
    opt.textContent = bookMeta[slug].displayName;
    els.bookSelect.appendChild(opt);
  }
}

function populateChapterSelect(bookSlug) {
  clearOptions(els.chapterSelect, "Select a chapter...");
  els.chapterSelect.disabled = true;

  if (!bookSlug || !bookMeta[bookSlug]) return;
  for (const ch of bookMeta[bookSlug].chapters) {
    const opt = document.createElement("option");
    opt.value = String(ch);
    opt.textContent = String(ch);
    els.chapterSelect.appendChild(opt);
  }
  els.chapterSelect.disabled = false;
}

function populateVerseSelect(bookSlug, chapter) {
  clearOptions(els.verseSelect, "Select a verse...");
  els.verseSelect.disabled = true;

  if (!bookSlug || !chapter || !bible[bookSlug] || !bible[bookSlug][chapter]) {
    return;
  }

  const versesObj = bible[bookSlug][chapter];
  const verseNumbers = Object.keys(versesObj)
    .map(Number)
    .sort((a, b) => a - b);

  for (const v of verseNumbers) {
    const opt = document.createElement("option");
    opt.value = String(v);
    opt.textContent = String(v);
    els.verseSelect.appendChild(opt);
  }

  els.verseSelect.disabled = false;
}

function clearOptions(selectEl, placeholderText) {
  selectEl.innerHTML = "";
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = placeholderText;
  selectEl.appendChild(placeholder);
}

// ======== DROPDOWN HANDLERS ========

function onBookChange() {
  const slug = els.bookSelect.value || null;
  currentBook = slug;
  currentChapter = null;
  currentVerse = null;
  isSearchResultsMode = false;

  populateChapterSelect(slug);
  clearOptions(els.verseSelect, "Select a verse...");
  els.verseSelect.disabled = true;
  els.versesList.innerHTML = "";
  updateVerseDisplay(null);
  updateVersesHeader();
  saveLastLocation();
}

function onChapterChange() {
  if (!currentBook) return;
  const chapter = Number(els.chapterSelect.value) || null;
  currentChapter = chapter;
  currentVerse = null;
  isSearchResultsMode = false;

  populateVerseSelect(currentBook, currentChapter);
  renderChapterVerses(currentBook, currentChapter);
  updateVerseDisplay(null);
  updateVersesHeader();

  if (chapter && bible[currentBook][chapter] && bible[currentBook][chapter][1]) {
    currentVerse = 1;
    els.verseSelect.value = "1";
    updateVerseDisplay(bible[currentBook][chapter][1]);
    highlightCurrentVerseRow(true);
  }

  saveLastLocation();
}

function onVerseChange() {
  if (!currentBook || !currentChapter) return;
  const verse = Number(els.verseSelect.value) || null;
  if (!verse) return;

  currentVerse = verse;
  const verseObj = bible[currentBook][currentChapter][currentVerse];
  updateVerseDisplay(verseObj);
  isSearchResultsMode = false;
  renderChapterVerses(currentBook, currentChapter);
  highlightCurrentVerseRow(true);

  saveLastLocation();
  pushCurrentVerseToPresenter();
}

// ======== RIGHT PANEL RENDERING ========

function renderChapterVerses(bookSlug, chapter) {
  els.versesList.innerHTML = "";
  if (!bookSlug || !chapter || !bible[bookSlug] || !bible[bookSlug][chapter]) {
    els.versesSubHeader.textContent = "Select a book and chapter to view verses.";
    return;
  }

  const versesObj = bible[bookSlug][chapter];
  const verseNumbers = Object.keys(versesObj)
    .map(Number)
    .sort((a, b) => a - b);

  for (const v of verseNumbers) {
    const verseData = versesObj[v];
    const row = document.createElement("div");
    row.className = "verse-row";
    row.dataset.book = bookSlug;
    row.dataset.chapter = String(chapter);
    row.dataset.verse = String(v);

    const num = document.createElement("div");
    num.className = "verse-row-number";
    num.textContent = v;

    const txt = document.createElement("div");
    txt.className = "verse-row-text";
    txt.textContent = verseData.text;

    row.appendChild(num);
    row.appendChild(txt);

    row.addEventListener("click", () => {
      goToVerse(bookSlug, chapter, v);
    });

    els.versesList.appendChild(row);
  }

  highlightCurrentVerseRow(false);
}

function renderSearchResults(list) {
  els.versesList.innerHTML = "";
  if (!list || list.length === 0) {
    els.versesSubHeader.textContent = "No results for that search.";
    return;
  }

  for (const item of list) {
    const row = document.createElement("div");
    row.className = "verse-row";
    row.dataset.book = item.bookSlug;
    row.dataset.chapter = String(item.chapter);
    row.dataset.verse = String(item.verse);

    const num = document.createElement("div");
    num.className = "verse-row-number";
    num.textContent = `${item.chapter}:${item.verse}`;

    const txt = document.createElement("div");
    txt.className = "verse-row-text";
    txt.textContent = `${item.reference} - ${item.text}`;

    row.appendChild(num);
    row.appendChild(txt);

    row.addEventListener("click", () => {
      isSearchResultsMode = false;
      goToVerse(item.bookSlug, item.chapter, item.verse);
    });

    els.versesList.appendChild(row);
  }
}

// highlight & auto-scroll
function highlightCurrentVerseRow(scrollIntoView = true) {
  const rows = els.versesList.querySelectorAll(".verse-row");
  rows.forEach((r) => r.classList.remove("active"));

  if (!currentBook || !currentChapter || !currentVerse) return;

  const selector = `.verse-row[data-book="${currentBook}"][data-chapter="${currentChapter}"][data-verse="${currentVerse}"]`;
  const activeRow = els.versesList.querySelector(selector);
  if (activeRow) {
    activeRow.classList.add("active");
    if (scrollIntoView) {
      activeRow.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }
}

// ======== CENTER VERSE DISPLAY ========

function updateVerseDisplay(verseData) {
  if (!verseData) {
    els.currentReference.textContent = "No verse selected";
    els.currentText.textContent =
      "Select a book, chapter, and verse from the left, or use the search dropdown above.";
    return;
  }
  els.currentReference.textContent = verseData.reference || "Verse";
  els.currentText.textContent = verseData.text || "";
}

// ======== SEARCH ========

function runSearch() {
  if (!bibleFlat) return;

  const mode = document.querySelector('input[name="searchMode"]:checked')?.value || "reference";
  const scope = els.searchScope.value || "bible";
  const query = (els.searchInput.value || "").trim();

  if (!query) return;

  if (mode === "reference") {
    if (!goToReference(query)) {
      els.statusMessage.textContent = 'Could not find reference. Try "John 3:16".';
    }
  } else {
    searchResults = keywordSearch(query, scope);
    isSearchResultsMode = true;
    els.versesHeader.textContent = "Search Results";
    els.versesSubHeader.textContent = `${searchResults.length} result(s) for "${query}"`;
    renderSearchResults(searchResults);
  }
}

function clearSearch() {
  els.searchInput.value = "";
  isSearchResultsMode = false;
  updateVersesHeader();

  if (currentBook && currentChapter) {
    renderChapterVerses(currentBook, currentChapter);
  } else {
    els.versesList.innerHTML = "";
  }
}

// reference search: "John 3:16"
function goToReference(refString) {
  const match = refString.trim().match(/(.+?)\s+(\d+):(\d+)$/i);
  if (!match) return false;

  const rawBook = match[1];
  const chapter = Number(match[2]);
  const verse = Number(match[3]);
  const bookSlug = normalizeBookName(rawBook);

  if (!bookMeta[bookSlug]) return false;
  if (!bible[bookSlug][chapter] || !bible[bookSlug][chapter][verse]) return false;

  goToVerse(bookSlug, chapter, verse);
  return true;
}

// keyword search, sorted Genesis -> Revelation
function keywordSearch(query, scope) {
  const q = query.toLowerCase();
  const results = [];

  const inBook = scope === "book" ? currentBook : null;
  const inChapter = scope === "chapter" ? currentChapter : null;

  for (const [key, value] of Object.entries(bibleFlat)) {
    if (!value || !value.text) continue;
    const textLower = value.text.toLowerCase();
    if (!textLower.includes(q)) continue;

    const m = key.match(/(.+?)\s+(\d+):(\d+)$/);
    if (!m) continue;

    const bookSlug = normalizeBookName(m[1]);
    const ch = Number(m[2]);
    const vs = Number(m[3]);

    if (inBook && bookSlug !== inBook) continue;
    if (inChapter && ch !== inChapter) continue;

    results.push({
      bookSlug,
      chapter: ch,
      verse: vs,
      reference: value.reference,
      text: value.text,
    });
  }

  results.sort((a, b) => {
    const ia = bookOrder.indexOf(a.bookSlug);
    const ib = bookOrder.indexOf(b.bookSlug);
    if (ia !== ib) return ia - ib;
    if (a.chapter !== b.chapter) return a.chapter - b.chapter;
    return a.verse - b.verse;
  });

  return results;
}

// ======== SEARCH SUGGESTIONS ========

function setupSearchSuggestions() {
  const input = els.searchInput;
  if (!input) return;

  let dataList = document.getElementById("searchSuggestions");
  if (!dataList) {
    dataList = document.createElement("datalist");
    dataList.id = "searchSuggestions";
    document.body.appendChild(dataList);
  }
  input.setAttribute("list", "searchSuggestions");

  for (const slug of bookOrder) {
    const opt = document.createElement("option");
    opt.value = bookMeta[slug].displayName;
    dataList.appendChild(opt);
  }

  const examples = ["John 3:16", "Psalm 23:1", "love", "faith", "grace"];
  for (const ex of examples) {
    const opt = document.createElement("option");
    opt.value = ex;
    dataList.appendChild(opt);
  }
}

// ======== VERSE NAV HELPERS ========

function goToVerse(bookSlug, chapter, verse) {
  currentBook = bookSlug;
  currentChapter = chapter;
  currentVerse = verse;

  els.bookSelect.value = bookSlug;
  populateChapterSelect(bookSlug);
  els.chapterSelect.value = String(chapter);
  populateVerseSelect(bookSlug, chapter);
  els.verseSelect.value = String(verse);

  updateVersesHeader();
  const verseData = bible[bookSlug][chapter][verse];
  updateVerseDisplay(verseData);

  isSearchResultsMode = false;
  renderChapterVerses(bookSlug, chapter);
  highlightCurrentVerseRow(true);

  saveLastLocation();
  pushCurrentVerseToPresenter();
}

function goToNextVerse() {
  if (!currentBook || !currentChapter || !currentVerse) return;

  const meta = bookMeta[currentBook];
  const chapterVerses = meta.verseCounts;
  let b = currentBook;
  let ch = currentChapter;
  let vs = currentVerse + 1;

  if (vs > (chapterVerses[ch] || 0)) {
    const chapters = meta.chapters;
    const idx = chapters.indexOf(ch);
    if (idx >= 0 && idx < chapters.length - 1) {
      ch = chapters[idx + 1];
      vs = 1;
    } else {
      const bIndex = bookOrder.indexOf(currentBook);
      if (bIndex >= 0 && bIndex < bookOrder.length - 1) {
        b = bookOrder[bIndex + 1];
        const bMeta = bookMeta[b];
        ch = bMeta.chapters[0];
        vs = 1;
      } else {
        return;
      }
    }
  }

  if (bible[b] && bible[b][ch] && bible[b][vs]) {
    goToVerse(b, ch, vs);
  } else if (bible[b] && bible[b][ch] && bible[b][ch][vs]) {
    goToVerse(b, ch, vs);
  }
}

function goToPrevVerse() {
  if (!currentBook || !currentChapter || !currentVerse) return;

  const meta = bookMeta[currentBook];
  const chapterVerses = meta.verseCounts;
  let b = currentBook;
  let ch = currentChapter;
  let vs = currentVerse - 1;

  if (vs <= 0) {
    const chapters = meta.chapters;
    const idx = chapters.indexOf(ch);
    if (idx > 0) {
      ch = chapters[idx - 1];
      vs = chapterVerses[ch];
    } else {
      const bIndex = bookOrder.indexOf(currentBook);
      if (bIndex > 0) {
        b = bookOrder[bIndex - 1];
        const bMeta = bookMeta[b];
        ch = bMeta.chapters[bMeta.chapters.length - 1];
        vs = bMeta.verseCounts[ch];
      } else {
        return;
      }
    }
  }

  if (bible[b] && bible[b][ch] && bible[b][ch][vs]) {
    goToVerse(b, ch, vs);
  }
}

// ======== HEADERS / STATUS ========

function updateVersesHeader() {
  if (isSearchResultsMode) {
    els.versesHeader.textContent = "Search Results";
    return;
  }
  if (!currentBook || !currentChapter) {
    els.versesHeader.textContent = "Verses";
    els.versesSubHeader.textContent =
      "Select a book and chapter to view verses.";
  } else {
    const name = bookMeta[currentBook].displayName;
    els.versesHeader.textContent = `${name} ${currentChapter}`;
    els.versesSubHeader.textContent = "Click a verse to show it.";
  }
}

// ======== FONT SIZE HELPERS ========

function applyCenterFontSize(px) {
  els.currentText.style.fontSize = px + "px";
}



// ======== PRESENTER POPUP ========

function openPresenterWindow() {
  if (!presentWindow || presentWindow.closed) {
    presentWindow = window.open("", "bible-presenter", "width=1024,height=768");
    if (!presentWindow) {
      alert("Popup blocked. Please allow popups for this site.");
      return;
    }

    const initialRef = els.currentReference.textContent || "";
    const initialText = els.currentText.textContent || "";
    const initialSize = presenterFontSizePx + "px";

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <title>Bible Presenter</title>
  <style>
    html, body {
      margin: 0;
      padding: 0;
      height: 100%;
      background: #000000;
      color: #ffffff;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    body {
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      box-sizing: border-box;
      padding: 40px;
    }
    #presentRef {
      font-size: 1rem;
      letter-spacing: 0.2em;
      text-transform: uppercase;
      color: #60a5fa;
      margin-bottom: 1.5rem;
      text-align: center;
    }
    #presentText {
      font-size: ${initialSize};
      line-height: 1.8;
      text-align: center;
      max-width: 1200px;
      white-space: pre-wrap;
    }
  </style>
</head>
<body>
  <div id="presentRef"></div>
  <div id="presentText"></div>
  <script>
    function updateVerse(data) {
      if (!data) return;
      if (data.reference !== undefined) {
        document.getElementById('presentRef').textContent = data.reference || '';
      }
      if (data.text !== undefined) {
        document.getElementById('presentText').textContent = data.text || '';
      }
      if (data.size) {
        document.getElementById('presentText').style.fontSize = data.size;
      }
    }
    window.addEventListener('message', function(evt) {
      if (!evt.data || evt.data.type !== 'verseUpdate') return;
      updateVerse(evt.data);
    });
    updateVerse(${JSON.stringify({
      reference: initialRef,
      text: initialText,
      size: initialSize,
    })});
  </script>
</body>
</html>
    `;
    presentWindow.document.open();
    presentWindow.document.write(html);
    presentWindow.document.close();
  } else {
    presentWindow.focus();
  }

  pushCurrentVerseToPresenter();
}

function pushCurrentVerseToPresenter() {
  if (!presentWindow || presentWindow.closed) return;
  const payload = {
    type: "verseUpdate",
    reference: els.currentReference.textContent || "",
    text: els.currentText.textContent || "",
    size: presenterFontSizePx + "px",
  };
  presentWindow.postMessage(payload, "*");
}

// ======== SAVE / RESTORE LAST LOCATION ========

function saveLastLocation() {
  const data = {
    book: currentBook,
    chapter: currentChapter,
    verse: currentVerse,
  };
  localStorage.setItem("bibleLastLocation", JSON.stringify(data));
}

function restoreLastLocation() {
  try {
    const raw = localStorage.getItem("bibleLastLocation");
    if (!raw) return;
    const data = JSON.parse(raw);
    if (!data || !data.book || !bible[data.book]) return;
    const ch = data.chapter;
    const vs = data.verse;
    if (!bible[data.book][ch] || !bible[data.book][ch][vs]) return;
    goToVerse(data.book, ch, vs);
  } catch (e) {
    console.warn("Could not restore last location", e);
  }
}

// ======== HELPERS ========

function normalizeBookName(name) {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

function capitalizeWords(str) {
  return str
    .split(" ")
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}


