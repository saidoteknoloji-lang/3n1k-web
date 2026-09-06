export default async function handler(req, res) {
  const allowedOrigins = [
    "https://n1k-12d03.web.app",
    "https://3n1k-web.vercel.app",
    "https://3n1k-web-git-main-saido1.vercel.app",
    "http://127.0.0.1:5500",
    "http://localhost:5500"
  ];
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

    const normalizeText = (value) => value.toLocaleLowerCase("tr-TR").normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "").replace(/ı/g, "i").replace(/ğ/g, "g")
      .replace(/ü/g, "u").replace(/ş/g, "s").replace(/ö/g, "o").replace(/ç/g, "c");
    const locationsResponse = await fetch("https://raw.githubusercontent.com/isubas/iller_ve_ilceler/master/iller_ve_ilceler.json");
    const locations = await locationsResponse.json();
    const normalizedPlace = normalizeText(sehirAdi);
    const knownPlace = Object.values(locations).some(province => {
      if (normalizeText(province.ad) === normalizedPlace) return true;
      return (province.ilceler || []).some(district =>
        normalizeText(`${district.ad}, ${province.ad}`) === normalizedPlace
      );
    });
    if (!knownPlace) {
      return res.status(404).json({ error: "Üzgünüm, bu yer adı bulunamadı." });
    }

    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ error: "GEMINI_API_KEY Vercel ortam değişkeninde tanımlı değil." });
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${encodeURIComponent(process.env.GEMINI_API_KEY)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: `Türkiye'deki "${sehirAdi}" yer adının kökenini ve adlandırılma hikâyesini araştıran Türkçe, bilgilendirici ve anlaşılır kısa bir metin hazırla. Şehrin genel turistik tanıtımını, doğal güzelliklerini veya genel tarihini anlatma; yalnızca yer adının anlamına, dilsel kökenine, kimler tarafından kullanıldığına, neden verildiğine ve zaman içinde nasıl değiştiğine odaklan. Yanıtı tam olarak aşağıdaki dört başlıkla ve her başlığın altında 3-5 cümleyi geçmeyen tek bir paragrafla ver. Başlıkları tek başına bir satırda yaz:

KİM?
Bu yer adını ilk kullanan, veren veya yaygınlaştıran kişi, topluluk, halk ya da uygarlık kimdir? Şehirde yaşamış tüm uygarlıkları listeleme; yalnızca adın kökeniyle doğrudan ilişkili aktörü anlat. Kişi veya topluluk adıyla ilgili güvenilir kanıt yoksa bunu açıkça belirt ve genel nüfus bilgisini yazma. Yeterli doğrulanmış bilgi yoksa "Bu konuda doğrulanmış bilgi bulunamadı." yaz.

NE?
"${sehirAdi}" yer adı ne anlama gelir? Hangi dile, eski ada veya kelime köküne dayandığı biliniyor mu? Şehrin konumunu, nüfusunu, turistik yerlerini veya doğal özelliklerini anlatma; yalnızca adın anlamını ve kökenini yaz. Köken kesin değilse olası açıklamaları kesin gerçek gibi sunma.

NEDEN?
Bu ad neden verilmiş olabilir? Adın bir kişi, topluluk, dil, coğrafi özellik veya tarihî olayla ilişkisi var mı? Şehrin genel tarihî önemini anlatma; yalnızca adlandırma nedenini açıkla. Emin olmadığın bilgileri kesin gerçek gibi sunma.

NASIL?
Bu yer adı tarih boyunca nasıl kullanıldı, değişti veya bugünkü biçimine ulaştı? Eski adları, farklı dillerdeki biçimleri ve ses değişimlerini yalnızca doğrulanabiliyorsa yaz. Şehrin siyasi veya ekonomik gelişimini anlatma; yalnızca adın değişimini anlat. Efsaneleri tarihsel gerçeklerden açıkça ayır.

Kurallar: Şehir tanıtımı yapma. Her paragrafta yer adının kendisiyle bağlantı kur; yer adını açıklamayan bilgileri çıkar. Her bölümü kısa tut ve 3-5 cümleyi geçme. Bilgi uydurma, etimoloji/tarih/kişi/olay icat etme, kaynak yoksa kesin konuşma. Yer adının kökeni bilinmiyorsa bunu açıkça belirt. Doğrulanmamış bir iddia için "rivayete göre" veya "doğrulanmamıştır" ifadesini kullan. Her başlığın altında yalnızca bir paragraf yaz. Başlıklar dışında giriş, sonuç, kaynakça veya madde işareti ekleme.`
            }]
          }]
        })
      }
    );
    const rawResponse = await response.text();
    let result;
    try {
      result = JSON.parse(rawResponse);
    } catch {
      return res.status(502).json({
        error: "Google Gemini geçersiz bir yanıt döndürdü.",
        detail: `Google HTTP ${response.status}: ${rawResponse.slice(0, 180)}`
      });
    }
    if (!response.ok) {
      return res.status(502).json({ error: "Gemini isteği başarısız.", detail: result.error?.message || "Bilinmeyen Gemini hatası." });
    }
    const hikaye = result.candidates?.[0]?.content?.parts?.map(part => part.text || "").join("").trim();
    return res.status(200).json({ hikaye: hikaye || "Gemini boş yanıt döndürdü." });

  } catch (error) {
    console.error("Gemini API Hatası:", error);
    return res.status(502).json({
      error: "Gemini hikaye servisi cevap vermedi.",
      detail: error instanceof Error ? error.message : "Bilinmeyen Gemini hatası."
    });
  }
}
