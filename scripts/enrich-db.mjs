import fs from "fs";

const DB_PATH = process.env.DB_PATH || "database.json";
const OUT_PATH = process.env.OUT_PATH || "database.generated.json";

const KEY = process.env.GEMINI_API_KEY;
const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

const MAX = Number(process.env.ENRICH_MAX || 20);
const DELAY_MS = Number(process.env.ENRICH_DELAY_MS || 3000);

if (!KEY) {
  console.error("GEMINI_API_KEY manquant.");
  process.exit(1);
}

const MAINTENANCE_FIELDS = [
  "engine_oil",
  "gearbox_oil",
  "differential_oil",
  "transfer_case_oil",
  "brake_fluid",
  "coolant",
  "cabin_filter",
  "air_filter",
  "fuel_filter",
  "timing_belt",
  "timing_chain",
  "accessory_belt",
  "visual_checks",
  "electronic_checks"
];

function loadDatabase() {
  if (!fs.existsSync(DB_PATH)) {
    console.error("database.json introuvable.");
    process.exit(1);
  }

  const catalog = JSON.parse(fs.readFileSync(DB_PATH, "utf8"));

  if (fs.existsSync(OUT_PATH)) {
    const generated = JSON.parse(fs.readFileSync(OUT_PATH, "utf8"));
    const byId = new Map((generated.engines || []).map((e) => [e.id, e]));

    for (const engine of catalog.engines || []) {
      const g = byId.get(engine.id);
      if (g && g.maintenance) {
        engine.maintenance = g.maintenance;
      }
    }

    console.log("Fusion avec database.generated.json effectuée.");
  }

  return catalog;
}

function needsEnrichment(engine) {
  if (!engine.maintenance) return true;

  return MAINTENANCE_FIELDS.some((field) => {
    const item = engine.maintenance[field];

    if (!item) return true;
    if (item.status === "to_source") return true;

    return false;
  });
}

function buildPrompt(engine) {
  const years = (engine.years || []).join(", ");

  return `
Tu es un expert officiel en préconisations d'entretien automobile.

Réponds UNIQUEMENT avec un JSON valide.
Aucun texte avant ou après.
Aucun Markdown.
Aucune explanation.

Véhicule cible :
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

async function callGemini(prompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(MODEL)}:generateContent`;

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
      "x-goog-api-key": KEY
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`API ${response.status} — ${text.slice(0, 300)}`);
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

function numOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function applyCandidate(engine, candidate) {
  const data = candidate.maintenance || candidate;

  if (!engine.maintenance) {
    engine.maintenance = {};
  }

  MAINTENANCE_FIELDS.forEach((field) => {
    const aiItem = data?.[field];
    if (!aiItem || typeof aiItem !== "object") return;

    const existing = engine.maintenance[field];

    if (existing?.status === "validated") return;

    if (aiItem.status === "not_applicable") {
      engine.maintenance[field] = {
        status: "not_applicable",
        note: aiItem.note || "Non applicable",
        source_name: aiItem.source_name || "IA",
        source_url: aiItem.source_url || "",
        source_type: "ai",
        confidence: "low",
        updated_at: new Date().toISOString()
      };

      return;
    }

    engine.maintenance[field] = {
      km: numOrNull(aiItem.km),
      months: numOrNull(aiItem.months),
      severe_km: numOrNull(aiItem.severe_km),
      severe_months: numOrNull(aiItem.severe_months),
      note: aiItem.note || "Candidat IA — à vérifier",
      items: Array.isArray(aiItem.items)
        ? aiItem.items.map(String)
        : existing?.items || [],
      source_name: aiItem.source_name || "IA",
      source_url: aiItem.source_url || "",
      source_type: "ai",
      confidence: "low",
      status: "ai_candidate",
      updated_at: new Date().toISOString()
    };
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const db = loadDatabase();

  let processed = 0;

  for (const engine of db.engines || []) {
    if (processed >= MAX) break;

    if (!needsEnrichment(engine)) continue;

    try {
      const prompt = buildPrompt(engine);
      const text = await callGemini(prompt);
      const candidate = parseAIJSON(text);

      applyCandidate(engine, candidate);

      processed += 1;

      console.log(`Enrichi : ${engine.id}`);

      fs.writeFileSync(OUT_PATH, JSON.stringify(db, null, 2));

      await sleep(DELAY_MS);
    } catch (error) {
      console.error(`Erreur ${engine.id} : ${error.message}`);
    }
  }

  fs.writeFileSync(OUT_PATH, JSON.stringify(db, null, 2));

  console.log(`Terminé : ${processed} fiche(s) traitée(s).`);
}

main();
