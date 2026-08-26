const DB_NAME = "autoentretien_pro_db";
const DB_VERSION = 1;

let db = null;
let APP_DB = null;
let isAdmin = false;
let aiEnrichRunning = false;

let selected = {
  origin: "all",
  brand: "",
  model: "",
  engine: "",
  year: ""
};

document.addEventListener("DOMContentLoaded", init);

async function init() {
  await openDB();

  APP_DB = await loadInitialDatabase();

  await loadBackground();

  populateOrigins();
  populateBrands("all");
  updateStatus();

  document.getElementById("brandSelect").addEventListener("change", onBrandChange);
  document.getElementById("modelSelect").addEventListener("change", onModelChange);
  document.getElementById("engineSelect").addEventListener("change", onEngineChange);
  document.getElementById("yearSelect").addEventListener("change", onYearChange);

  window.addEventListener("online", updateStatus);
  window.addEventListener("offline", updateStatus);

  await loadAdminSettings();
  await maybeAutoEnrich();

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(console.error);
  }
}

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const database = event.target.result;

      if (!database.objectStoreNames.contains("settings")) {
        database.createObjectStore("settings");
      }
    };

    request.onsuccess = (event) => {
      db = event.target.result;
      resolve(db);
    };

    request.onerror = (event) => reject(event);
  });
}

function dbPut(store, key, value) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    tx.objectStore(store).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = (event) => reject(event);
  });
}

function dbGet(store, key) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readonly");
    const request = tx.objectStore(store).get(key);
    request.onsuccess = () => resolve(request.result === undefined ? null : request.result);
    request.onerror = (event) => reject(event);
  });
}

async function getAISettings() {
  const stored = (await dbGet("settings", "ai_settings")) || {};

  const legacyKey = await dbGet("settings", "ai_api_key");
  const legacyModel = await dbGet("settings", "ai_model");
  const legacyRemote = await dbGet("settings", "remote_db_url");

  return {
    apiKey: stored.apiKey ?? legacyKey ?? "",
    model: stored.model ?? legacyModel ?? APP_CONFIG.defaultGeminiModel,
    remoteDbUrl: stored.remoteDbUrl ?? legacyRemote ?? APP_CONFIG.defaultRemoteDbUrl,
    autoEnrichOnOpen: stored.autoEnrichOnOpen ?? "off",
    autoLoadGenerated: stored.autoLoadGenerated ?? "if_empty",
    maxPerSession: Number(stored.maxPerSession ?? 10),
    delayMs: Number(stored.delayMs ?? 2500)
  };
}

async function saveAISettings() {
  const settings = {
    apiKey: inputValue("aiKey", "").trim(),
    model: inputValue("aiModel", APP_CONFIG.defaultGeminiModel).trim(),
    remoteDbUrl: inputValue("remoteDbUrl", "").trim(),
    autoEnrichOnOpen: inputValue("autoEnrichOnOpen", "off"),
    autoLoadGenerated: inputValue("autoLoadGenerated", "if_empty"),
    maxPerSession: inputNumber("aiMaxPerSession", 10),
    delayMs: inputNumber("aiDelayMs", 2500)
  };

  await dbPut("settings", "ai_settings", settings);

  await dbPut("settings", "ai_api_key", settings.apiKey);
  await dbPut("settings", "ai_model", settings.model);
  await dbPut("settings", "remote_db_url", settings.remoteDbUrl);

  adminOutput("Réglages enregistrés.");
}

async function loadAdminSettings() {
  const settings = await getAISettings();

  setInputValue("aiKey", settings.apiKey);
  setInputValue("aiModel", settings.model);
  setInputValue("remoteDbUrl", settings.remoteDbUrl);
  setInputValue("autoEnrichOnOpen", settings.autoEnrichOnOpen);
  setInputValue("autoLoadGenerated", settings.autoLoadGenerated);
  setInputValue("aiMaxPerSession", settings.maxPerSession);
  setInputValue("aiDelayMs", settings.delayMs);
}

function inputValue(id, fallback = "") {
  const el = document.getElementById(id);
  return el ? el.value : fallback;
}

