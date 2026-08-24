// ============================================================
// ResumeLens — frontend
//
// This talks ONLY to your own FastAPI backend (see ../backend),
// which runs entirely on Groq. Your Groq API key lives server-side
// in backend/.env and is never sent to or stored in the browser.
// This file calls /api/screen, /api/shortlist, /api/insights, and
// /api/history and renders the JSON it gets back.
// ============================================================

const DEFAULTS = {
  apiBase: "http://localhost:8000",
};

// ---------- State ----------
let state = {
  files: [],
  results: [],        // array of { profile, match, starred }
  sortMode: "score",   // "score" | "name"
  loading: false,
  filters: {
    search: "",
    minScore: 0,
    shortlistOnly: false,
    hideNotFit: false,
  },
};

// ---------- Element refs ----------
const el = {
  jobDescription: document.getElementById("jobDescription"),
  dropzone: document.getElementById("dropzone"),
  fileInput: document.getElementById("fileInput"),
  fileList: document.getElementById("fileList"),
  fileCountHint: document.getElementById("fileCountHint"),
  screenBtn: document.getElementById("screenBtn"),
  screenBtnLabel: document.getElementById("screenBtnLabel"),
  screenBtnSpinner: document.getElementById("screenBtnSpinner"),
  errorBanner: document.getElementById("errorBanner"),
  emptyState: document.getElementById("emptyState"),
  noMatchState: document.getElementById("noMatchState"),
  resultsContainer: document.getElementById("resultsContainer"),
  feedActions: document.getElementById("feedActions"),
  sortBtn: document.getElementById("sortBtn"),
  exportBtn: document.getElementById("exportBtn"),
  clearBtn: document.getElementById("clearBtn"),
  themeToggle: document.getElementById("themeToggle"),
  iconSun: document.getElementById("iconSun"),
  iconMoon: document.getElementById("iconMoon"),
  settingsBtn: document.getElementById("settingsBtn"),
  settingsModal: document.getElementById("settingsModal"),
  closeSettingsBtn: document.getElementById("closeSettingsBtn"),
  saveSettingsBtn: document.getElementById("saveSettingsBtn"),
  apiBaseInput: document.getElementById("apiBaseInput"),
  modelSelect: document.getElementById("modelSelect"),
  testConnectionBtn: document.getElementById("testConnectionBtn"),
  connectionStatus: document.getElementById("connectionStatus"),
  historyBtn: document.getElementById("historyBtn"),
  historyModal: document.getElementById("historyModal"),
  closeHistoryBtn: document.getElementById("closeHistoryBtn"),
  historyContent: document.getElementById("historyContent"),
  toastContainer: document.getElementById("toastContainer"),
  filterBar: document.getElementById("filterBar"),
  searchInput: document.getElementById("searchInput"),
  thresholdSlider: document.getElementById("thresholdSlider"),
  thresholdValue: document.getElementById("thresholdValue"),
  shortlistOnlyBtn: document.getElementById("shortlistOnlyBtn"),
  hideNotFitBtn: document.getElementById("hideNotFitBtn"),
  pruneBtn: document.getElementById("pruneBtn"),
  appendHint: document.getElementById("appendHint"),
  statsBar: document.getElementById("statsBar"),
  progressBar: document.getElementById("progressBar"),
  progressBarFill: document.getElementById("progressBarFill"),
  progressBarLabel: document.getElementById("progressBarLabel"),
};

// ============================================================
// Theme (light / dark, persisted, respects system preference)
// ============================================================
function initTheme() {
  const saved = localStorage.getItem("theme");
  const systemPrefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const theme = saved || (systemPrefersDark ? "dark" : "light");
  applyTheme(theme);
}

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem("theme", theme);
  el.iconSun.style.display = theme === "dark" ? "block" : "none";
  el.iconMoon.style.display = theme === "dark" ? "none" : "block";
}

el.themeToggle.addEventListener("click", () => {
  const current = document.documentElement.getAttribute("data-theme");
  applyTheme(current === "dark" ? "light" : "dark");
});

// ============================================================
// Settings (API base URL + model override)
//
// Neither of these fields ever holds your Anthropic API key — that
// key lives only in backend/.env (see backend/llm/client.py for the
// exact line that reads it). This panel just tells the browser
// where your backend is, and which model to ask it to use.
// ============================================================
function getApiBase() {
  return localStorage.getItem("apiBase") || DEFAULTS.apiBase;
}

function getModel() {
  return localStorage.getItem("model") || "";
}

el.settingsBtn.addEventListener("click", () => {
  el.apiBaseInput.value = getApiBase();
  el.modelSelect.value = getModel();
  el.connectionStatus.textContent = "";
  el.settingsModal.style.display = "flex";
});

