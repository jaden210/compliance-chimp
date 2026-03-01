import { onCall, onRequest, HttpsError } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { defineSecret } from "firebase-functions/params";
import * as admin from "firebase-admin";

const scraperIngestSecret = defineSecret("SCRAPER_INGEST_SECRET");
const bouncerApiKey = defineSecret("BOUNCER_API_KEY");
const whoisApiKey = defineSecret("WHOIS_API_KEY");

const db = () => admin.firestore();

// ── Types ─────────────────────────────────────────────────────────────────────

type LeadSource =
  | "state_licensing"
  | "angi"
  | "healthgrades"
  | "avvo"
  | "opentable"
  | "houzz"
  | "indeed_jobs"
  | "facebook"
  | "instagram"
  | "chamber"
  | "bbb"
  | "whois"
  | "manual";

type LeadStatus =
  | "new"
  | "queued"
  | "sent"
  | "bounced"
  | "replied"
  | "converted"
  | "suppressed";

interface LeadInput {
  email: string;
  name?: string;
  businessName?: string;
  phone?: string;
  website?: string;
  niche?: string;
  industry?: string;
  state?: string;
  city?: string;
  zip?: string;
  source: LeadSource;
  sourceUrl?: string;
  sourceDetail?: string;
}

// ── Auth helpers ──────────────────────────────────────────────────────────────

function requireAuth(request: any): string {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Authentication required.");
  }
  return request.auth.uid;
}

async function requireDev(request: any): Promise<string> {
  const uid = requireAuth(request);
  const userDoc = await db().doc(`user/${uid}`).get();
  if (!userDoc.exists || userDoc.data()?.isDev !== true) {
    throw new HttpsError("permission-denied", "Dev access required.");
  }
  return uid;
}

