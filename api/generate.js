import { GoogleGenAI } from "@google/genai";

export default async function handler(req, res) {
  const allowedOrigins = ["https://n1k-12d03.web.app", "http://127.0.0.1:5500", "http://localhost:5500"];
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

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

    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ error: "GEMINI_API_KEY Vercel ortam değişkeninde tanımlı değil." });
    }

    // Vercel panelinden tanımlayacağımız gizli anahtarı çağırıyoruz
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    // Gemini 2.5 Flash ile içerik üretme
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `Türkiye'deki "${sehirAdi}" adlı yer hakkında kültürel mirasa saygılı, doğrulanmamış bilgileri kesin gerçek gibi sunmayan, kısa ve sürükleyici bir yer hikayesi yaz. Yanıtı Türkçe ver.`,
    });

    return res.status(200).json({ hikaye: response.text || "" });

  } catch (error) {
    console.error("Gemini API Hatası:", error);
    return res.status(500).json({ error: "Hikaye oluşturulurken bir hata oluştu." });
  }
}