el.closeSettingsBtn.addEventListener("click", () => (el.settingsModal.style.display = "none"));
el.settingsModal.addEventListener("click", (e) => {
  if (e.target === el.settingsModal) el.settingsModal.style.display = "none";
});

el.saveSettingsBtn.addEventListener("click", () => {
  const value = el.apiBaseInput.value.trim().replace(/\/$/, "");
  if (value) localStorage.setItem("apiBase", value);
  localStorage.setItem("model", el.modelSelect.value);
  el.settingsModal.style.display = "none";
  showToast("Settings saved.", "success");
});

el.testConnectionBtn.addEventListener("click", async () => {
  const base = el.apiBaseInput.value.trim().replace(/\/$/, "") || DEFAULTS.apiBase;
  el.connectionStatus.textContent = "Checking…";
  try {
    const res = await fetch(`${base}/health`);
    if (res.ok) {
      el.connectionStatus.textContent = "✓ Connected — backend is reachable.";
      el.connectionStatus.style.color = "var(--score-high)";
    } else {
      throw new Error(`Status ${res.status}`);
    }
  } catch (err) {
    el.connectionStatus.textContent = `✗ Could not reach ${base}. Is the backend running?`;
    el.connectionStatus.style.color = "var(--score-low)";
  }
});

// ============================================================
// File handling (drag & drop + click to browse)
// ============================================================
el.dropzone.addEventListener("click", () => el.fileInput.click());
el.dropzone.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    el.fileInput.click();
  }
});

["dragenter", "dragover"].forEach((evt) =>
  el.dropzone.addEventListener(evt, (e) => {
    e.preventDefault();
    el.dropzone.classList.add("dragover");
  })
);

["dragleave", "drop"].forEach((evt) =>
  el.dropzone.addEventListener(evt, (e) => {
    e.preventDefault();
    el.dropzone.classList.remove("dragover");
  })
);

el.dropzone.addEventListener("drop", (e) => addFiles(e.dataTransfer.files));
el.fileInput.addEventListener("change", (e) => addFiles(e.target.files));

function addFiles(fileListLike) {
  const incoming = Array.from(fileListLike);
  const validExtensions = [".pdf", ".docx", ".txt", ".md"];
  for (const f of incoming) {
    const ext = f.name.slice(f.name.lastIndexOf(".")).toLowerCase();
    if (!validExtensions.includes(ext)) {
      showToast(`Skipped "${f.name}" — unsupported file type.`, "error");
      continue;
    }
    if (!state.files.some((existing) => existing.name === f.name && existing.size === f.size)) {
      state.files.push(f);
    }
  }
  el.fileInput.value = "";
  renderFileList();
}

function removeFile(index) {
  state.files.splice(index, 1);
  renderFileList();
}

function renderFileList() {
  el.fileList.innerHTML = "";
  state.files.forEach((file, i) => {
    const li = document.createElement("li");
    li.innerHTML = `
      <span class="file-name">${escapeHtml(file.name)}</span>
      <button class="remove-file" aria-label="Remove ${escapeHtml(file.name)}">✕</button>
    `;
    li.querySelector(".remove-file").addEventListener("click", () => removeFile(i));
    el.fileList.appendChild(li);
  });

  el.fileCountHint.textContent =
    state.files.length === 0
      ? "No files selected"
      : state.files.length === 1
      ? "1 file · single screening"
      : `${state.files.length} files · batch shortlist`;

  el.appendHint.style.display = state.files.length > 0 && state.results.length > 0 ? "block" : "none";

  updateScreenButtonState();
}

el.jobDescription.addEventListener("input", updateScreenButtonState);

function updateScreenButtonState() {
  const ready = el.jobDescription.value.trim().length > 0 && state.files.length > 0;
  el.screenBtn.disabled = !ready || state.loading;
}

// ============================================================
// Keyboard shortcut: Cmd/Ctrl+Enter runs a screening from anywhere
// on the page (as long as the form is actually ready to submit).
// ============================================================
document.addEventListener("keydown", (e) => {
  const isSubmitCombo = (e.metaKey || e.ctrlKey) && e.key === "Enter";
  if (isSubmitCombo && !el.screenBtn.disabled) {
    e.preventDefault();
    runScreening();
  }
});

// ============================================================
// Screening (calls the backend)
// ============================================================
el.screenBtn.addEventListener("click", runScreening);