function requireScraperSecret(req: any): void {
  const provided = req.headers["x-scraper-secret"];
  const expected = process.env.SCRAPER_INGEST_SECRET;
  if (!expected || provided !== expected) {
    throw new HttpsError("unauthenticated", "Invalid scraper secret.");
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Chunk an array into groups of n. */
function chunk<T>(arr: T[], n: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += n) chunks.push(arr.slice(i, i + n));
  return chunks;
}

/** Find existing emails in the lead collection (chunked to stay under Firestore 'in' limit of 30). */
async function findExistingEmails(emails: string[]): Promise<Set<string>> {
  const existing = new Set<string>();
  for (const batch of chunk(emails, 30)) {
    const snap = await db().collection("lead").where("email", "in", batch).get();
    snap.docs.forEach((d) => existing.add(d.data().email));
  }
  return existing;
}

// ── 1. ingestLeads ────────────────────────────────────────────────────────────

/**
 * POST /ingestLeads
 * Bulk ingest leads from scrapers. Deduplicates by email.
 * Auth: X-Scraper-Secret header.
 * Body: { leads: LeadInput[] }  (max 500)
 */
export const ingestLeads = onRequest(
  { secrets: [scraperIngestSecret], timeoutSeconds: 120, cors: false },
  async (req, res): Promise<void> => {
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    try {
      requireScraperSecret(req);
    } catch {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const { leads } = req.body as { leads: LeadInput[] };

    if (!Array.isArray(leads) || leads.length === 0) {
      res.status(400).json({ error: "leads array is required and must not be empty" });
      return;
    }
    if (leads.length > 500) {
      res.status(400).json({ error: "Max 500 leads per request" });
      return;
    }

    // Validate and normalize emails
    const validLeads: LeadInput[] = [];
    let errors = 0;
    for (const lead of leads) {
      if (!lead.email || typeof lead.email !== "string" || !lead.source) {
        errors++;
        continue;
      }
      validLeads.push({ ...lead, email: normalizeEmail(lead.email) });
    }

    const emails = validLeads.map((l) => l.email);
    const existingEmails = await findExistingEmails(emails);

    const newLeads = validLeads.filter((l) => !existingEmails.has(l.email));
    const skipped = validLeads.length - newLeads.length;

    const now = admin.firestore.FieldValue.serverTimestamp();
    let inserted = 0;

    for (const batch of chunk(newLeads, 500)) {
      const writeBatch = db().batch();
      for (const lead of batch) {
        const ref = db().collection("lead").doc();
        writeBatch.set(ref, {
          ...lead,
          status: "new" as LeadStatus,
          createdAt: now,
          updatedAt: now,
        });
      }
      await writeBatch.commit();
      inserted += batch.length;
    }

    res.status(200).json({ received: leads.length, inserted, skipped, errors });
  }
);

// ── 2. getLeads ───────────────────────────────────────────────────────────────

/**
 * onCall: getLeads
 * Paginated list of leads with optional filters.
 * Auth: isDev only.
 */
export const getLeads = onCall({}, async (request) => {
  await requireDev(request);

  const {
    status,
    source,
    state,
    niche,
    dateFrom,
    dateTo,
    pageSize = 50,
    startAfter,
  } = (request.data || {}) as {
    status?: LeadStatus;
    source?: LeadSource;
    state?: string;
    niche?: string;
    dateFrom?: string;
    dateTo?: string;
    pageSize?: number;
    startAfter?: string;
  };

  const limit = Math.min(pageSize, 200);
  let query: admin.firestore.Query = db().collection("lead").orderBy("createdAt", "desc");

  if (status) query = query.where("status", "==", status);
  if (source) query = query.where("source", "==", source);
  if (state) query = query.where("state", "==", state);
  if (niche) query = query.where("niche", "==", niche);
  if (dateFrom) query = query.where("createdAt", ">=", new Date(dateFrom));
  if (dateTo) query = query.where("createdAt", "<=", new Date(dateTo));

  if (startAfter) {
    const cursorDoc = await db().collection("lead").doc(startAfter).get();
    if (cursorDoc.exists) query = query.startAfter(cursorDoc);
  }

  query = query.limit(limit + 1);
  const snap = await query.get();
  const hasMore = snap.docs.length > limit;
  const docs = hasMore ? snap.docs.slice(0, limit) : snap.docs;

  const leads = docs.map((d) => ({ id: d.id, ...d.data() }));
  return {
    leads,
    hasMore,
    nextCursor: hasMore ? docs[docs.length - 1].id : null,
  };
});

// ── 3. getLeadStats ───────────────────────────────────────────────────────────

/**
 * onCall: getLeadStats
 * Dashboard stats — ingestion counts, source breakdown, funnel metrics.
 * Auth: isDev only.
 */
export const getLeadStats = onCall({}, async (request) => {
  await requireDev(request);

  const { days = 30 } = (request.data || {}) as { days?: number };
  const lookback = Math.min(days, 90);
  const since = new Date(Date.now() - lookback * 24 * 60 * 60 * 1000);
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [allSnap, recentSnap] = await Promise.all([
    db().collection("lead").get(),
    db().collection("lead").where("createdAt", ">=", since).orderBy("createdAt", "asc").get(),
  ]);

  const bySource: Record<string, number> = {};
  const byStatus: Record<string, number> = {};
  const byState: Record<string, number> = {};

  for (const doc of allSnap.docs) {
    const d = doc.data();
    bySource[d.source] = (bySource[d.source] || 0) + 1;
    byStatus[d.status] = (byStatus[d.status] || 0) + 1;
    if (d.state) byState[d.state] = (byState[d.state] || 0) + 1;
  }

  const dailyMap: Record<string, { inserted: number; source: Record<string, number> }> = {};
  let newLast24h = 0;
  let newLast7d = 0;

  for (const doc of recentSnap.docs) {
    const d = doc.data();
    const createdAt: Date = d.createdAt?.toDate ? d.createdAt.toDate() : new Date(d.createdAt);
    const dateKey = createdAt.toISOString().slice(0, 10);

    if (!dailyMap[dateKey]) dailyMap[dateKey] = { inserted: 0, source: {} };
    dailyMap[dateKey].inserted++;
    dailyMap[dateKey].source[d.source] = (dailyMap[dateKey].source[d.source] || 0) + 1;

    if (createdAt >= since24h) newLast24h++;
    if (createdAt >= since7d) newLast7d++;
  }

  const dailyCounts = Object.entries(dailyMap)
    .map(([date, v]) => ({ date, ...v }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    totalLeads: allSnap.size,
    newLast24h,
    newLast7d,
    newLast30d: recentSnap.size,
    bySource,
    byStatus,
    byState,
    dailyCounts,
  };
});

// ── 4. exportLeads ────────────────────────────────────────────────────────────

/**
 * GET /exportLeads
 * CSV export for outreach tools.
 * Auth: X-Scraper-Secret header.
 * Query: ?status=new&source=angi&state=UT&limit=500&markQueued=true
 */
export const exportLeads = onRequest(
  { secrets: [scraperIngestSecret], timeoutSeconds: 120, cors: false },
  async (req, res): Promise<void> => {
    if (req.method !== "GET") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    try {
      requireScraperSecret(req);
    } catch {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const status = (req.query.status as string) || "new";
    const source = req.query.source as string | undefined;
    const state = req.query.state as string | undefined;
    const limit = Math.min(parseInt(req.query.limit as string) || 500, 5000);
    const markQueued = req.query.markQueued === "true";

    let query: admin.firestore.Query = db()
      .collection("lead")
      .where("status", "==", status)
      .orderBy("createdAt", "asc")
      .limit(limit);

    if (source) query = query.where("source", "==", source);
    if (state) query = query.where("state", "==", state);

    const snap = await query.get();

    const headers = ["id", "email", "name", "businessName", "phone", "website", "niche", "state", "city", "source", "sourceDetail", "createdAt"];
    const rows: string[] = [headers.join(",")];

    for (const doc of snap.docs) {
      const d = doc.data();
      const createdAt = d.createdAt?.toDate ? d.createdAt.toDate().toISOString() : "";
      const row = [
        doc.id,
        d.email || "",
        d.name || "",
        d.businessName || "",
        d.phone || "",
        d.website || "",
        d.niche || "",
        d.state || "",
        d.city || "",
        d.source || "",
        d.sourceDetail || "",
        createdAt,
      ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",");
      rows.push(row);
    }

    if (markQueued && snap.docs.length > 0) {
      const now = admin.firestore.FieldValue.serverTimestamp();
      for (const batch of chunk(snap.docs, 500)) {
        const writeBatch = db().batch();
        for (const doc of batch) {
          writeBatch.update(doc.ref, { status: "queued", updatedAt: now });
        }
        await writeBatch.commit();
      }
    }

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="leads-${Date.now()}.csv"`);
    res.status(200).send(rows.join("\n"));
  }
);

// ── 5. updateLeadStatus ───────────────────────────────────────────────────────

/**
 * onCall: updateLeadStatus
 * Bulk status update on leads.
 * Auth: isDev only.
 */
export const updateLeadStatus = onCall({}, async (request) => {
  await requireDev(request);

  const { ids, status, outreachSentAt } = (request.data || {}) as {
    ids: string[];
    status: LeadStatus;
    outreachSentAt?: string;
  };

  if (!Array.isArray(ids) || ids.length === 0) {
    throw new HttpsError("invalid-argument", "ids array is required");
  }
  if (ids.length > 500) {
    throw new HttpsError("invalid-argument", "Max 500 ids per call");
  }
  if (!status) {
    throw new HttpsError("invalid-argument", "status is required");
  }

  const now = admin.firestore.FieldValue.serverTimestamp();
  let updated = 0;
  let errors = 0;

  for (const batch of chunk(ids, 500)) {
    const writeBatch = db().batch();
    for (const id of batch) {
      try {
        const ref = db().collection("lead").doc(id);
        const update: any = { status, updatedAt: now };
        if (status === "sent" && outreachSentAt) {
          update.outreachSentAt = new Date(outreachSentAt);
        }
        if (status === "bounced") {
          update.outreachBounced = true;
        }
        if (status === "converted") {
          update.convertedAt = now;
        }
        writeBatch.update(ref, update);
        updated++;
      } catch {
        errors++;
      }
    }
    await writeBatch.commit();
  }

  return { updated, errors };
});

// ── 6. enrichLeads ────────────────────────────────────────────────────────────

/**
 * onCall: enrichLeads
 * WHOIS + Bouncer email verification enrichment.
 * Auth: isDev only.
 */
export const enrichLeads = onCall(
  { secrets: [bouncerApiKey, whoisApiKey], timeoutSeconds: 300 },
  async (request) => {
    await requireDev(request);

    const { ids, limit = 100 } = (request.data || {}) as {
      ids?: string[];
      limit?: number;
    };

    let leads: admin.firestore.DocumentSnapshot[] = [];

    if (ids && ids.length > 0) {
      const fetched = await Promise.all(ids.slice(0, 100).map((id) => db().collection("lead").doc(id).get()));
      leads = fetched.filter((d) => d.exists);
    } else {
      const snap = await db()
        .collection("lead")
        .where("status", "==", "new")
        .where("emailVerified", "==", null)
        .limit(Math.min(limit, 100))
        .get();
      leads = snap.docs;
    }

    let whoisHits = 0;
    let verified = 0;
    let bounced = 0;

    for (const doc of leads) {
      const data = doc.data()!;
      const update: any = { updatedAt: admin.firestore.FieldValue.serverTimestamp() };

      // WHOIS enrichment
      if (data.website && process.env.WHOIS_API_KEY) {
        try {
          const domain = new URL(data.website).hostname.replace(/^www\./, "");
          const whoisRes = await fetch(
            `https://www.whoisxmlapi.com/whoisserver/WhoisService?apiKey=${process.env.WHOIS_API_KEY}&domainName=${domain}&outputFormat=JSON`
          );
          const whoisJson: any = await whoisRes.json();
          const registrantEmail = whoisJson?.WhoisRecord?.registrant?.email;
          if (registrantEmail && registrantEmail !== data.email && !registrantEmail.includes("privacy") && !registrantEmail.includes("redacted")) {
            update.whoisEmail = registrantEmail.toLowerCase();
            whoisHits++;
          }
        } catch {
          // silently skip failed WHOIS lookups
        }
      }

      // Bouncer email verification
      if (process.env.BOUNCER_API_KEY) {
        try {
          const bouncerRes = await fetch(
            `https://verifier.meetchopra.com/verify/${encodeURIComponent(data.email)}?token=${process.env.BOUNCER_API_KEY}`
          );
          const bouncerJson: any = await bouncerRes.json();
          const isValid = bouncerJson?.status === "valid";
          update.emailVerified = isValid;
          update.emailVerifiedAt = admin.firestore.FieldValue.serverTimestamp();
          if (isValid) {
            verified++;
          } else {
            update.status = "bounced";
            update.outreachBounced = true;
            bounced++;
          }
        } catch {
          // silently skip failed Bouncer calls
        }
      }

      await doc.ref.update(update);
    }

    return {
      processed: leads.length,
      whoisHits,
      verified,
      bounced,
    };
  }
);

