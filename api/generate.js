import { setCorsHeaders } from "./cors.js";
import { Timestamp } from "firebase-admin/firestore";
import { getAdminFirestore } from "./firebase-admin.js";

const DEFAULT_EVREN_BASE_URL = "https://evren-llmapi.ssyz.org.tr";
const DEFAULT_EVREN_MODEL = "deepseek-v4.1-flash";
const EVREN_API_TIMEOUT_MS = 240000;
const EVREN_MAX_TOKENS = 4096;

export const config = {
  maxDuration: 300
};

function getErrorMessage(result, fallback) {
  const error = result?.error;
  if (typeof error === "string") return error;
  if (typeof error?.message === "string") return error.message;
  if (typeof result?.detail === "string") return result.detail;
  if (typeof result?.message === "string") return result.message;
  return fallback;
}

function getRetryAfterSeconds(response) {
  const value = Number(response.headers.get("retry-after"));
  return Number.isFinite(value) && value > 0 ? Math.ceil(value) : null;
}

function getTextContent(value) {
  if (typeof value === "string") return value.trim();
  if (!Array.isArray(value)) return "";

  return value
    .filter(block => typeof block === "string" || block?.type === "text")
    .map(block => typeof block === "string" ? block : block.text || "")
    .join("\n")
    .trim();
}

function extractStoryText(result) {
  const content = getTextContent(result.content)
    || getTextContent(result.choices?.[0]?.message?.content)
    || getTextContent(result.output_text)
    || getTextContent(result.message?.content)
    || getTextContent(result.completion);
  return content;
}

function getEmptyResponseDetail(result) {
  const content = result.content;
  const contentTypes = Array.isArray(content)
    ? content.map(block => typeof block === "object" ? block?.type || "unknown" : typeof block)
    : typeof content;
  const choice = result.choices?.[0];

  return JSON.stringify({
    fields: Object.keys(result).slice(0, 20),
    contentTypes,
    finishReason: choice?.finish_reason || result.stop_reason || null,
    model: result.model || null
  });
}

function normalizePlaceId(value) {
  return String(value || "").toLocaleLowerCase("tr-TR").normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ı/g, "i").replace(/ğ/g, "g").replace(/ü/g, "u")
    .replace(/ş/g, "s").replace(/ö/g, "o").replace(/ç/g, "c")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 120);
}

async function saveAiStory(placeName, story) {
  const placeId = normalizePlaceId(placeName) || "isimsiz-yer";
  await getAdminFirestore().collection("yerler").doc(placeId).set({
    yapayZeka: story,
    yapayZekaGuncelleme: Timestamp.now()
  }, { merge: true });
}