async function runScreening() {
  hideError();
  setLoading(true);
  renderSkeletons(state.files.length);
  showProgress(state.files.length);

  const base = getApiBase();
  const jd = el.jobDescription.value.trim();
  const model = getModel();

  try {
    let newResults;
    if (state.files.length === 1) {
      const form = new FormData();
      form.append("job_description", jd);
      form.append("resume", state.files[0]);
      if (model) form.append("model", model);
      const res = await postForm(`${base}/api/screen`, form);
      newResults = [res];
    } else {
      const form = new FormData();
      form.append("job_description", jd);
      state.files.forEach((f) => form.append("resumes", f));
      if (model) form.append("model", model);
      const res = await postForm(`${base}/api/shortlist`, form);
      newResults = res.results;
    }

    // Append new candidates to whatever's already in the shortlist,
    // instead of replacing it - this is what lets you add resumes in
    // multiple batches against the same job description and build up
    // one running shortlist, rather than losing earlier results.
    const tagged = newResults.map((r) => ({ ...r, starred: false }));
    state.results = [...state.results, ...tagged];
    applySort();
    persistResults();

    // Clear the file queue now that these have been screened, so the
    // dropzone is ready for the next batch without re-screening the same files.
    state.files = [];
    renderFileList();
    renderResults();

    showToast(
      `Screened ${newResults.length} candidate${newResults.length === 1 ? "" : "s"}` +
        (state.results.length > tagged.length ? ` · ${state.results.length} total in shortlist.` : "."),
      "success"
    );
  } catch (err) {
    showError(err.message || "Something went wrong while screening. Check your backend connection in Settings.");
    // Re-render whatever was already in the shortlist before this failed
    // attempt - a failed request should never wipe out prior results.
    renderResults();
  } finally {
    setLoading(false);
    hideProgress();
  }
}

async function postForm(url, form) {
  let res;
  try {
    res = await fetch(url, { method: "POST", body: form });
  } catch (networkErr) {
    throw new Error(`Could not reach the backend at ${url}. Is it running? Check Settings.`);
  }
  if (!res.ok) {
    let detail = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body.detail) detail = body.detail;
    } catch (_) {
      /* ignore parse errors, use default message */
    }
    throw new Error(detail);
  }
  return res.json();
}

function setLoading(isLoading) {
  state.loading = isLoading;
  el.screenBtnLabel.textContent = isLoading ? "Screening…" : "Screen candidates";
  el.screenBtnSpinner.style.display = isLoading ? "block" : "none";
  updateScreenButtonState();
}

function showError(msg) {
  el.errorBanner.textContent = msg;
  el.errorBanner.style.display = "block";
}

function hideError() {
  el.errorBanner.style.display = "none";
}

// ============================================================
// Batch progress indicator
//
// The backend processes a batch as one HTTP request, so we don't get
// real per-file progress events from it — this is an honest activity
// indicator ("working on N candidates"), not a precise progress bar.
// ============================================================
function showProgress(fileCount) {
  el.progressBar.style.display = "block";
  el.progressBarFill.style.width = "12%";
  el.progressBarLabel.textContent =
    fileCount > 1 ? `Screening ${fileCount} candidates…` : "Screening candidate…";
  // Animate toward ~90% while waiting; the fetch resolving jumps it to 100%.
  clearInterval(window.__progressTimer);
  window.__progressTimer = setInterval(() => {
    const current = parseFloat(el.progressBarFill.style.width) || 0;
    if (current < 88) el.progressBarFill.style.width = `${current + (88 - current) * 0.15}%`;
  }, 400);
}

function hideProgress() {
  clearInterval(window.__progressTimer);
  el.progressBarFill.style.width = "100%";
  setTimeout(() => {
    el.progressBar.style.display = "none";
    el.progressBarFill.style.width = "0%";
  }, 250);
}

// ============================================================
// Rendering: skeleton loaders
// ============================================================
function renderSkeletons(count) {
  el.emptyState.style.display = "none";
  el.noMatchState.style.display = "none";
  el.feedActions.style.display = "none";
  el.filterBar.style.display = "none";
  el.statsBar.style.display = "none";
  const n = Math.max(count, 1);
  el.resultsContainer.innerHTML = Array.from({ length: n })
    .map(
      () => `
      <div class="card skeleton-card">
        <div class="skeleton skeleton-dial"></div>
        <div class="skeleton-lines">
          <div class="skeleton skeleton-line"></div>
          <div class="skeleton skeleton-line short"></div>
        </div>
      </div>`
    )
    .join("");
}

// ============================================================
// Rendering: result cards
// ============================================================
function scoreBand(score) {
  if (score >= 8) return { key: "high", color: "var(--score-high)", bg: "var(--score-high-bg)" };
  if (score >= 5) return { key: "mid", color: "var(--score-mid)", bg: "var(--score-mid-bg)" };
  return { key: "low", color: "var(--score-low)", bg: "var(--score-low-bg)" };
}

function recBadgeClass(recommendation) {
  if (recommendation === "Proceed") return "rec-proceed";
  if (recommendation === "Not a fit") return "rec-not-a-fit";
  return "rec-consider";
}

