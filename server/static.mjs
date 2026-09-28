import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";

const root = resolve("dist");
const host = process.env.HOST || "127.0.0.1";
const port = Number(process.env.PORT || 4173);

const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
};

const contentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://unpkg.com",
  "style-src 'self' 'unsafe-inline' https://unpkg.com",
  "img-src 'self' data: blob: https://*.tile.openstreetmap.org https://unpkg.com",
  "font-src 'self' data:",
  "connect-src 'self' https://data.grandlyon.com https://download.data.grandlyon.com https://api-adresse.data.gouv.fr https://*.tile.openstreetmap.org",
  "worker-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "object-src 'none'",
].join("; ");

function headers(filePath) {
  const fresh = filePath.endsWith("sw.js") || filePath.endsWith("index.html");
  return {
    "Content-Type": types[extname(filePath)] || "application/octet-stream",
    "Cache-Control": fresh ? "no-cache" : "public, max-age=3600",
    "Content-Security-Policy": contentSecurityPolicy,
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "X-Content-Type-Options": "nosniff",
    "Permissions-Policy": "geolocation=(self), camera=(), microphone=()",
  };
}

function fileFor(urlPath) {
  const decoded = decodeURIComponent(urlPath.split("?")[0]);
  const relative = normalize(decoded).replace(/^(\.\.(\/|\\|$))+/, "");
  const candidates = [relative, `${relative}.html`, join(relative, "index.html")];
  if (relative === "/" || relative === "") {
    candidates.unshift("/index.html");
  }
  for (const candidate of candidates) {
    const filePath = resolve(root, `.${candidate.startsWith("/") ? candidate : `/${candidate}`}`);
    if (!filePath.startsWith(root) || !existsSync(filePath)) {
      continue;
    }
    if (statSync(filePath).isFile()) {
      return filePath;
    }
  }
  const fallback = join(root, "index.html");
  return existsSync(fallback) ? fallback : null;
}

const server = createServer((request, response) => {
  if (!request.url || request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405).end();
    return;
  }
  const filePath = fileFor(request.url);
  if (!filePath) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Introuvable");
    return;
  }
  const size = statSync(filePath).size;
  response.writeHead(200, { ...headers(filePath), "Content-Length": size });
  if (request.method === "HEAD") {
    response.end();
    return;
  }
  createReadStream(filePath).pipe(response);
});

server.listen(port, host, () => {
  console.log(`PWA sur http://${host}:${port}`);
});
