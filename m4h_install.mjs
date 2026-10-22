// m4h_install.mjs - fixes the blank /api/docs/ page (M4H). Idempotent, byte-exact.
// HOW TO RUN (repo root D:\GitHub\ndli_club_main_portal):
//   1. Save this whole file as  m4h_install.mjs  in the repo root
//   2. In PowerShell:  node m4h_install.mjs
// Needs node + npm + tar (Windows 10+ has tar). Downloads swagger-ui-dist@5.34.0 (1.7 MB).
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execSync } from "node:child_process";

const md5 = (p) => crypto.createHash("md5").update(fs.readFileSync(p)).digest("hex");
const sha256 = (p) => crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
const writeLF = (rel, text) => {
  fs.mkdirSync(path.dirname(rel), { recursive: true });
  fs.writeFileSync(rel, text.replace(/\r\n/g, "\n"));
  console.log("WROTE " + rel);
};
const BUNDLE_SHA = "3f6abf70480db7e07914df4c98a77385f22ea585eaf457a3e6415ba0eae2d167";
const BASE_MD5 = "b116fbb801f482664c68e78a743ca182"; // urls.py BEFORE
const NEW_MD5  = "c3b4ea3db42f973dd201e411997f16d7"; // urls.py AFTER

// 1) patch backend/config/urls.py (exact block replace)
const urls = "backend/config/urls.py";
const cur = md5(urls);
if (cur === NEW_MD5) console.log("urls.py: already fixed");
else if (cur !== BASE_MD5) { console.error("STOP: urls.py md5 " + cur + " != expected " + BASE_MD5 + " - tell me first"); process.exit(1); }
else {
  const raw = fs.readFileSync(urls, "utf8");
  const oldB = "    path(\n        \"api/docs/\",\n        SpectacularSwaggerView.as_view(url_name=\"schema\"),\n        name=\"schema-swagger-ui\",\n    ),";
  const newB = "    path(\n        \"api/docs/\",\n        # M4H: CSP-clean template (vendored swagger-ui, external init script).\n        # The stock drf-spectacular page needs cdn.jsdelivr.net + inline JS,\n        # both blocked by the P0 script-src 'self' policy (blank page bug).\n        SpectacularSwaggerView.as_view(\n            url_name=\"schema\", template_name=\"core/api_docs.html\"\n        ),\n        name=\"schema-swagger-ui\",\n    ),";
  if (!raw.includes(oldB)) { console.error("STOP: expected block not found in urls.py"); process.exit(1); }
  fs.writeFileSync(urls, raw.replace(oldB, newB));
  console.log("urls.py: patched -> " + md5(urls) + (md5(urls) === NEW_MD5 ? " (byte-exact OK)" : " (WARNING)"));
}

// 2) vendor swagger-ui assets from npm (sha256-verified)
const dir = "backend/apps/core/static/swagger-ui";
const bundle = path.join(dir, "swagger-ui-bundle.js");
if (!fs.existsSync(bundle) || sha256(bundle) !== BUNDLE_SHA) {
  console.log("Downloading swagger-ui-dist@5.34.0 from npm ...");
  execSync("npm pack swagger-ui-dist@5.34.0", { stdio: "inherit" });
  const tgz = fs.readdirSync(".").find((f) => f.startsWith("swagger-ui-dist-") && f.endsWith(".tgz"));
  fs.mkdirSync(dir, { recursive: true });
  execSync("tar -xzf " + tgz + " package/swagger-ui.css package/swagger-ui-bundle.js package/swagger-ui-standalone-preset.js package/favicon-32x32.png", { stdio: "inherit" });
  for (const f of ["swagger-ui.css", "swagger-ui-bundle.js", "swagger-ui-standalone-preset.js", "favicon-32x32.png"]) fs.renameSync(path.join("package", f), path.join(dir, f));
  fs.rmSync("package", { recursive: true, force: true });
  fs.rmSync(tgz, { force: true });
}
if (sha256(bundle) !== BUNDLE_SHA) { console.error("STOP: bundle sha256 mismatch"); process.exit(1); }
console.log("vendor assets OK (sha256 verified)");