export default async function handler(req, res) {
  setCorsHeaders(req, res);

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Sadece POST istekleri desteklenir." });
  }

  try {
    const sehirAdi = typeof req.body?.sehirAdi === "string" ? req.body.sehirAdi.trim() : "";
    if (!sehirAdi || sehirAdi.length > 160) {
      return res.status(400).json({ error: "Şehir adı gönderilmedi." });
    }

    const apiKey = process.env.ANTHROPIC_AUTH_TOKEN;
    if (!apiKey) {
      return res.status(500).json({ error: "ANTHROPIC_AUTH_TOKEN Vercel ortam değişkeninde tanımlı değil." });
    }

    const baseUrl = (process.env.ANTHROPIC_BASE_URL || DEFAULT_EVREN_BASE_URL).replace(/\/+$/, "");
    const model = process.env.ANTHROPIC_MODEL || DEFAULT_EVREN_MODEL;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), EVREN_API_TIMEOUT_MS);
    let response;
    let rawResponse;
    try {
      response = await fetch(`${baseUrl}/v1/messages`, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "x-api-key": apiKey,
          "Content-Type": "application/json",
          "anthropic-version": "2023-06-01"
        },
        body: JSON.stringify({
          model,
          max_tokens: EVREN_MAX_TOKENS,
          system: `Türkiye'deki yer adlarının kökenini anlatan Türkçe bir yazım yardımcısısın. Kesin olmayan etimolojileri kesin gerçek gibi sunma; bilgi uydurma. Kullanıcıdan gelen yer adı için yalnızca adın anlamı, kökeni, adlandırılma nedeni ve tarih içindeki biçimleri hakkında yaz. Şehir tanıtımı, turistik yerler, nüfus ve genel şehir tarihiyle konuyu doldurma. Yanıtı yalnızca aşağıdaki dört başlık ve paragraflarla ver; giriş, sonuç veya kaynakça ekleme. Her başlık altında 3-5 cümleyi geçmeyen tek paragraf kullan. Güvenilir bilgi yoksa bunu açıkça belirt.`,
          messages: [{
            role: "user",
            content: `Türkiye'deki "${sehirAdi}" yer adının anlamı, kökeni ve adlandırılma hikâyesini hazırla. Yanıtı tam olarak aşağıdaki dört başlıkla ve her başlığın altında tek bir paragrafla ver. Başlıkları tek başına bir satırda yaz:

KİM?
Bu yer adını ilk kullanan, veren veya yaygınlaştıran kişi, topluluk, halk ya da uygarlık kimdir? Şehirde yaşamış tüm uygarlıkları listeleme; yalnızca adın kökeniyle doğrudan ilişkili aktörü anlat. Kişi veya topluluk adıyla ilgili güvenilir kanıt yoksa bunu açıkça belirt ve genel nüfus bilgisini yazma. Yeterli doğrulanmış bilgi yoksa "Bu konuda doğrulanmış bilgi bulunamadı." yaz.

NE?
"${sehirAdi}" yer adı ne anlama gelir? Hangi dile, eski ada veya kelime köküne dayandığı biliniyor mu? Şehrin konumunu, nüfusunu, turistik yerlerini veya doğal özelliklerini anlatma; yalnızca adın anlamını ve kökenini yaz. Köken kesin değilse olası açıklamaları kesin gerçek gibi sunma.

NEDEN?
Bu ad neden verilmiş olabilir? Adın bir kişi, topluluk, dil, coğrafi özellik veya tarihî olayla ilişkisi var mı? Şehrin genel tarihî önemini anlatma; yalnızca adlandırma nedenini açıkla. Emin olmadığın bilgileri kesin gerçek gibi sunma.

NASIL?
Bu yer adı tarih boyunca nasıl kullanıldı, değişti veya bugünkü biçimine ulaştı? Eski adları, farklı dillerdeki biçimleri ve ses değişimlerini yalnızca doğrulanabiliyorsa yaz. Şehrin siyasi veya ekonomik gelişimini anlatma; yalnızca adın değişimini anlat. Efsaneleri tarihsel gerçeklerden açıkça ayır.

Kurallar: Şehir tanıtımı yapma. Yer adının kökeni bilinmiyorsa bunu açıkça belirt. Doğrulanmamış etimolojileri, tarihleri ve kişileri kesin bilgi gibi sunma. Her başlığın altında yalnızca tek paragraf yaz; başlıklar dışında giriş, sonuç veya kaynakça ekleme.`,
          }]
        })
      });
      rawResponse = await response.text();
    } finally {
      clearTimeout(timeout);
    }

    let result;
    try {
      result = JSON.parse(rawResponse);
    } catch {
      return res.status(502).json({
        error: "Evren API geçersiz bir yanıt döndürdü.",
        detail: `Evren HTTP ${response.status}: ${rawResponse.slice(0, 180)}`
      });
    }
    if (!response.ok) {
      const detail = getErrorMessage(result, `Evren HTTP ${response.status}.`);
      if (response.status === 429) {
        const retryAfterSeconds = getRetryAfterSeconds(response);
        if (retryAfterSeconds) res.setHeader("Retry-After", String(retryAfterSeconds));
        return res.status(429).json({
          error: "Evren API istek sınırına ulaştı. Lütfen daha sonra tekrar deneyin.",
          ...(retryAfterSeconds ? { retryAfterSeconds } : {}),
          detail
        });
      }
      return res.status(502).json({ error: "Evren API isteği başarısız.", detail });
    }
    const hikaye = extractStoryText(result);
    if (!hikaye) {
      const detail = getEmptyResponseDetail(result);
      console.error("Evren API yanıtında çıkarılabilir metin yok:", detail);
      return res.status(502).json({
        error: "Evren API yanıtında hikâye metni bulunamadı.",
        detail
      });
    }

    try {
      await saveAiStory(sehirAdi, hikaye);
      return res.status(200).json({ hikaye, savedToFirebase: true });
    } catch (error) {
      console.error("AI hikayesi Firebase'e kaydedilemedi:", error);
      return res.status(200).json({
        hikaye,
        savedToFirebase: false,
        saveError: error instanceof Error ? error.message : "Bilinmeyen Firebase hatası."
      });
    }

  } catch (error) {
    console.error("Evren API hatası:", error);
    return res.status(502).json({
      error: error?.name === "AbortError"
        ? "Evren API zaman aşımına uğradı."
        : "Evren hikaye servisi cevap vermedi.",
      detail: error instanceof Error ? error.message : "Bilinmeyen Evren API hatası."
    });
  }
}