function dialSvg(score, uid) {
  const radius = 22;
  const circumference = 2 * Math.PI * radius;
  const fraction = Math.max(0, Math.min(10, score)) / 10;
  const dash = circumference * fraction;
  const band = scoreBand(score);
  const gradId = `dialGrad-${uid}`;
  return `
    <svg viewBox="0 0 56 56" width="56" height="56">
      <defs>
        <linearGradient id="${gradId}" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="${band.color}" />
          <stop offset="100%" stop-color="var(--score-${band.key}-alt)" />
        </linearGradient>
      </defs>
      <circle class="card-dial-track" cx="28" cy="28" r="${radius}"></circle>
      <circle class="card-dial-fill" cx="28" cy="28" r="${radius}"
        stroke="url(#${gradId})"
        stroke-dasharray="${dash.toFixed(2)} ${circumference.toFixed(2)}"></circle>
    </svg>
    <div class="card-dial-number" style="color:${band.color}">${score}</div>
  `;
}

function getFilteredResults() {
  const { search, minScore, shortlistOnly, hideNotFit } = state.filters;
  const term = search.trim().toLowerCase();

  return state.results.filter((r) => {
    if (shortlistOnly && !r.starred) return false;
    if (hideNotFit && r.match.recommendation === "Not a fit") return false;
    if (r.match.score < minScore) return false;
    if (!term) return true;

    const name = (r.match.candidate_name || r.profile.name || "").toLowerCase();
    const allSkills = (r.profile.skills || []).join(" ").toLowerCase();
    return name.includes(term) || allSkills.includes(term);
  });
}

function renderStatsBar(filtered) {
  if (!state.results.length) {
    el.statsBar.style.display = "none";
    return;
  }
  el.statsBar.style.display = "flex";

  const scores = state.results.map((r) => r.match.score);
  const avg = (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1);
  const top = [...state.results].sort((a, b) => b.match.score - a.match.score)[0];
  const topName = top.match.candidate_name || top.profile.name || "—";
  const starredCount = state.results.filter((r) => r.starred).length;
  const notFitCount = state.results.filter((r) => r.match.recommendation === "Not a fit").length;

  el.statsBar.innerHTML = `
    <div class="stats-hero-main">
      <span class="stats-hero-eyebrow">Screening summary</span>
      <h3 class="stats-hero-title">${escapeHtml(topName)} leads the pack — ${top.match.score}/10</h3>
    </div>
    <div class="stats-hero-chips">
      <div class="stat-chip"><span class="stat-chip-value">${state.results.length}</span><span class="stat-chip-label">Screened</span></div>
      <div class="stat-chip"><span class="stat-chip-value">${avg}</span><span class="stat-chip-label">Avg score</span></div>
      <div class="stat-chip"><span class="stat-chip-value">${starredCount}</span><span class="stat-chip-label">Shortlisted</span></div>
      <div class="stat-chip"><span class="stat-chip-value">${notFitCount}</span><span class="stat-chip-label">Not a fit</span></div>
      <div class="stat-chip"><span class="stat-chip-value">${filtered.length}</span><span class="stat-chip-label">Showing</span></div>
    </div>
  `;
}

function renderResults() {
  const hasAnyResults = state.results.length > 0;
  const filtered = getFilteredResults();

  el.feedActions.style.display = hasAnyResults ? "flex" : "none";
  el.filterBar.style.display = hasAnyResults ? "flex" : "none";
  renderStatsBar(filtered);

  el.emptyState.style.display = hasAnyResults ? "none" : "flex";
  el.noMatchState.style.display = hasAnyResults && filtered.length === 0 ? "flex" : "none";

  el.resultsContainer.innerHTML = filtered.map((r) => renderCard(r)).join("");

  // Wire up per-card interactions after render (expand, star, copy).
  filtered.forEach((r) => {
    const idx = state.results.indexOf(r);
    const expandBtn = document.getElementById(`expand-btn-${idx}`);
    const details = document.getElementById(`details-${idx}`);
    expandBtn.addEventListener("click", () => {
      const isOpen = details.classList.toggle("open");
      expandBtn.classList.toggle("open", isOpen);
    });

    const starBtn = document.getElementById(`star-btn-${idx}`);
    starBtn.addEventListener("click", () => {
      state.results[idx].starred = !state.results[idx].starred;
      persistResults();
      renderResults();
    });

    const copyBtn = document.getElementById(`copy-btn-${idx}`);
    copyBtn.addEventListener("click", () => copyCardSummary(r));
  });
}