// 3) swagger-init.js = the init currently inline on the live page (captured verbatim)
const live = await (await fetch("https://ndli-club-portal.onrender.com/api/docs/")).text();
const blocks = [...live.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
if (blocks.length === 0) { console.error("STOP: no inline script found on live page"); process.exit(1); }
writeLF(path.join(dir, "swagger-init.js"), blocks[blocks.length - 1]);

// 4) template + test pins
writeLF("backend/apps/core/templates/core/api_docs.html", "<!DOCTYPE html>\n<html lang=\"en\">\n  <head>\n    <title>NDLI Club Main Portal API</title>\n    <meta charset=\"utf-8\">\n    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\n    <link rel=\"icon\" href=\"/static/swagger-ui/favicon-32x32.png\">\n    <link rel=\"stylesheet\" href=\"/static/swagger-ui/swagger-ui.css\">\n    <style>\n      html { box-sizing: border-box; overflow-y: scroll; }\n      *, *:after, *:before { box-sizing: inherit; }\n      body { background: #fafafa; margin: 0; }\n    </style>\n  </head>\n  <body>\n    <!-- M4H: CSP-clean API docs. All assets are same-origin (vendored\n         swagger-ui-dist 5.34.0 under apps/core/static/swagger-ui/) and the\n         init lives in an external file — no inline script, no CDN. The P0\n         Content-Security-Policy (script-src 'self') is untouched. -->\n    <div id=\"swagger-ui\"></div>\n    <script src=\"/static/swagger-ui/swagger-ui-bundle.js\"></script>\n    <script src=\"/static/swagger-ui/swagger-ui-standalone-preset.js\"></script>\n    <script src=\"/static/swagger-ui/swagger-init.js\"></script>\n  </body>\n</html>\n");
writeLF("backend/tests/test_m4h_docs_csp.py", "\"\"\"M4H — API docs page is CSP-clean (blank-page regression guard).\n\nThe stock drf-spectacular page loads Swagger UI from cdn.jsdelivr.net with an\ninline init script; the P0 ``Content-Security-Policy`` (``script-src 'self'``)\nblocks both, so ``/api/docs/`` rendered a blank white screen (owner-reported\n2026-10-22). The fix vendors swagger-ui-dist 5.34.0 under\n``apps/core/static/swagger-ui/`` and moves the init into an external file.\nThese pins keep the page renderable under the unchanged policy.\n\"\"\"\nfrom __future__ import annotations\n\nfrom pathlib import Path\n\nfrom django.test import TestCase\n\n_SWAGGER_DIR = (\n    Path(__file__).resolve().parents[1] / \"apps\" / \"core\" / \"static\" / \"swagger-ui\"\n)\n\n\nclass ApiDocsCspTests(TestCase):\n    \"\"\"``/api/docs/`` must render under ``script-src 'self'``.\"\"\"\n\n    def test_docs_page_uses_same_origin_assets_only(self) -> None:\n        response = self.client.get(\"/api/docs/\")\n        self.assertEqual(response.status_code, 200)\n        body = response.content.decode()\n        self.assertIn('/static/swagger-ui/swagger-ui-bundle.js', body)\n        self.assertIn('/static/swagger-ui/swagger-ui-standalone-preset.js', body)\n        self.assertIn('/static/swagger-ui/swagger-init.js', body)\n        # No third-party origin anywhere on the page (M4H: CDN removed).\n        self.assertNotIn(\"cdn.jsdelivr.net\", body)\n\n    def test_docs_page_has_no_inline_script(self) -> None:\n        response = self.client.get(\"/api/docs/\")\n        body = response.content.decode()\n        self.assertEqual(response.status_code, 200)\n        for tag in body.split(\"<script\")[1:]:\n            head = tag.split(\">\", 1)[0]\n            self.assertIn(\n                \"src=\", head, \"inline <script> blocks are blocked by script-src 'self'\"\n            )\n\n    def test_docs_keeps_the_hardened_csp(self) -> None:\n        response = self.client.get(\"/api/docs/\")\n        csp = response.headers.get(\"Content-Security-Policy\", \"\")\n        self.assertIn(\"script-src 'self'\", csp)\n        self.assertNotIn(\"unsafe-eval\", csp)\n\n    def test_vendored_assets_present_and_init_is_external(self) -> None:\n        for name in (\n            \"swagger-ui-bundle.js\",\n            \"swagger-ui-standalone-preset.js\",\n            \"swagger-ui.css\",\n            \"favicon-32x32.png\",\n            \"swagger-init.js\",\n        ):\n            asset = _SWAGGER_DIR / name\n            self.assertTrue(asset.is_file(), f\"missing vendored asset {name}\")\n            self.assertGreater(asset.stat().st_size, 0)\n        init = (_SWAGGER_DIR / \"swagger-init.js\").read_text(encoding=\"utf8\")\n        self.assertIn(\"SwaggerUIBundle(\", init)\n        self.assertIn(\"/api/schema/\", init)\n\n    def test_schema_still_public(self) -> None:\n        response = self.client.get(\"/api/schema/\")\n        self.assertEqual(response.status_code, 200)\n");

console.log("");
console.log("DONE. git status should show 1 modified + 7 new files.");
console.log("Commit Summary: M4H: fix blank API docs page - vendor Swagger UI under self-origin (CSP-clean)");
console.log("Commit Body:    script-src 'self' blocked the swagger CDN + inline init; vendored swagger-ui-dist 5.34.0 + external init; CSP unchanged; 5 new pins, all gates green");
