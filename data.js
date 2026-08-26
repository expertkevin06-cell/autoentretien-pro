const APP_CONFIG = {
  adminPassword: "Kevin83600",
  defaultRemoteDbUrl: "",
  defaultGeminiModel: "gemini-2.5-flash"
};

const MAINTENANCE_FIELDS = [
  { key: "engine_oil", label: "Vidange moteur" },
  { key: "gearbox_oil", label: "Vidange boîte de vitesses" },
  { key: "differential_oil", label: "Pont de transmission" },
  { key: "transfer_case_oil", label: "Boîte de transfert" },
  { key: "brake_fluid", label: "Liquide de frein" },
  { key: "coolant", label: "Liquide de refroidissement" },
  { key: "cabin_filter", label: "Filtre habitacle" },
  { key: "air_filter", label: "Filtre à air" },
  { key: "fuel_filter", label: "Filtre à carburant" },
  { key: "timing_belt", label: "Courroie de distribution" },
  { key: "timing_chain", label: "Chaîne de distribution" },
  { key: "accessory_belt", label: "Courroie accessoire" },
  { key: "visual_checks", label: "Vérifications visuelles" },
  { key: "electronic_checks", label: "Vérifications électroniques" }
];

function emptyMaintenance(status = "to_source", source_id = null) {
  return {
    engine_oil: {
      km: null,
      months: null,
      severe_km: null,
      severe_months: null,
      note: "Valeur à sourcer depuis une documentation officielle",
      source_id,
      status
    },
    gearbox_oil: {
      km: null,
      months: null,
      severe_km: null,
      severe_months: null,
      note: "",
      source_id,
      status
    },
    differential_oil: {
      km: null,
      months: null,
      severe_km: null,
      severe_months: null,
      note: "",
      source_id,
      status
    },
    transfer_case_oil: {
      km: null,
      months: null,
      severe_km: null,
      severe_months: null,
      note: "",
      source_id,
      status
    },
    brake_fluid: {
      km: null,
      months: null,
      severe_km: null,
      severe_months: null,
      note: "",
      source_id,
      status
    },
    coolant: {
      km: null,
      months: null,
      severe_km: null,
      severe_months: null,
      note: "",
      source_id,
      status
    },
    cabin_filter: {
      km: null,
      months: null,
      severe_km: null,
      severe_months: null,
      note: "",
      source_id,
      status
    },
    air_filter: {
      km: null,
      months: null,
      severe_km: null,
      severe_months: null,
      note: "",
      source_id,
      status
    },
    fuel_filter: {
      km: null,
      months: null,
      severe_km: null,
      severe_months: null,
      note: "",
      source_id,
      status
    },
    timing_belt: {
      km: null,
      months: null,
      severe_km: null,
      severe_months: null,
      note: "",
      source_id,
      status
    },
    timing_chain: {
      km: null,
      months: null,
      severe_km: null,
      severe_months: null,
      note: "",
      source_id,
      status
    },
    accessory_belt: {
      km: null,
      months: null,
      severe_km: null,
      severe_months: null,
      note: "",
      source_id,
      status
    },
    visual_checks: {
      km: null,
      months: null,
      severe_km: null,
      severe_months: null,
      items: [
        "Niveaux",
        "Pneumatiques",
        "Éclairage",
        "Plaquettes de frein",
        "Disques de frein",
        "Balais d'essuie-glace",
        "Fuites éventuelles",
        "Courroies",
        "Suspension",
        "Échappement"
      ],
      source_id,
      status
    },
    electronic_checks: {
      km: null,
      months: null,
      severe_km: null,
      severe_months: null,
      items: [
        "Diagnostic OBD",
        "Batterie",
        "Capteurs",
        "Calculateurs",
        "Voyants"
      ],
      source_id,
      status
    }
  };
}

function electricMaintenance(status = "to_source", source_id = null) {
  const m = emptyMaintenance(status, source_id);

  m.engine_oil = {
    ...m.engine_oil,
    status: "not_applicable",
    note: "Pas de vidange moteur sur véhicule électrique"
  };

  m.air_filter = {
    ...m.air_filter,
    status: "not_applicable",
    note: "Non applicable"
  };

  m.fuel_filter = {
    ...m.fuel_filter,
    status: "not_applicable",
    note: "Non applicable"
  };

  m.timing_belt = {
    ...m.timing_belt,
    status: "not_applicable",
    note: "Non applicable"
  };

  m.timing_chain = {
    ...m.timing_chain,
    status: "not_applicable",
    note: "Non applicable"
  };

  m.accessory_belt = {
    ...m.accessory_belt,
    status: "not_applicable",
    note: "Non applicable"
  };

  m.electronic_checks.items = [
    "Diagnostic OBD",
    "Batterie 12V",
    "Batterie haute tension",
    "Onduleur",
    "Câblage haute tension",
    "Prise de charge"
  ];

  return m;
}