function inputNumber(id, fallback = 0) {
  const el = document.getElementById(id);
  const n = Number(el?.value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function setInputValue(id, value) {
  const el = document.getElementById(id);
  if (el) el.value = value;
}

async function loadInitialDatabase() {
  const settings = await getAISettings();
  const local = await dbGet("settings", "database");

  if (settings.autoLoadGenerated === "always") {
    const generated = await fetchJSON("./database.generated.json");

    if (generated && validateDatabase(generated).length === 0) {
      await dbPut("settings", "database", generated);
      adminOutput("Base générée chargée.");
      return generated;
    }
  }

  if (!local && settings.autoLoadGenerated !== "off") {
    const generated = await fetchJSON("./database.generated.json");

    if (generated && validateDatabase(generated).length === 0) {
      await dbPut("settings", "database", generated);
      adminOutput("Base générée chargée car base locale vide.");
      return generated;
    }
  }

  return local || DEFAULT_DB;
}

async function fetchJSON(url) {
  try {
    const response = await fetch(url, { cache: "no-cache" });

    if (!response.ok) {
      return null;
    }

    return await response.json();
  } catch (error) {
    return null;
  }
}

async function maybeAutoEnrich() {
  const settings = await getAISettings();

  if (settings.autoEnrichOnOpen === "off") return;
  if (!settings.apiKey) return;
  if (!navigator.onLine) return;

  adminOutput("Complétion automatique Gemini démarrée...");
  startGeminiEnrichment(settings.autoEnrichOnOpen, { silent: true });
}

function updateStatus() {
  const el = document.getElementById("status");

  if (navigator.onLine) {
    el.innerHTML = '<span class="online">● EN LIGNE</span> — connexion 4G/5G/WiFi active';
  } else {
    el.innerHTML = '<span class="offline">● HORS LIGNE</span> — données locales utilisées';
  }
}

async function loadBackground() {
  const bg = await dbGet("settings", "background");

  if (bg) {
    document.body.style.backgroundImage = `url(${bg})`;
  }
}

async function uploadBackground(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();

  reader.onload = async (e) => {
    await dbPut("settings", "background", e.target.result);
    document.body.style.backgroundImage = `url(${e.target.result})`;
    adminOutput("Fond d'écran enregistré.");
  };

  reader.readAsDataURL(file);
  event.target.value = "";
}

function populateOrigins() {
  const container = document.getElementById("originBadges");
  container.innerHTML = "";

  const all = document.createElement("span");
  all.className = "badge active";
  all.textContent = "Toutes";
  all.addEventListener("click", (e) => onOriginClick(e, "all"));
  container.appendChild(all);

  const origins = [...new Set((APP_DB.brands || []).map((b) => b.origin))].sort();

  origins.forEach((origin) => {
    const badge = document.createElement("span");
    badge.className = "badge";
    badge.textContent = origin;
    badge.addEventListener("click", (e) => onOriginClick(e, origin));
    container.appendChild(badge);
  });
}

function onOriginClick(event, origin) {
  document.querySelectorAll("#originBadges .badge").forEach((b) => b.classList.remove("active"));
  event.currentTarget.classList.add("active");
  selected.origin = origin;
  populateBrands(origin);
}

function resetSelect(id, placeholder) {
  const el = document.getElementById(id);
  el.innerHTML = `<option value="">${placeholder}</option>`;
}

function populateBrands(origin = "all") {
  selected.brand = "";
  selected.model = "";
  selected.engine = "";
  selected.year = "";

  resetSelect("modelSelect", "-- Choisir un modèle --");
  resetSelect("engineSelect", "-- Choisir une motorisation --");
  resetSelect("yearSelect", "-- Choisir une année --");
  document.getElementById("result").innerHTML = "";

  const select = document.getElementById("brandSelect");
  select.innerHTML = '<option value="">-- Choisir une marque --</option>';

  (APP_DB.brands || [])
    .filter((brand) => origin === "all" || brand.origin === origin)
    .sort((a, b) => a.name.localeCompare(b.name))
    .forEach((brand) => {
      const option = document.createElement("option");
      option.value = brand.id;
      option.textContent = `${brand.name} (${brand.origin})`;
      select.appendChild(option);
    });
}

function onBrandChange(event) {
  selected.brand = event.target.value;
  selected.model = "";
  selected.engine = "";
  selected.year = "";

  populateModels();
}

function populateModels() {
  resetSelect("engineSelect", "-- Choisir une motorisation --");
  resetSelect("yearSelect", "-- Choisir une année --");
  document.getElementById("result").innerHTML = "";

  const select = document.getElementById("modelSelect");
  select.innerHTML = '<option value="">-- Choisir un modèle --</option>';

  if (!selected.brand) return;

  (APP_DB.models || [])
    .filter((model) => model.brand_id === selected.brand)
    .sort((a, b) => a.name.localeCompare(b.name))
    .forEach((model) => {
      const option = document.createElement("option");
      option.value = model.id;
      option.textContent = model.name;
      select.appendChild(option);
    });
}

function onModelChange(event) {
  selected.model = event.target.value;
  selected.engine = "";
  selected.year = "";

  populateEngines();
}

function populateEngines() {
  resetSelect("yearSelect", "-- Choisir une année --");
  document.getElementById("result").innerHTML = "";

  const select = document.getElementById("engineSelect");
  select.innerHTML = '<option value="">-- Choisir une motorisation --</option>';

  if (!selected.model) return;

  (APP_DB.engines || [])
    .filter((engine) => engine.model_id === selected.model)
    .sort((a, b) => String(a.code).localeCompare(String(b.code)))
    .forEach((engine) => {
      const option = document.createElement("option");
      option.value = engine.id;
      option.textContent = `${engine.code} — ${engine.power_ps ?? "?"} ch (${engine.fuel})`;
      select.appendChild(option);
    });
}

function onEngineChange(event) {
  selected.engine = event.target.value;
  selected.year = "";

  populateYears();
}

function populateYears() {
  const select = document.getElementById("yearSelect");
  select.innerHTML = '<option value="">-- Choisir une année --</option>';

  document.getElementById("result").innerHTML = "";

  if (!selected.engine) return;

  const engine = (APP_DB.engines || []).find((e) => e.id === selected.engine);
  if (!engine) return;

  [...(engine.years || [])]
    .sort((a, b) => Number(a) - Number(b))
    .forEach((year) => {
      const option = document.createElement("option");
      option.value = year;
      option.textContent = year;
      select.appendChild(option);
    });
}

function onYearChange(event) {
  selected.year = event.target.value;
  showResult();
}

function showResult() {
  const result = document.getElementById("result");

  const model = (APP_DB.models || []).find((m) => m.id === selected.model);
  const brand = model ? (APP_DB.brands || []).find((b) => b.id === model.brand_id) : null;
  const engine = (APP_DB.engines || []).find((e) => e.id === selected.engine);

  if (!model || !brand || !engine || !selected.year) {
    result.innerHTML = "";
    return;
  }

  const uncertifiedCount = countUncertified(engine);

  const globalStatus =
    uncertifiedCount === 0
      ? `<div class="success">✅ Fiche validée par source officielle/licenciée.</div>`
      : `<div class="warning">⚠️ ${uncertifiedCount} opération(s) non validée(s). Document de travail uniquement.</div>`;

  result.innerHTML = `
    <div class="result-card" id="printable">
      <h2>🚗 ${escapeHtml(brand.name)} ${escapeHtml(model.name)}</h2>

      ${globalStatus}

      <div class="info-row">
        <span class="label">Marque</span>
        <span class="value">${escapeHtml(brand.name)}</span>
      </div>

      <div class="info-row">
        <span class="label">Modèle</span>
        <span class="value">${escapeHtml(model.name)}</span>
      </div>

      <div class="info-row">
        <span class="label">Motorisation</span>
        <span class="value">${escapeHtml(engine.code)}</span>
      </div>

      <div class="info-row">
        <span class="label">Code moteur</span>
        <span class="value">${escapeHtml(engine.engine_code || "N/A")}</span>
      </div>

      <div class="info-row">
        <span class="label">Puissance</span>
        <span class="value">${engine.power_ps ?? "?"} ch</span>
      </div>

      <div class="info-row">
        <span class="label">Carburant</span>
        <span class="value">${escapeHtml(engine.fuel || "N/A")}</span>
      </div>

      <div class="info-row">
        <span class="label">Année sélectionnée</span>
        <span class="value">${escapeHtml(selected.year)}</span>
      </div>

      <div class="info-row">
        <span class="label">Origine</span>
        <span class="value">${escapeHtml(brand.origin || "N/A")}</span>
      </div>

      <div class="maintenance-section">
        <h3>🔧 Préconisations d'entretien</h3>
        ${renderMaintenance(engine)}
      </div>

      <p style="margin-top:1.2rem;color:var(--muted);font-size:0.8rem;text-align:center;">
        ⚠️ Les préconisations doivent toujours être vérifiées avec le carnet du constructeur.
      </p>
    </div>
  `;
}

function renderMaintenance(engine) {
  return MAINTENANCE_FIELDS
    .map((field) => renderMaintenanceItem(field.label, engine.maintenance?.[field.key]))
    .join("");
}

function renderMaintenanceItem(label, item) {
  if (!item) {
    return `
      <div class="maint-item">
        <div>
          <div class="name">${escapeHtml(label)} <span class="badge-status warn">Non renseigné</span></div>
          <div class="detail">Donnée manquante</div>
        </div>
        <div class="freq">⚠️</div>
      </div>
    `;
  }

  if (item.status === "not_applicable") {
    return `
      <div class="maint-item">
        <div>
          <div class="name">${escapeHtml(label)} <span class="badge-status na">Non applicable</span></div>
          <div class="detail">${escapeHtml(item.note || "Non applicable")}</div>
          <div class="detail">Source : ${escapeHtml(renderSource(item))}</div>
        </div>
        <div class="freq">⛔</div>
      </div>
    `;
  }

  const interval = formatInterval(item);
  const severe = formatSevere(item);
  const badge = statusBadge(item);
  const source = renderSource(item);

  const notes = item.note
    ? `<div class="detail">${escapeHtml(item.note)}</div>`
    : "";

  const items = Array.isArray(item.items) && item.items.length
    ? `<ul class="checklist">${item.items.map((i) => `<li>${escapeHtml(i)}</li>`).join("")}</ul>`
    : "";

  return `
    <div class="maint-item">
      <div>
        <div class="name">${escapeHtml(label)} ${badge}</div>
        ${notes}
        ${items}
        <div class="detail">Source : ${escapeHtml(source)}</div>
      </div>
      <div class="freq">
        ${interval}
        ${severe}
      </div>
    </div>
  `;
}

function hasNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0;
}

function formatInterval(item) {
  const km = hasNumber(item.km);
  const months = hasNumber(item.months);

  if (km && months) {
    return `🛣️ ${Number(item.km).toLocaleString("fr-FR")} km<br>📅 ${Number(item.months)} mois<br><small>(premier atteint)</small>`;
  }

  if (km) {
    return `🛣️ ${Number(item.km).toLocaleString("fr-FR")} km`;
  }

  if (months) {
    return `📅 ${Number(item.months)} mois`;
  }

  if (item.status === "ai_candidate" || item.status === "to_source" || item.status === "generic") {
    return "⚠️ Non certifié";
  }

  return "⚠️ Intervalle manquant";
}

function formatSevere(item) {
  const km = hasNumber(item.severe_km);
  const months = hasNumber(item.severe_months);

  if (!km && !months) return "";

  if (km && months) {
    return `<div class="detail">Usage sévère : ${Number(item.severe_km).toLocaleString("fr-FR")} km ou ${Number(item.severe_months)} mois</div>`;
  }

  if (km) {
    return `<div class="detail">Usage sévère : ${Number(item.severe_km).toLocaleString("fr-FR")} km</div>`;
  }

  return `<div class="detail">Usage sévère : ${Number(item.severe_months)} mois</div>`;
}

function statusBadge(item) {
  const status = item.status || "to_source";

  if (status === "validated") {
    return `<span class="badge-status ok">Validé</span>`;
  }

  if (status === "ai_candidate") {
    return `<span class="badge-status ai">IA candidat</span>`;
  }

  if (status === "not_applicable") {
    return `<span class="badge-status na">Non applicable</span>`;
  }

  return `<span class="badge-status warn">À sourcer</span>`;
}

function getSource(sourceId) {
  if (!sourceId) return null;
  return (APP_DB.sources || []).find((s) => s.id === sourceId) || null;
}

function renderSource(item) {
  if (item.source_name || item.source_url) {
    return `${item.source_name || "Source externe"} ${item.source_url ? `(${item.source_url})` : ""}`;
  }

  const source = getSource(item.source_id);

  if (source) {
    return `${source.provider} — ${source.type}`;
  }

  return "manquante";
}

function countUncertified(engine) {
  let count = 0;

  MAINTENANCE_FIELDS.forEach((field) => {
    const item = engine.maintenance?.[field.key];

    if (!item) {
      count += 1;
      return;
    }

    if (item.status !== "validated" && item.status !== "not_applicable") {
      count += 1;
    }
  });

  return count;
}

function generatePDF() {
  const printable = document.getElementById("printable");

  if (!printable) {
    alert("Sélectionnez d'abord un véhicule complet.");
    return;
  }

  window.print();
}

function openAdminModal() {
  if (isAdmin) {
    document.getElementById("adminPanel").classList.toggle("active");
    return;
  }

  document.getElementById("adminModal").classList.add("active");
}

function closeAdminModal() {
  document.getElementById("adminModal").classList.remove("active");
}

async function submitAdmin() {
  const password = document.getElementById("adminPwd").value;

  if (password === APP_CONFIG.adminPassword) {
    isAdmin = true;
    closeAdminModal();
    document.getElementById("adminPanel").classList.add("active");
    await loadAdminSettings();
    adminOutput("Mode administrateur activé.");
  } else {
    alert("Mot de passe incorrect.");
  }
}

function logoutAdmin() {
  isAdmin = false;
  document.getElementById("adminPanel").classList.remove("active");
  adminOutput("Déconnecté.");
}

function adminOutput(message) {
  const output = document.getElementById("adminOutput");
  const time = new Date().toLocaleString("fr-FR");
  output.textContent = `[${time}] ${message}`;
}

async function importDatabaseFile(event) {
  const file = event.target.files[0];
  if (!file) return;

  try {
    const text = await file.text();
    const json = JSON.parse(text);

    const errors = validateDatabase(json);

    if (errors.length) {
      const ok = confirm(
        "Des anomalies ont été détectées :\n\n" +
        errors.slice(0, 10).join("\n") +
        "\n\nImporter quand même ?"
      );

      if (!ok) return;
    }

    APP_DB = json;
    await dbPut("settings", "database", APP_DB);

    refreshFilters();
    adminOutput(`Base importée avec succès. Version : ${APP_DB.version || "inconnue"}`);
  } catch (error) {
    alert("Import impossible : " + error.message);
  }

  event.target.value = "";
}

async function loadRemoteDatabase() {
  const settings = await getAISettings();

  const url = settings.remoteDbUrl || APP_CONFIG.defaultRemoteDbUrl;

  if (!url) {
    alert("Aucune URL de base distante configurée.");
    return;
  }

  try {
    adminOutput("Chargement de la base distante...");

    const response = await fetch(url, { cache: "no-cache" });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const json = await response.json();
    const errors = validateDatabase(json);

    if (errors.length) {
      const ok = confirm(
        "Des anomalies ont été détectées :\n\n" +
        errors.slice(0, 10).join("\n") +
        "\n\nImporter quand même ?"
      );

      if (!ok) return;
    }

    APP_DB = json;
    await dbPut("settings", "database", APP_DB);

    refreshFilters();
    adminOutput("Base distante chargée.");
  } catch (error) {
    adminOutput("Erreur chargement distant : " + error.message);
    alert("Erreur chargement distant : " + error.message);
  }
}

function refreshFilters() {
  selected = {
    origin: "all",
    brand: "",
    model: "",
    engine: "",
    year: ""
  };

  populateOrigins();
  populateBrands("all");
  document.getElementById("result").innerHTML = "";
}

function exportDatabase() {
  const blob = new Blob([JSON.stringify(APP_DB, null, 2)], {
    type: "application/json"
  });

  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "database.json";
  a.click();
  URL.revokeObjectURL(a.href);
}

function validateDatabaseUI() {
  const errors = validateDatabase(APP_DB);

  if (!errors.length) {
    adminOutput("Base valide selon les contrôles de base.");
  } else {
    adminOutput(errors.join("\n"));
  }
}

function validateDatabase(data) {
  const errors = [];

  if (!data || typeof data !== "object") {
    return ["Base invalide : objet JSON attendu."];
  }

  ["brands", "models", "engines"].forEach((key) => {
    if (!Array.isArray(data[key])) {
      errors.push(`Champ obligatoire manquant ou invalide : ${key}`);
    }
  });

  if (errors.length) return errors;

  const modelIds = new Set(data.models.map((m) => m.id));

  data.engines.forEach((engine, index) => {
    if (!engine.id) {
      errors.push(`Engine ${index} : id manquant.`);
    }

    if (!engine.model_id || !modelIds.has(engine.model_id)) {
      errors.push(`Engine ${engine.id || index} : model_id invalide.`);
    }

    if (!Array.isArray(engine.years) || engine.years.length === 0) {
      errors.push(`Engine ${engine.id || index} : années manquantes.`);
    } else {
      engine.years.forEach((year) => {
        const y = Number(year);

        if (!Number.isFinite(y) || y < 2016 || y > 2026) {
          errors.push(`Engine ${engine.id || index} : année hors périmètre 2016-2026 (${year}).`);
        }
      });
    }

    if (engine.maintenance) {
      MAINTENANCE_FIELDS.forEach((field) => {
        const item = engine.maintenance[field.key];
        if (!item) return;

        const hasInterval = hasNumber(item.km) || hasNumber(item.months);

        if (item.status === "validated" && !item.source_id && !item.source_name) {
          errors.push(`${engine.id || index} / ${field.key} : validé sans source.`);
        }

        if (item.status === "validated" && !hasInterval && item.status !== "not_applicable") {
          errors.push(`${engine.id || index} / ${field.key} : validé sans intervalle.`);
        }
      });
    }
  });

  return errors;
}

async function aiAssist() {
  if (!selected.engine) {
    alert("Sélectionnez d'abord une motorisation.");
    return;
  }

  const engine = (APP_DB.engines || []).find((e) => e.id === selected.engine);
  if (!engine) return;

  adminOutput("Assistant IA sur la fiche sélectionnée...");

  try {
    await enrichEngineWithGemini(engine);
    await dbPut("settings", "database", APP_DB);

    if (selected.year) {
      showResult();
    }

    adminOutput("Fiche complétée par IA. Statut : candidat IA.");
  } catch (error) {
    adminOutput("Erreur IA : " + error.message);
    alert("Erreur IA : " + error.message);
  }
}

async function startGeminiEnrichment(mode = "missing", options = {}) {
  if (aiEnrichRunning) {
    adminOutput("Un traitement IA est déjà en cours.");
    return;
  }

  const settings = await getAISettings();

  if (!settings.apiKey) {
    alert("Clé API Gemini manquante. Enregistrez-la dans le panneau admin.");
    return;
  }

  const candidates = (APP_DB.engines || []).filter((engine) =>
    shouldEnrichEngine(engine, mode)
  );

  const max = Math.max(1, Number(settings.maxPerSession) || 10);
  const queue = candidates.slice(0, max);

  if (!queue.length) {
    if (!options.silent) {
      alert("Aucune fiche à compléter.");
    }

    adminOutput("Aucune fiche à compléter.");
    return;
  }

  aiEnrichRunning = true;

  let processed = 0;

  for (const engine of queue) {
    if (!aiEnrichRunning) {
      updateAIProgress("Arrêté.");
      adminOutput("Traitement IA arrêté.");
      break;
    }

    processed += 1;

    updateAIProgress(`${processed}/${queue.length} — ${engine.code}`);
    adminOutput(`IA : ${processed}/${queue.length} — ${engine.id}`);

    try {
      await enrichEngineWithGemini(engine);
      await dbPut("settings", "database", APP_DB);

      if (selected.engine === engine.id && selected.year) {
        showResult();
      }
    } catch (error) {
      adminOutput(`Erreur sur ${engine.id} : ${error.message}`);
    }

    await sleep(settings.delayMs || 2500);
  }

  aiEnrichRunning = false;
  updateAIProgress("Terminé.");
  adminOutput("Traitement IA terminé.");
}

function stopGeminiEnrichment() {
  aiEnrichRunning = false;
  updateAIProgress("Arrêt demandé...");
  adminOutput("Arrêt demandé.");
}

function updateAIProgress(text) {
  const el = document.getElementById("aiProgress");

  if (el) {
    el.textContent = text;
  }
}

function shouldEnrichEngine(engine, mode) {
  if (mode === "all") return true;

  return hasMissingData(engine);
}

function hasMissingData(engine) {
  if (!engine.maintenance) return true;

  return MAINTENANCE_FIELDS.some((field) => {
    const item = engine.maintenance[field.key];

    if (!item) return true;
    if (item.status === "to_source") return true;

    return false;
  });
}

async function enrichEngineWithGemini(engine) {
  const prompt = buildGeminiEnrichPrompt(engine);
  const text = await callGemini(prompt);
  const candidate = parseAIJSON(text);

  applyAICandidate(engine.id, candidate);
}

async function callGemini(prompt) {
  const settings = await getAISettings();

  if (!settings.apiKey) {
    throw new Error("Clé API Gemini manquante.");
  }

  const model = settings.model || APP_CONFIG.defaultGeminiModel;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

  const body = {
    contents: [
      {
        parts: [
          { text: prompt }
        ]
      }
    ],
    generationConfig: {
      temperature: 0.1
    }
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": settings.apiKey
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API ${response.status} — ${errorText.slice(0, 300)}`);
  }

  const data = await response.json();

  const text = data?.candidates?.[0]?.content?.parts
    ?.map((p) => p.text)
    .join("");

  if (!text) {
    throw new Error("Réponse IA vide.");
  }

  return text;
}

function buildGeminiEnrichPrompt(engine) {
  const model = (APP_DB.models || []).find((m) => m.id === engine.model_id);
  const brand = model ? (APP_DB.brands || []).find((b) => b.id === model.brand_id) : null;

  const years = (engine.years || []).join(", ");

  return `
Tu es un expert officiel en préconisations d'entretien automobile.

Réponds UNIQUEMENT avec un JSON valide.
Aucun texte avant ou après.
Aucun Markdown.
Aucune explanation.

Véhicule cible :
- Marque : ${brand?.name || "inconnue"}
- Modèle : ${model?.name || "inconnu"}
- Motorisation : ${engine.code || "inconnue"}
- Code moteur : ${engine.engine_code || "inconnu"}
- Carburant : ${engine.fuel || "inconnu"}
- Puissance : ${engine.power_ps || "?"} ch
- Années : ${years || "?"}
- Marché cible : France/Europe

JSON attendu :
{
  "engine_oil": {"km":null,"months":null,"severe_km":null,"severe_months":null,"note":"","source_name":"","source_url":"","status":"to_source"},
  "gearbox_oil": {"km":null,"months":null,"severe_km":null,"severe_months":null,"note":"","source_name":"","source_url":"","status":"to_source"},
  "differential_oil": {"km":null,"months":null,"severe_km":null,"severe_months":null,"note":"","source_name":"","source_url":"","status":"to_source"},
  "transfer_case_oil": {"km":null,"months":null,"severe_km":null,"severe_months":null,"note":"","source_name":"","source_url":"","status":"to_source"},
  "brake_fluid": {"km":null,"months":null,"severe_km":null,"severe_months":null,"note":"","source_name":"","source_url":"","status":"to_source"},
  "coolant": {"km":null,"months":null,"severe_km":null,"severe_months":null,"note":"","source_name":"","source_url":"","status":"to_source"},
  "cabin_filter": {"km":null,"months":null,"severe_km":null,"severe_months":null,"note":"","source_name":"","source_url":"","status":"to_source"},
  "air_filter": {"km":null,"months":null,"severe_km":null,"severe_months":null,"note":"","source_name":"","source_url":"","status":"to_source"},
  "fuel_filter": {"km":null,"months":null,"severe_km":null,"severe_months":null,"note":"","source_name":"","source_url":"","status":"to_source"},
  "timing_belt": {"km":null,"months":null,"severe_km":null,"severe_months":null,"note":"","source_name":"","source_url":"","status":"to_source"},
  "timing_chain": {"km":null,"months":null,"severe_km":null,"severe_months":null,"note":"","source_name":"","source_url":"","status":"to_source"},
  "accessory_belt": {"km":null,"months":null,"severe_km":null,"severe_months":null,"note":"","source_name":"","source_url":"","status":"to_source"},
  "visual_checks": {"km":null,"months":null,"severe_km":null,"severe_months":null,"items":[],"note":"","source_name":"","source_url":"","status":"to_source"},
  "electronic_checks": {"km":null,"months":null,"severe_km":null,"severe_months":null,"items":[],"note":"","source_name":"","source_url":"","status":"to_source"}
}

Règles obligatoires :
1. Si tu connais une valeur exacte issue d'une source officielle, remplis km ou months.
2. Si tu n'es pas sûr, laisse null et status = "to_source".
3. N'invente jamais une valeur.
4. Si une opération est non applicable, utilise status = "not_applicable".
5. Pour les véhicules électriques, engine_oil, air_filter, fuel_filter, timing_belt, timing_chain et accessory_belt doivent être non applicables si pertinent.
6. Pour chaque valeur connue, indique source_name et source_url si disponibles.
7. Retourne uniquement le JSON.
  `.trim();
}

function parseAIJSON(text) {
  try {
    return JSON.parse(text);
  } catch (e) {
    const match = text.match(/\{[\s\S]*\}/);

    if (match) {
      return JSON.parse(match[0]);
    }

    throw new Error("JSON IA invalide.");
  }
}

function applyAICandidate(engineId, candidate) {
  const engine = (APP_DB.engines || []).find((e) => e.id === engineId);
  if (!engine) return;

  const data = candidate.maintenance || candidate;

  if (!engine.maintenance) {
    engine.maintenance = emptyMaintenance("to_source");
  }

  MAINTENANCE_FIELDS.forEach((field) => {
    const aiItem = data?.[field.key];
    if (!aiItem || typeof aiItem !== "object") return;

    const existing = engine.maintenance[field.key];

    if (existing?.status === "validated") {
      return;
    }

    engine.maintenance[field.key] = normalizeAIItem(aiItem, existing);
  });
}

function normalizeAIItem(aiItem, existing) {
  const now = new Date().toISOString();

  if (aiItem.status === "not_applicable") {
    return {
      status: "not_applicable",
      note: aiItem.note || "Non applicable",
      source_id: null,
      source_name: aiItem.source_name || "IA",
      source_url: aiItem.source_url || "",
      source_type: "ai",
      confidence: "low",
      updated_at: now
    };
  }

  return {
    km: numOrNull(aiItem.km),
    months: numOrNull(aiItem.months),
    severe_km: numOrNull(aiItem.severe_km),
    severe_months: numOrNull(aiItem.severe_months),
    note: aiItem.note || "Candidat IA — à vérifier",
    items: Array.isArray(aiItem.items)
      ? aiItem.items.map(String)
      : existing?.items || [],
    source_id: null,
    source_name: aiItem.source_name || "IA",
    source_url: aiItem.source_url || "",
    source_type: "ai",
    confidence: "low",
    status: "ai_candidate",
    updated_at: now
  };
}

function numOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
