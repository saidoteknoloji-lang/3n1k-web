import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { setCorsHeaders } from "./cors.js";

const FETCH_TIMEOUT_MS = 12000;
const PYTHON_BOT_CACHE_VERSION = 3;
const PYTHON_BOT_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const PLACE_NAME_QUESTIONS = [
  { heading: "NE", query: (placeName) => `"${placeName}" yer adı anlamı kökeni etimoloji` },
  { heading: "NEDEN", query: (placeName) => `"${placeName}" yer adına neden bu isim verilmiş adlandırılma nedeni` },
  { heading: "KİM", query: (placeName) => `"${placeName}" yer adını kim verdi ilk kullanan adlandıran` },
  { heading: "NASIL", query: (placeName) => `"${placeName}" yer adı tarihsel eski adları isim değişimi` }
];

function normalizePlaceId(value) {
  return String(value || "").toLocaleLowerCase("tr-TR").normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ı/g, "i").replace(/ğ/g, "g").replace(/ü/g, "u")
    .replace(/ş/g, "s").replace(/ö/g, "o").replace(/ç/g, "c")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 120);
}

function getAdminFirestore() {
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!serviceAccountJson) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT Vercel ortam değişkeninde tanımlı değil.");
  }
  const serviceAccount = JSON.parse(serviceAccountJson);
  if (serviceAccount.project_id !== "n1k-12d03") {
    throw new Error("FIREBASE_SERVICE_ACCOUNT n1k-12d03 projesine ait değil.");
  }

  const existingApp = getApps().find(app => app.name === "place-name-cache");
  const app = existingApp || initializeApp({
    credential: cert(serviceAccount)
  }, "place-name-cache");
  return getFirestore(app);
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeSearchText(value) {
  return String(value || "").toLocaleLowerCase("tr-TR").normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ı/g, "i").replace(/ğ/g, "g").replace(/ü/g, "u")
    .replace(/ş/g, "s").replace(/ö/g, "o").replace(/ç/g, "c")
    .replace(/[^a-z0-9]/g, "");
}

async function fetchTavilyAnswer(placeName, question) {
  const response = await fetchWithTimeout("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: process.env.TAVILY_API_KEY,
      query: question.query(placeName),
      search_depth: "advanced",
      max_results: 5,
      include_raw_content: false
    })
  });
  const result = await response.json();
  if (!response.ok) {
    throw new Error(result.detail || result.message || `Tavily araması başarısız (HTTP ${response.status}).`);
  }

  const normalizedPlaceName = normalizeSearchText(placeName);
  const sources = (result.results || [])
    .filter(item => {
      const sourceText = normalizeSearchText(`${item.title || ""} ${item.content || ""}`);
      return normalizedPlaceName.length > 0
        && typeof item.content === "string"
        && item.content.trim().length >= 30
        && sourceText.includes(normalizedPlaceName)
        && typeof item.url === "string"
        && item.url.startsWith("https://");
    })
    .slice(0, 3)
    .map(item => ({
      type: "Tavily",
      title: item.title || "Kaynak",
      summary: item.content.trim().slice(0, 500),
      url: item.url
    }));

  return { question, sources };
}

async function loadCachedPlaceNameBot(placeId) {
  const snapshot = await getAdminFirestore().collection("yerler").doc(placeId).get();
  if (!snapshot.exists) return null;

  const data = snapshot.data();
  const cacheDate = data.pythonBotCacheAt?.toDate?.();
  if (data.pythonBotCacheVersion !== PYTHON_BOT_CACHE_VERSION
    || typeof data.pythonBot !== "string"
    || !data.pythonBot
    || !cacheDate
    || Date.now() - cacheDate.getTime() > PYTHON_BOT_CACHE_TTL_MS) {
    return null;
  }

  return { pythonBot: data.pythonBot, sources: data.pythonBotSources || [] };
}

async function savePlaceNameBot(placeId, result) {
  await getAdminFirestore().collection("yerler").doc(placeId).set({
    pythonBot: result.pythonBot,
    pythonBotSources: result.sources,
    pythonBotCacheVersion: PYTHON_BOT_CACHE_VERSION,
    pythonBotCacheAt: Timestamp.now()
  }, { merge: true });
}

async function generatePlaceNameBot(placeName) {
  const placeId = normalizePlaceId(placeName) || "isimsiz-yer";
  const cached = await loadCachedPlaceNameBot(placeId);
  if (cached) return { ...cached, cacheHit: true };

  if (!process.env.TAVILY_API_KEY) {
    throw new Error("TAVILY_API_KEY Vercel ortam değişkeninde tanımlı değil.");
  }

  const answers = await Promise.all(
    PLACE_NAME_QUESTIONS.map(question => fetchTavilyAnswer(placeName, question))
  );
  const sources = [];
  const sections = answers.map(({ question, sources: questionSources }) => {
    if (!questionSources.length) {
      return `${question.heading}?\nBu soru için Tavily kaynaklarında doğrulanabilir bilgi bulunamadı.`;
    }

    const references = questionSources.map(source => {
      let sourceIndex = sources.findIndex(existing => existing.url === source.url);
      if (sourceIndex < 0) {
        sources.push(source);
        sourceIndex = sources.length - 1;
      }
      return sourceIndex + 1;
    });
    const excerpts = questionSources.map((source, index) =>
      `${source.summary} [${references[index]}]`
    );
    return `${question.heading}?\n${excerpts.join("\n\n")}`;
  });
  const sourceLines = sources.map((source, index) =>
    `[${index + 1}] Tavily — ${source.title}: ${source.url}`
  );
  const pythonBot = [
    ...sections,
    `Kaynaklar:\n${sourceLines.length ? sourceLines.join("\n") : "Bu yanıtlar için kaynak bulunamadı."}`
  ].join("\n\n");
  const result = { pythonBot, sources, cacheHit: false };
  if (sources.length) await savePlaceNameBot(placeId, result);
  return result;
}

export default async function handler(req, res) {
  setCorsHeaders(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Sadece POST istekleri desteklenir." });

  const placeName = typeof req.body?.yerAdi === "string" ? req.body.yerAdi.trim() : "";
  if (!placeName || placeName.length > 160) {
    return res.status(400).json({ error: "Geçerli bir yer adı gönderilmedi." });
  }

  try {
    const result = await generatePlaceNameBot(placeName);
    return res.status(200).json({ ...result, cacheVersion: PYTHON_BOT_CACHE_VERSION });
  } catch (error) {
    console.error("Python bot kaynak hatası:", error);
    return res.status(error?.statusCode || 502).json({
      error: "Yer adı bilgisi alınamadı veya Firebase önbelleği kaydedilemedi.",
      detail: error instanceof Error ? error.message : "Bilinmeyen Tavily veya Firebase hatası."
    });
  }
}