const DEFAULT_DB = {
  version: "2026-08-27-base-demo",
  market: "FR/EU",
  sources: [
    {
      id: "src_official_example",
      type: "official",
      provider: "Exemple source officielle",
      url: "",
      access_date: "2026-08-27",
      license: "à vérifier",
      confidence: "pending"
    }
  ],
  brands: [
    { id: "renault", name: "Renault", origin: "France" },
    { id: "peugeot", name: "Peugeot", origin: "France" },
    { id: "citroen", name: "Citroën", origin: "France" },
    { id: "dacia", name: "Dacia", origin: "Roumanie" },
    { id: "ds", name: "DS Automobiles", origin: "France" },
    { id: "volkswagen", name: "Volkswagen", origin: "Allemagne" },
    { id: "audi", name: "Audi", origin: "Allemagne" },
    { id: "bmw", name: "BMW", origin: "Allemagne" },
    { id: "mercedes", name: "Mercedes-Benz", origin: "Allemagne" },
    { id: "opel", name: "Opel", origin: "Allemagne" },
    { id: "toyota", name: "Toyota", origin: "Japon" },
    { id: "hyundai", name: "Hyundai", origin: "Corée du Sud" },
    { id: "kia", name: "Kia", origin: "Corée du Sud" },
    { id: "tesla", name: "Tesla", origin: "États-Unis" },
    { id: "ford", name: "Ford", origin: "États-Unis" },
    { id: "byd", name: "BYD", origin: "Chine" },
    { id: "mg", name: "MG", origin: "Chine" }
  ],
  models: [
    { id: "renault_clio", brand_id: "renault", name: "Clio" },
    { id: "peugeot_208", brand_id: "peugeot", name: "208" },
    { id: "citroen_c3", brand_id: "citroen", name: "C3" },
    { id: "dacia_sandero", brand_id: "dacia", name: "Sandero" },
    { id: "ds_ds3", brand_id: "ds", name: "DS 3" },
    { id: "vw_golf", brand_id: "volkswagen", name: "Golf" },
    { id: "audi_a3", brand_id: "audi", name: "A3" },
    { id: "bmw_serie3", brand_id: "bmw", name: "Série 3" },
    { id: "mercedes_classe_c", brand_id: "mercedes", name: "Classe C" },
    { id: "opel_corsa", brand_id: "opel", name: "Corsa" },
    { id: "toyota_yaris", brand_id: "toyota", name: "Yaris" },
    { id: "hyundai_i30", brand_id: "hyundai", name: "i30" },
    { id: "kia_ceed", brand_id: "kia", name: "Ceed" },
    { id: "tesla_model3", brand_id: "tesla", name: "Model 3" },
    { id: "ford_focus", brand_id: "ford", name: "Focus" },
    { id: "byd_atto3", brand_id: "byd", name: "Atto 3" },
    { id: "mg_mg4", brand_id: "mg", name: "MG4" }
  ],
  engines: [
    {
      id: "renault_clio_1_5_dci_90_2016_2018",
      model_id: "renault_clio",
      code: "1.5 dCi 90",
      engine_code: "K9K",
      fuel: "diesel",
      power_ps: 90,
      years: [2016, 2017, 2018],
      transmission: "manuelle",
      maintenance: emptyMaintenance("to_source")
    },
    {
      id: "peugeot_208_1_2_puretech_82_2016_2019",
      model_id: "peugeot_208",
      code: "1.2 PureTech 82",
      engine_code: "EB2",
      fuel: "essence",
      power_ps: 82,
      years: [2016, 2017, 2018, 2019],
      transmission: "manuelle",
      maintenance: emptyMaintenance("to_source")
    },
    {
      id: "toyota_yaris_hybrid_100_2016_2020",
      model_id: "toyota_yaris",
      code: "1.5 Hybrid 100",
      engine_code: "Hybrid",
      fuel: "hybride",
      power_ps: 100,
      years: [2016, 2017, 2018, 2019, 2020],
      transmission: "CVT",
      maintenance: emptyMaintenance("to_source")
    },
    {
      id: "tesla_model3_long_range_2017_2025",
      model_id: "tesla_model3",
      code: "Long Range AWD",
      engine_code: "EV",
      fuel: "électrique",
      power_ps: 441,
      years: [2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025],
      transmission: "automatique",
      maintenance: electricMaintenance("to_source")
    },
    {
      id: "byd_atto3_electric_2022_2025",
      model_id: "byd_atto3",
      code: "Electric 204",
      engine_code: "EV",
      fuel: "électrique",
      power_ps: 204,
      years: [2022, 2023, 2024, 2025],
      transmission: "automatique",
      maintenance: electricMaintenance("to_source")
    }
  ]
};