function copyCardSummary(result) {
  const { profile, match } = result;
  const name = match.candidate_name || profile.name || "Unnamed candidate";
  const text = [
    `${name} — ${match.score}/10`,
    `Matched: ${(match.matched_skills || []).join(", ") || "none"}`,
    `Missing: ${(match.missing_skills || []).join(", ") || "none"}`,
    "",
    match.justification,
  ].join("\n");

  navigator.clipboard
    .writeText(text)
    .then(() => showToast("Summary copied to clipboard.", "success"))
    .catch(() => showToast("Could not copy — your browser may be blocking clipboard access.", "error"));
}

function renderCard(result) {
  const index = state.results.indexOf(result);
  const { profile, match, starred } = result;
  const name = match.candidate_name || profile.name || "Unnamed candidate";
  const experience =
    profile.total_experience_years != null ? `${profile.total_experience_years} yrs experience` : "Experience unclear";

  const matchedChips = (match.matched_skills || [])
    .map((s) => `<span class="chip chip-matched">${escapeHtml(s)}</span>`)
    .join("");
  const missingChips = (match.missing_skills || [])
    .map((s) => `<span class="chip chip-missing">${escapeHtml(s)}</span>`)
    .join("");

  const educationRows = (profile.education || [])
    .map((e) => `${escapeHtml(e.degree)}${e.field ? " in " + escapeHtml(e.field) : ""}${e.institution ? " — " + escapeHtml(e.institution) : ""}`)
    .join("<br>") || "—";

  const roleRows = (profile.roles || [])
    .map((r) => `${escapeHtml(r.title)} at ${escapeHtml(r.company)}${r.duration ? " (" + escapeHtml(r.duration) + ")" : ""}`)
    .join("<br>") || "—";

  const lowConfidence = (profile.low_confidence_fields || []).length
    ? `<div class="low-confidence-tag">⚠ Low confidence: ${profile.low_confidence_fields.map(escapeHtml).join(", ")}</div>`
    : "";

  const strengthsList = (match.strengths || []).length
    ? `<ul>${match.strengths.map((s) => `<li>${escapeHtml(s)}</li>`).join("")}</ul>`
    : `<p class="empty-note">None noted.</p>`;

  const concernsList = (match.concerns || []).length
    ? `<ul>${match.concerns.map((s) => `<li>${escapeHtml(s)}</li>`).join("")}</ul>`
    : `<p class="empty-note">None noted.</p>`;

  const recommendation = match.recommendation || "Consider";

  return `
    <article class="card">
      <div class="card-top">
        <div class="card-dial">${dialSvg(match.score, index)}</div>
        <div class="card-identity">
          <p class="card-name">${escapeHtml(name)}</p>
          <p class="card-meta">${escapeHtml(experience)}</p>
        </div>
        <span class="rec-badge ${recBadgeClass(recommendation)}">${escapeHtml(recommendation)}</span>
        <button id="star-btn-${index}" class="card-star-btn ${starred ? "starred" : ""}" aria-label="${starred ? "Remove from shortlist" : "Add to shortlist"}" aria-pressed="${starred}">${starred ? "★" : "☆"}</button>
        <button id="copy-btn-${index}" class="card-expand-btn" aria-label="Copy candidate summary" title="Copy summary">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
        </button>
        <button id="expand-btn-${index}" class="card-expand-btn" aria-label="Expand candidate details">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
      </div>
      <div class="card-body">
        <div class="skill-row">${matchedChips}${missingChips}</div>
        <p class="justification">${escapeHtml(match.justification)}</p>
      </div>
      <div id="details-${index}" class="card-details">
        <div class="insight-cols">
          <div class="insight-col strengths">
            <h4>Why they fit</h4>
            ${strengthsList}
          </div>
          <div class="insight-col concerns">
            <h4>Watch-outs</h4>
            ${concernsList}
          </div>
        </div>
        <div class="detail-row"><span class="detail-label">Education</span><span>${educationRows}</span></div>
        <div class="detail-row"><span class="detail-label">Roles</span><span>${roleRows}</span></div>
        <div class="detail-row"><span class="detail-label">All skills</span><span>${(profile.skills || []).map(escapeHtml).join(", ") || "—"}</span></div>
        ${lowConfidence}
      </div>
    </article>
  `;
}

// ============================================================
// Filters (search, min-score threshold, shortlist-only)
// ============================================================
el.searchInput.addEventListener("input", (e) => {
  state.filters.search = e.target.value;
  renderResults();
});

el.thresholdSlider.addEventListener("input", (e) => {
  state.filters.minScore = Number(e.target.value);
  el.thresholdValue.textContent = e.target.value;
  renderResults();
});