// ── 7. dedupeLeads ────────────────────────────────────────────────────────────

async function runDedup(): Promise<{ duplicatesFound: number; removed: number }> {
  const snap = await db().collection("lead").orderBy("createdAt", "asc").get();

  const seen = new Map<string, string>();
  const toDelete: admin.firestore.DocumentReference[] = [];

  for (const doc of snap.docs) {
    const email = doc.data().email;
    if (!email) continue;
    if (seen.has(email)) {
      toDelete.push(doc.ref);
    } else {
      seen.set(email, doc.id);
    }
  }

  for (const batch of chunk(toDelete, 500)) {
    const writeBatch = db().batch();
    for (const ref of batch) writeBatch.delete(ref);
    await writeBatch.commit();
  }

  return { duplicatesFound: toDelete.length, removed: toDelete.length };
}

/**
 * onCall: dedupeLeads
 * Manual dedup sweep.
 * Auth: isDev only.
 */
export const dedupeLeads = onCall({ timeoutSeconds: 300 }, async (request) => {
  await requireDev(request);
  return runDedup();
});

// ── 8. scheduledDedupe ────────────────────────────────────────────────────────

/**
 * Nightly dedup pass at 2 AM Central (08:00 UTC).
 */
export const scheduledDedupe = onSchedule(
  { schedule: "0 8 * * *", timeoutSeconds: 300 },
  async () => {
    const result = await runDedup();
    console.log(`Scheduled dedup complete: ${result.removed} duplicates removed.`);
  }
);
