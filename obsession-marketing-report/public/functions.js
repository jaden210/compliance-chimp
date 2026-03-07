/**
 * Obsession Marketing Report — Firebase Cloud Functions
 *
 * Endpoints:
 *   GET  /pdf/:slug          — Generate & return audit report as PDF
 *   POST /api/send-confirm   — Send confirmation email with signed token
 *   GET  /api/verify-token   — Verify token from confirmation email
 *
 * Deploy:
 *   cd chimp-web/functions
 *   npm install
 *   firebase deploy --only functions
 */

const functions  = require("firebase-functions");
const admin      = require("firebase-admin");
const puppeteer  = require("puppeteer");
const nodemailer = require("nodemailer");
const crypto     = require("crypto");
const marked     = require("marked");
const path       = require("path");
const fs         = require("fs");

admin.initializeApp();

// ─── Config ────────────────────────────────────────────────────────────────
// Set via: firebase functions:config:set report.secret="..." report.base_url="..."
const SECRET    = (functions.config().report || {}).secret   || "change-me-in-prod";
const BASE_URL  = (functions.config().report || {}).base_url || "https://report.obsessionmarketing.com";
const FROM_EMAIL = "jaden@nebula.me";

// Nodemailer via SMTP (set via firebase functions:config:set smtp.host etc.)
function getTransport() {
  const smtp = functions.config().smtp || {};
  return nodemailer.createTransport({
    host:   smtp.host   || "smtp.gmail.com",
    port:   smtp.port   || 587,
    secure: false,
    auth: {
      user: smtp.user || FROM_EMAIL,
      pass: smtp.pass || "",
    },
  });
}

// ─── Token helpers ────────────────────────────────────────────────────────
function signToken(email, slug) {
  const payload = `${email}|${slug}|${Date.now()}`;
  const sig     = crypto.createHmac("sha256", SECRET).update(payload).digest("hex");
  return Buffer.from(`${payload}|${sig}`).toString("base64url");
}

function verifyTokenStr(token) {
  try {
    const decoded = Buffer.from(token, "base64url").toString("utf8");
    const parts   = decoded.split("|");
    if (parts.length !== 4) return null;
    const [email, slug, ts, sig] = parts;
    // Expire after 72 hours
    if (Date.now() - parseInt(ts) > 72 * 60 * 60 * 1000) return null;
    const expected = crypto.createHmac("sha256", SECRET)
      .update(`${email}|${slug}|${ts}`)
      .digest("hex");
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
    return { email, slug };
  } catch {
    return null;
  }
}