el.shortlistOnlyBtn.addEventListener("click", () => {
  state.filters.shortlistOnly = !state.filters.shortlistOnly;
  el.shortlistOnlyBtn.classList.toggle("active", state.filters.shortlistOnly);
  el.shortlistOnlyBtn.setAttribute("aria-pressed", String(state.filters.shortlistOnly));
  renderResults();
});

el.hideNotFitBtn.addEventListener("click", () => {
  state.filters.hideNotFit = !state.filters.hideNotFit;
  el.hideNotFitBtn.classList.toggle("active", state.filters.hideNotFit);
  el.hideNotFitBtn.setAttribute("aria-pressed", String(state.filters.hideNotFit));
  renderResults();
});

el.pruneBtn.addEventListener("click", () => {
  const before = state.results.length;
  state.results = state.results.filter((r) => r.match.recommendation !== "Not a fit");
  const removed = before - state.results.length;
  if (removed === 0) {
    showToast("No candidates marked \u201cNot a fit\u201d to remove.", "info");
    return;
  }
  persistResults();
  renderResults();
  showToast(`Removed ${removed} candidate${removed === 1 ? "" : "s"} marked "Not a fit".`, "success");
});

// ============================================================
// Sort / export / clear
// ============================================================
el.sortBtn.addEventListener("click", () => {
  state.sortMode = state.sortMode === "score" ? "name" : "score";
  el.sortBtn.textContent = state.sortMode === "score" ? "Sort: Score ↓" : "Sort: Name A–Z";
  applySort();
  renderResults();
});

function applySort() {
  if (state.sortMode === "score") {
    state.results.sort((a, b) => b.match.score - a.match.score);
  } else {
    state.results.sort((a, b) => {
      const nameA = (a.match.candidate_name || a.profile.name || "").toLowerCase();
      const nameB = (b.match.candidate_name || b.profile.name || "").toLowerCase();
      return nameA.localeCompare(nameB);
    });
  }
}

