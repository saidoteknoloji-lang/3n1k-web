const allowedOrigins = [
  "https://n1k-12d03.web.app",
  "https://3n1k-web.vercel.app",
  "https://3n1k-web-git-main-saido1.vercel.app",
  "http://127.0.0.1:5500",
  "http://localhost:5500"
];

function setCors(req, res) {
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function normalizeText(value) {
  return value.toLocaleLowerCase("tr-TR").normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ı/g, "i").replace(/ğ/g, "g").replace(/ü/g, "u")
    .replace(/ş/g, "s").replace(/ö/g, "o").replace(/ç/g, "c")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 120);
}

function firstSentences(text, maxSentences = 3) {
  const cleanText = text.replace(/\s+/g, " ").trim();
  const sentences = cleanText.match(/[^.!?]+[.!?]+/g) || [cleanText];
  return sentences.slice(0, maxSentences).join(" ").trim();
}

async function fetchWikipedia(placeName) {
  const searchUrl = new URL("https://tr.wikipedia.org/w/api.php");
  searchUrl.search = new URLSearchParams({
    action: "query",
    list: "search",
    srsearch: `\"${placeName}\"` ,
    srlimit: "1",
    format: "json",
    origin: "*"
  });
  const searchResponse = await fetch(searchUrl, { headers: { "User-Agent": "YerAdlariPythonBot/1.0" } });
  if (!searchResponse.ok) throw new Error("Wikipedia araması başarısız.");
  const searchResult = await searchResponse.json();
  const page = searchResult.query?.search?.[0];
  if (!page) return null;

  const pageUrl = new URL("https://tr.wikipedia.org/w/api.php");
  pageUrl.search = new URLSearchParams({
    action: "query",
    prop: "extracts|info",
    exintro: "1",
    explaintext: "1",
    inprop: "url",
    pageids: page.pageid,
    format: "json",
    origin: "*"
  });
  const pageResponse = await fetch(pageUrl, { headers: { "User-Agent": "YerAdlariPythonBot/1.0" } });
  if (!pageResponse.ok) throw new Error("Wikipedia maddesi alınamadı.");
  const pageResult = await pageResponse.json();
  const data = pageResult.query?.pages?.[page.pageid];
  if (!data?.extract) return null;
  return {
    title: data.title,
    summary: firstSentences(data.extract),
    url: data.fullurl || `https://tr.wikipedia.org/wiki/${encodeURIComponent(data.title.replace(/ /g, "_"))}`
  };
}

function stripHtml(value) {
  return value.replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"').replace(/&#39;/gi, "'")
    .replace(/\\s+/g, " ").trim();
}

async function fetchEtymology(placeName) {
  const slug = normalizeText(placeName);
  if (!slug) return null;
  const url = `https://www.etimolojiturkce.com/kelime/${slug}`;
  const response = await fetch(url, {
    headers: { "User-Agent": "YerAdlariPythonBot/1.0 (source-check)" }
  });
  if (response.ok) {
    const html = await response.text();
    const description = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)/i)?.[1];
    const text = stripHtml(description || html);
    if (text.length >= 30) return { type: "EtimolojiTürkçe", summary: firstSentences(text, 2), url };
  }
  return fetchWiktionary(placeName);
}

async function fetchWiktionary(placeName) {
  const searchUrl = new URL("https://tr.wiktionary.org/w/api.php");
  searchUrl.search = new URLSearchParams({
    action: "query",
    list: "search",
    srsearch: `\"${placeName}\"`,
    srlimit: "1",
    format: "json",
    origin: "*"
  });
  const searchResponse = await fetch(searchUrl, { headers: { "User-Agent": "YerAdlariPythonBot/1.0" } });
  if (!searchResponse.ok) return null;
  const searchResult = await searchResponse.json();
  const page = searchResult.query?.search?.[0];
  if (!page) return null;
  const pageUrl = new URL("https://tr.wiktionary.org/w/api.php");
  pageUrl.search = new URLSearchParams({
    action: "query",
    prop: "extracts",
    explaintext: "1",
    exintro: "1",
    pageids: page.pageid,
    format: "json",
    origin: "*"
  });
  const pageResponse = await fetch(pageUrl, { headers: { "User-Agent": "YerAdlariPythonBot/1.0" } });
  if (!pageResponse.ok) return null;
  const pageResult = await pageResponse.json();
  const extract = pageResult.query?.pages?.[page.pageid]?.extract;
  if (!extract) return null;
  return {
    type: "Türkçe Vikisözlük",
    title: page.title,
    summary: firstSentences(extract, 2),
    url: `https://tr.wiktionary.org/wiki/${encodeURIComponent(page.title.replace(/ /g, "_"))}`
  };
}

export default async function handler(req, res) {
  setCors(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Sadece POST istekleri desteklenir." });

  const placeName = typeof req.body?.yerAdi === "string" ? req.body.yerAdi.trim() : "";
  if (!placeName || placeName.length > 160) {
    return res.status(400).json({ error: "Geçerli bir yer adı gönderilmedi." });
  }

  const sources = [];
  try {
    const [wikipedia, etymology] = await Promise.allSettled([
      fetchWikipedia(placeName),
      fetchEtymology(placeName)
    ]);
    if (wikipedia.status === "fulfilled" && wikipedia.value) sources.push({ type: "Wikipedia", ...wikipedia.value });
    if (etymology.status === "fulfilled" && etymology.value) sources.push(etymology.value);

    const summaryParts = sources.map(source => `${source.summary} [${source.type}]`);
    const summary = summaryParts.length
      ? summaryParts.join(" ")
      : "Bu konu için güvenilir kaynak bulunamadı.";
    const sourceLines = sources.length
      ? sources.map(source => `• ${source.type} – ${source.title || placeName}`).join("\n")
      : "• Kaynak alınamadı";
    return res.status(200).json({
      pythonBot: `📌 Python Bot Özeti\n\n${summary}\n\nKaynaklar:\n${sourceLines}`,
      sources
    });
  } catch (error) {
    console.error("Python bot kaynak hatası:", error);
    return res.status(200).json({
      pythonBot: "📌 Python Bot Özeti\n\nKaynak alınamadı. Bu konu için güvenilir kaynak bulunamadı.\n\nKaynaklar:\n• Kaynak alınamadı",
      sources: []
    });
  }
}
