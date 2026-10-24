/**
 * Before-load proxy.
 *
 * When the browser is pointed at this proxy, it receives the CORRECTED page
 * instead of the original. For a URL that was analysed, the stored corrected
 * snapshot is served (with all non-rejected fixes applied). Other requests are
 * passed through untouched.
 *
 * HTTP only: HTTPS requires a local certificate (MITM), which is intentionally
 * not enabled here.
 */
import http from "node:http";
import { sessionForUrl, renderSession } from "./external.js";

const MAX_BYTES = 3 * 1024 * 1024;

export function startProxy(port = 4102) {
  const server = http.createServer(async (req, res) => {
    if (req.method === "CONNECT") {
      res.writeHead(501, { "content-type": "text/plain" });
      res.end(
        "HTTPS interception is not enabled in this demo. Use an http:// page.",
      );
      return;
    }
    const target = req.url;
    if (!/^https?:\/\//i.test(target)) {
      res.writeHead(400, { "content-type": "text/plain" });
      res.end("Absolute URL required (configure this as an HTTP proxy).");
      return;
    }
    try {
      const stored = sessionForUrl(target);
      if (stored) {
        const html = renderSession(stored);
        res.writeHead(200, {
          "content-type": "text/html; charset=utf-8",
          "cache-control": "no-store",
          "x-sugamya-before-load": stored.id,
        });
        res.end(html);
        return;
      }
      const upstream = await fetch(target, {
        redirect: "follow",
        headers: { "accept-encoding": "identity" },
      });
      const type = upstream.headers.get("content-type") || "";
      if (type.includes("text/html")) {
        const text = await upstream.text();
        // No analysis for this URL yet: pass the page through unchanged.
        res.writeHead(upstream.status, {
          "content-type": "text/html; charset=utf-8",
          "cache-control": "no-store",
          "x-sugamya-before-load": "none",
        });
        res.end(text);
        return;
      }
      const buf = Buffer.from(await upstream.arrayBuffer());
      if (buf.length > MAX_BYTES) {
        res.writeHead(413);
        res.end("Upstream asset too large");
        return;
      }
      res.writeHead(upstream.status, { "content-type": type });
      res.end(buf);
    } catch (e) {
      res.writeHead(502, { "content-type": "text/plain" });
      res.end("Proxy error: " + String(e.message || e).slice(0, 120));
    }
  });
  server.listen(port, "127.0.0.1", () => {
    console.log(
      `Sugamya before-load proxy on ${port}. Open an http:// page via a browser launched with --proxy-server=http://127.0.0.1:${port}.`,
    );
  });
  return server;
}