el.exportBtn.addEventListener("click", () => {
  const filtered = getFilteredResults();
  if (!filtered.length) return;
  const rows = [
    ["Name", "Score", "Recommendation", "Shortlisted", "Matched Skills", "Missing Skills", "Experience (yrs)", "Justification"],
    ...filtered.map((r) => [
      r.match.candidate_name || r.profile.name || "",
      r.match.score,
      r.match.recommendation || "",
      r.starred ? "Yes" : "No",
      (r.match.matched_skills || []).join("; "),
      (r.match.missing_skills || []).join("; "),
      r.profile.total_experience_years ?? "",
      r.match.justification.replace(/"/g, '""'),
    ]),
  ];
  const csv = rows.map((row) => row.map((cell) => `"${cell}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "resume-screening-shortlist.csv";
  a.click();
  URL.revokeObjectURL(url);
  showToast("Shortlist exported as CSV.", "success");
});

el.clearBtn.addEventListener("click", () => {
  state.results = [];
  state.filters = { search: "", minScore: 0, shortlistOnly: false, hideNotFit: false };
  el.searchInput.value = "";
  el.thresholdSlider.value = 0;
  el.thresholdValue.textContent = "0";
  el.shortlistOnlyBtn.classList.remove("active");
  el.hideNotFitBtn.classList.remove("active");
  persistResults();
  renderResults();
});

// ============================================================
// Session persistence (results survive a page refresh)
// ============================================================
function persistResults() {
  try {
    localStorage.setItem("lastResults", JSON.stringify(state.results));
  } catch (_) {
    /* localStorage can fail in private browsing; not critical to recover */
  }
}

function restoreResults() {
  try {
    const raw = localStorage.getItem("lastResults");
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length) {
      state.results = parsed.map((r) => ({ ...r, starred: !!r.starred }));
      applySort();
    }
  } catch (_) {
    /* ignore corrupt storage */
  }
}

// ============================================================
// History modal
// ============================================================
el.historyBtn.addEventListener("click", async () => {
  el.historyModal.style.display = "flex";
  el.historyContent.textContent = "Loading…";
  try {
    const res = await fetch(`${getApiBase()}/api/history`);
    if (!res.ok) throw new Error();
    const records = await res.json();
    if (!records.length) {
      el.historyContent.innerHTML = `<p style="color:var(--ink-muted); font-size:13.5px;">No screenings recorded yet.</p>`;
      return;
    }
    el.historyContent.innerHTML = records
      .map((r) => {
        const band = scoreBand(r.score);
        const date = r.created_at ? new Date(r.created_at).toLocaleString() : "";
        return `
        <div class="history-row">
          <span>${escapeHtml(r.candidate_name || r.resume_filename)}</span>
          <span style="color:var(--ink-faint); font-size:12px;">${date}</span>
          <span class="history-score" style="color:${band.color}">${r.score}</span>
        </div>`;
      })
      .join("");
  } catch (_) {
    el.historyContent.innerHTML = `<p style="color:var(--score-low); font-size:13.5px;">Could not load history. Check your backend connection in Settings.</p>`;
  }
});

el.closeHistoryBtn.addEventListener("click", () => (el.historyModal.style.display = "none"));
el.historyModal.addEventListener("click", (e) => {
  if (e.target === el.historyModal) el.historyModal.style.display = "none";
});

// ============================================================
// Toasts
// ============================================================
function showToast(message, kind = "info") {
  const toast = document.createElement("div");
  toast.className = `toast ${kind === "error" ? "toast-error" : kind === "success" ? "toast-success" : ""}`;
  toast.textContent = message;
  el.toastContainer.appendChild(toast);
  setTimeout(() => toast.remove(), 3500);
}

// ============================================================
// Utilities
// ============================================================
function escapeHtml(str) {
  if (str == null) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Restore last-used job description between sessions, as a convenience.
window.addEventListener("beforeunload", () => {
  localStorage.setItem("lastJobDescription", el.jobDescription.value);
});

// ============================================================
// Tab switching: Screen Candidates <-> Resume Insights
// ============================================================
const tabScreenBtn = document.getElementById("tabScreenBtn");
const tabInsightsBtn = document.getElementById("tabInsightsBtn");
const screenView = document.getElementById("screenView");
const insightsView = document.getElementById("insightsView");

function activateTab(tab) {
  const isScreen = tab === "screen";
  screenView.style.display = isScreen ? "" : "none";
  insightsView.style.display = isScreen ? "none" : "";
  tabScreenBtn.classList.toggle("active", isScreen);
  tabInsightsBtn.classList.toggle("active", !isScreen);
  tabScreenBtn.setAttribute("aria-selected", String(isScreen));
  tabInsightsBtn.setAttribute("aria-selected", String(!isScreen));
}

tabScreenBtn.addEventListener("click", () => activateTab("screen"));
tabInsightsBtn.addEventListener("click", () => activateTab("insights"));

// ============================================================
// Resume Insights: standalone resume feedback (no job description)
// ============================================================
const insightsEl = {
  dropzone: document.getElementById("insightsDropzone"),
  fileInput: document.getElementById("insightsFileInput"),
  fileList: document.getElementById("insightsFileList"),
  fileHint: document.getElementById("insightsFileHint"),
  btn: document.getElementById("insightsBtn"),
  btnLabel: document.getElementById("insightsBtnLabel"),
  btnSpinner: document.getElementById("insightsBtnSpinner"),
  errorBanner: document.getElementById("insightsErrorBanner"),
  emptyState: document.getElementById("insightsEmptyState"),
  resultContainer: document.getElementById("insightsResultContainer"),
};

let insightsFile = null;

insightsEl.dropzone.addEventListener("click", () => insightsEl.fileInput.click());
insightsEl.dropzone.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    insightsEl.fileInput.click();
  }
});
["dragenter", "dragover"].forEach((evt) =>
  insightsEl.dropzone.addEventListener(evt, (e) => {
    e.preventDefault();
    insightsEl.dropzone.classList.add("dragover");
  })
);
["dragleave", "drop"].forEach((evt) =>
  insightsEl.dropzone.addEventListener(evt, (e) => {
    e.preventDefault();
    insightsEl.dropzone.classList.remove("dragover");
  })
);
insightsEl.dropzone.addEventListener("drop", (e) => setInsightsFile(e.dataTransfer.files[0]));
insightsEl.fileInput.addEventListener("change", (e) => setInsightsFile(e.target.files[0]));

function setInsightsFile(file) {
  if (!file) return;
  const validExtensions = [".pdf", ".docx", ".txt", ".md"];
  const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
  if (!validExtensions.includes(ext)) {
    showToast(`"${file.name}" is an unsupported file type.`, "error");
    return;
  }
  insightsFile = file;
  insightsEl.fileList.innerHTML = `
    <li>
      <span class="file-name">${escapeHtml(file.name)}</span>
      <button class="remove-file" aria-label="Remove file">✕</button>
    </li>`;
  insightsEl.fileList.querySelector(".remove-file").addEventListener("click", () => {
    insightsFile = null;
    insightsEl.fileList.innerHTML = "";
    insightsEl.fileHint.textContent = "No file selected";
    insightsEl.btn.disabled = true;
  });
  insightsEl.fileHint.textContent = "1 file selected";
  insightsEl.btn.disabled = false;
}

insightsEl.btn.addEventListener("click", runInsights);

async function runInsights() {
  insightsEl.errorBanner.style.display = "none";
  insightsEl.btnLabel.textContent = "Analyzing…";
  insightsEl.btnSpinner.style.display = "block";
  insightsEl.btn.disabled = true;
  insightsEl.emptyState.style.display = "none";
  insightsEl.resultContainer.innerHTML = `
    <div class="card skeleton-card">
      <div class="skeleton skeleton-dial"></div>
      <div class="skeleton-lines">
        <div class="skeleton skeleton-line"></div>
        <div class="skeleton skeleton-line short"></div>
      </div>
    </div>`;

  const base = getApiBase();
  const model = getModel();

  try {
    const form = new FormData();
    form.append("resume", insightsFile);
    if (model) form.append("model", model);
    const res = await postForm(`${base}/api/insights`, form);
    renderInsights(res);
    showToast("Resume analysis complete.", "success");
  } catch (err) {
    insightsEl.resultContainer.innerHTML = "";
    insightsEl.emptyState.style.display = "flex";
    insightsEl.errorBanner.textContent =
      err.message || "Something went wrong while analyzing. Check your backend connection in Settings.";
    insightsEl.errorBanner.style.display = "block";
  } finally {
    insightsEl.btnLabel.textContent = "Analyze my resume";
    insightsEl.btnSpinner.style.display = "none";
    insightsEl.btn.disabled = false;
  }
}

function insightsScoreBand(score) {
  if (score >= 8) return { color: "var(--score-high)", bg: "var(--score-high-bg)" };
  if (score >= 5) return { color: "var(--score-mid)", bg: "var(--score-mid-bg)" };
  return { color: "var(--score-low)", bg: "var(--score-low-bg)" };
}

function renderInsights(result) {
  const { profile, insights } = result;
  const name = profile.name || "Your resume";
  const overallBand = insightsScoreBand(insights.overall_score);
  const atsBand = insightsScoreBand(insights.ats_friendliness);

  const bulletList = (items, emptyText) =>
    (items || []).length
      ? `<ul>${items.map((s) => `<li>${escapeHtml(s)}</li>`).join("")}</ul>`
      : `<p class="empty-note">${emptyText}</p>`;

  const keywordChips = (insights.keyword_suggestions || [])
    .map((k) => `<span class="chip chip-suggestion">${escapeHtml(k)}</span>`)
    .join("");

  const rewriteCards = (insights.rewrite_suggestions || [])
    .map((s) => `<div class="rewrite-card">${escapeHtml(s)}</div>`)
    .join("");

  insightsEl.resultContainer.innerHTML = `
    <article class="card insights-card">
      <div class="insights-scores">
        <div class="insights-score-block">
          <div class="insights-score-ring" style="background: conic-gradient(${overallBand.color} ${insights.overall_score * 36}deg, var(--line) 0deg);">
            <div class="insights-score-ring-inner" style="color:${overallBand.color}">${insights.overall_score}</div>
          </div>
          <span class="insights-score-label">Overall quality</span>
        </div>
        <div class="insights-score-block">
          <div class="insights-score-ring" style="background: conic-gradient(${atsBand.color} ${insights.ats_friendliness * 36}deg, var(--line) 0deg);">
            <div class="insights-score-ring-inner" style="color:${atsBand.color}">${insights.ats_friendliness}</div>
          </div>
          <span class="insights-score-label">ATS friendliness</span>
        </div>
        <div class="insights-summary-block">
          <p class="card-name">${escapeHtml(name)}</p>
          <p class="justification">${escapeHtml(insights.summary)}</p>
        </div>
      </div>

      <div class="insight-cols">
        <div class="insight-col strengths">
          <h4>What's working</h4>
          ${bulletList(insights.strengths, "Nothing specific noted.")}
        </div>
        <div class="insight-col concerns">
          <h4>What to fix</h4>
          ${bulletList(insights.weaknesses, "No major issues noted.")}
        </div>
      </div>

      ${
        insights.missing_sections && insights.missing_sections.length
          ? `<div class="detail-row"><span class="detail-label">Missing</span><span>${insights.missing_sections.map(escapeHtml).join(", ")}</span></div>`
          : ""
      }

      ${
        keywordChips
          ? `<div class="rail-block" style="margin-top:14px;">
               <h4 class="insights-subhead">Keywords to consider</h4>
               <div class="skill-row">${keywordChips}</div>
             </div>`
          : ""
      }

      ${
        rewriteCards
          ? `<div class="rail-block" style="margin-top:14px;">
               <h4 class="insights-subhead">Suggested rewrites</h4>
               ${rewriteCards}
             </div>`
          : ""
      }
    </article>
  `;
}

// ============================================================
// Init
// ============================================================
initTheme();
renderFileList();
restoreResults();
renderResults();

const savedJd = localStorage.getItem("lastJobDescription");
if (savedJd) el.jobDescription.value = savedJd;