// ─── Markdown → styled HTML for PDF ─────────────────────────────────────
function mdToHtml(md, bizName) {
  const body = marked.parse(md);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap');
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Inter', -apple-system, sans-serif;
      font-size: 11pt;
      line-height: 1.65;
      color: #111827;
      padding: 48px 56px;
      max-width: 780px;
      margin: 0 auto;
    }
    .cover {
      text-align: center;
      padding: 60px 0 48px;
      border-bottom: 2px solid #e5e7eb;
      margin-bottom: 40px;
    }
    .cover .brand { font-size: 13pt; font-weight: 800; color: #1a1a2e; letter-spacing: .04em; }
    .cover .brand span { color: #e8463a; }
    .cover h1 { font-size: 22pt; font-weight: 800; color: #1a1a2e; margin: 16px 0 10px; line-height: 1.2; }
    .cover .sub { color: #6b7280; font-size: 11pt; }
    .cover .for { margin-top: 20px; font-size: 10pt; color: #9ca3af; }
    h1 { font-size: 16pt; font-weight: 800; color: #1a1a2e; margin: 32px 0 8px; }
    h2 { font-size: 13pt; font-weight: 700; color: #1a1a2e; margin: 28px 0 8px; border-bottom: 1.5px solid #e5e7eb; padding-bottom: 5px; }
    h3 { font-size: 11pt; font-weight: 700; color: #374151; margin: 18px 0 5px; }
    p  { margin-bottom: 9px; color: #374151; }
    ul, ol { margin: 6px 0 12px 20px; }
    li { margin-bottom: 4px; color: #374151; }
    strong { color: #111827; }
    table { width: 100%; border-collapse: collapse; margin: 14px 0; font-size: 10pt; }
    th { background: #1a1a2e; color: #fff; padding: 7px 10px; text-align: left; font-weight: 600; }
    td { padding: 7px 10px; border-bottom: 1px solid #e5e7eb; }
    tr:nth-child(even) td { background: #f9fafb; }
    blockquote { border-left: 3px solid #e8463a; padding: 8px 14px; background: #fff0ef; border-radius: 0 5px 5px 0; margin: 12px 0; }
    hr { border: none; border-top: 1px solid #e5e7eb; margin: 22px 0; }
    a { color: #4F46E5; }
    .footer {
      margin-top: 48px;
      padding-top: 20px;
      border-top: 1px solid #e5e7eb;
      font-size: 9pt;
      color: #9ca3af;
      text-align: center;
    }
  </style>
</head>
<body>
  <div class="cover">
    <div class="brand">Obsession <span>Marketing</span></div>
    <h1>Internet Best Practice Report</h1>
    <div class="sub">A personalized digital marketing audit</div>
    <div class="for">Prepared for ${escHtml(bizName)}</div>
  </div>
  ${body}
  <div class="footer">
    Obsession Marketing &nbsp;&middot;&nbsp; St. George, Utah &nbsp;&middot;&nbsp; jaden@nebula.me<br>
    This report is confidential and prepared exclusively for ${escHtml(bizName)}.
  </div>
</body>
</html>`;
}

function escHtml(s) {
  return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

// ─── PDF endpoint ─────────────────────────────────────────────────────────
exports.pdf = functions
  .runWith({ memory: "1GB", timeoutSeconds: 60 })
  .https.onRequest(async (req, res) => {
    // Expect: GET /pdf/crushers-golf-lounge
    const slug    = req.path.replace(/^\//, "").split("/")[0];
    const bizName = req.query.biz || slug.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase());

    if (!slug || slug.includes("..")) {
      return res.status(400).send("Invalid slug");
    }

    // Read the markdown report from Firestore or local storage
    // First try Firestore (production), fall back to bundled file
    let md = "";
    try {
      const db  = admin.firestore();
      const doc = await db.collection("reports").doc(slug).get();
      if (doc.exists) {
        md = doc.data().markdown || "";
      }
    } catch (e) {
      console.warn("Firestore read failed, trying local file:", e.message);
    }

    // Fallback: try a bundled reports/ directory
    if (!md) {
      const localPath = path.join(__dirname, "reports", `${slug}.md`);
      if (fs.existsSync(localPath)) {
        md = fs.readFileSync(localPath, "utf8");
      }
    }

    if (!md) {
      return res.status(404).send("Report not found for slug: " + slug);
    }

    const html = mdToHtml(md, bizName);

    let browser;
    try {
      browser = await puppeteer.launch({
        headless: "new",
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
      });
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: "networkidle0" });
      const pdf = await page.pdf({
        format:          "Letter",
        printBackground: true,
        margin:          { top: "0", right: "0", bottom: "0", left: "0" },
      });
      await browser.close();

      res.set("Content-Type",        "application/pdf");
      res.set("Content-Disposition", `attachment; filename="${slug}-audit-report.pdf"`);
      res.set("Cache-Control",       "public, max-age=3600");
      return res.send(pdf);
    } catch (err) {
      if (browser) await browser.close().catch(() => {});
      console.error("PDF generation error:", err);
      return res.status(500).send("PDF generation failed: " + err.message);
    }
  });

// ─── Send confirmation email ──────────────────────────────────────────────
exports.sendConfirm = functions.https.onRequest(async (req, res) => {
  res.set("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") {
    res.set("Access-Control-Allow-Methods", "POST");
    res.set("Access-Control-Allow-Headers", "Content-Type");
    return res.status(204).send("");
  }

  const { email, slug, bizName } = req.body || {};
  if (!email || !slug) return res.status(400).json({ error: "email and slug required" });

  const token       = signToken(email, slug);
  const confirmUrl  = `${BASE_URL}/${slug}?token=${token}&biz=${encodeURIComponent(bizName || slug)}`;

  const html = `
    <div style="font-family:-apple-system,sans-serif;max-width:520px;margin:0 auto;color:#111827">
      <div style="background:#1a1a2e;padding:20px 28px;border-radius:8px 8px 0 0">
        <span style="font-weight:800;color:#fff;font-size:15px">Obsession <span style="color:#e8463a">Marketing</span></span>
      </div>
      <div style="background:#fff;padding:32px 28px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px">
        <h2 style="font-size:18px;font-weight:800;margin:0 0 12px;color:#1a1a2e">Your interactive report is one click away</h2>
        <p style="color:#374151;margin:0 0 20px">Click the button below to unlock the Revenue Opportunity Calculator for <strong>${escHtml(bizName || slug)}</strong>. The link expires in 72 hours.</p>
        <a href="${confirmUrl}"
           style="display:inline-block;background:#e8463a;color:#fff;font-weight:700;font-size:15px;padding:13px 24px;border-radius:8px;text-decoration:none">
          Unlock My Calculator &rarr;
        </a>
        <p style="margin:24px 0 0;font-size:12px;color:#9ca3af">
          If you didn't request this, you can safely ignore this email.<br>
          Obsession Marketing &middot; St. George, Utah
        </p>
      </div>
    </div>`;

  try {
    const transport = getTransport();
    await transport.sendMail({
      from:    `"Obsession Marketing" <${FROM_EMAIL}>`,
      to:      email,
      subject: `Your ${bizName || "business"} report — confirm to unlock`,
      html,
    });
    return res.json({ ok: true });
  } catch (err) {
    console.error("Email send error:", err);
    return res.status(500).json({ error: "Failed to send email" });
  }
});

// ─── Verify token ─────────────────────────────────────────────────────────
exports.verifyToken = functions.https.onRequest((req, res) => {
  res.set("Access-Control-Allow-Origin", "*");
  const { token } = req.query;
  const result    = verifyTokenStr(token || "");
  if (!result) return res.status(401).json({ valid: false, error: "Invalid or expired token" });
  return res.json({ valid: true, email: result.email, slug: result.slug });
});
