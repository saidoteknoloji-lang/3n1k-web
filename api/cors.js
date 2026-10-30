const allowedOrigins = new Set([
  "https://3n1k.com.tr",
  "https://n1k-12d03.web.app",
  "https://3n1k-web.vercel.app",
  "https://3n1k-web-git-main-saido1.vercel.app",
  "http://127.0.0.1:5500",
  "http://localhost:5500"
]);

const vercelPreviewOrigin = /^https:\/\/3n1k-[a-z0-9-]+-saido1\.vercel\.app$/;

export function setCorsHeaders(req, res) {
  const origin = req.headers.origin;
  if (allowedOrigins.has(origin) || vercelPreviewOrigin.test(origin || "")) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}
