import { onCall, onRequest, HttpsError } from "firebase-functions/v2/https";
import { onDocumentCreated, onDocumentUpdated } from "firebase-functions/v2/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { defineSecret } from "firebase-functions/params";
import * as admin from "firebase-admin";
import * as Busboy from "busboy";
import {
  CONSULTATION_LEAD_SENDERS,
  buildVideoFollowupEmailHtml,
  buildVideoFollowupEmailText,
  buildNonViewerFollowupEmailHtml,
  buildNonViewerFollowupEmailText,
} from "./consultation-emails";

const xaiApiKey = defineSecret("XAI_API_KEY");
const sendgridApiKey = defineSecret("SENDGRID_API_KEY");
const googlePlacesApiKey = defineSecret("GOOGLE_PLACES_API_KEY");
const bouncerApiKey = defineSecret("BOUNCER_API_KEY");

const db = () => admin.firestore();

// ── Types ─────────────────────────────────────────────────────────────────────

type SalesLeadStatus =
  | "new"
  | "contacted"
  | "qualified"
  | "proposal"
  | "negotiation"
  | "won"
  | "lost"
  | "test";

type SalesLeadSource = "ai_research" | "manual" | "referral" | "signup";

type ActivityType =
  | "note"
  | "call"
  | "email_sent"
  | "email_received"
  | "status_change"
  | "lead_created"
  | "lead_archived"
  | "lead_unarchived"
  | "email_generated"
  | "consultation_generated"
  | "flow_snoozed"
  | "flow_dismissed"
  | "flow_analyzed"
  | "account_signup"
  | "link_clicked";

interface VerificationSignals {
  hasGoogleListing?: boolean;
  googlePlaceId?: string;
  hasReviews?: boolean;
  recentReviews?: boolean;
  hasWebsite?: boolean;
  hasSocialMedia?: boolean;
  hasPhone?: boolean;
  lastActivityIndicator?: string;
}

interface SalesLeadInput {
  contactName?: string;
  email?: string;
  phone?: string;
  businessName: string;
  website?: string;
  industry?: string;
  state?: string;
  city?: string;
  zip?: string;
  source: SalesLeadSource;
  researchSessionId?: string;
  employeeEstimate?: string;
  yearEstablished?: string;
  fitReason?: string;
  bestContactMethod?: string;
  googleMapsUrl?: string;
  verificationSignals?: VerificationSignals;
  skipConsultation?: boolean;
}

// ── Auth ──────────────────────────────────────────────────────────────────────

function requireAuth(request: any): string {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Authentication required.");
  }
  return request.auth.uid;
}

interface ActorInfo {
  uid: string;
  name: string;
  email: string;
}

async function requireDev(request: any): Promise<string> {
  const uid = requireAuth(request);
  const userDoc = await db().doc(`user/${uid}`).get();
  if (!userDoc.exists || userDoc.data()?.isDev !== true) {
    throw new HttpsError("permission-denied", "Dev access required.");
  }
  return uid;
}

async function getActorInfo(uid: string): Promise<ActorInfo> {
  const userDoc = await db().doc(`user/${uid}`).get();
  const data = userDoc.data();
  return {
    uid,
    name: data?.name || data?.email || uid,
    email: data?.email || "",
  };
}

const AGENT_ACTOR: ActorInfo = {
  uid: "system",
  name: "Ulysses (AI)",
  email: "",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validatePhone(phone: string): boolean {
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 10 && digits.length <= 15;
}

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return `+${digits}`;
}

async function addActivity(
  leadId: string,
  type: ActivityType,
  content: string,
  actor: ActorInfo,
  actorType: "user" | "agent" = "user",
  extra: Record<string, any> = {}
) {
  await db()
    .collection(`sales-leads/${leadId}/activity`)
    .add({
      type,
      content,
      createdBy: actor.uid,
      actorName: actor.name,
      actorType,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      ...extra,
    });
}

// ── Link Tracking ─────────────────────────────────────────────────────────────

const TRACKED_DOMAINS = ["compliancechimp.com", "compliancechimp.app", "compliancechimp.org"];

function appendTrackingParams(html: string, leadId: string): string {
  return html.replace(/href="(https?:\/\/[^"]+)"/gi, (_match, url: string) => {
    try {
      const parsed = new URL(url);
      if (!TRACKED_DOMAINS.some(d => parsed.hostname === d || parsed.hostname.endsWith(`.${d}`))) {
        return `href="${url}"`;
      }
      if (parsed.searchParams.has("lid")) return `href="${url}"`;
      parsed.searchParams.set("lid", leadId);
      if (!parsed.searchParams.has("ref")) parsed.searchParams.set("ref", "sales_email");
      return `href="${parsed.toString()}"`;
    } catch {
      return `href="${url}"`;
    }
  });
}

// ── Lead CRUD ─────────────────────────────────────────────────────────────────

export const createSalesLead = onCall(
  { secrets: [] },
  async (request) => {
    const uid = await requireDev(request);
    const actor = await getActorInfo(uid);
    const data = request.data as SalesLeadInput;

    if (!data.businessName?.trim()) {
      throw new HttpsError("invalid-argument", "Business name is required.");
    }

    const normalizedBiz = data.businessName.trim().toLowerCase();
    const dupeQuery = db()
      .collection("sales-leads")
      .where("businessNameLower", "==", normalizedBiz);

    const existing = await dupeQuery.limit(1).get();
    if (!existing.empty) {
      const existingLead = existing.docs[0].data();
      const sameArea =
        (!data.city && !data.state) ||
        (!existingLead.city && !existingLead.state) ||
        (existingLead.city?.toLowerCase() === data.city?.trim().toLowerCase() &&
          existingLead.state?.toLowerCase() === data.state?.trim().toLowerCase());
      if (sameArea) {
        throw new HttpsError(
          "already-exists",
          `A lead for "${data.businessName.trim()}" already exists.`
        );
      }
    }

    const normalizedEmail = data.email?.trim().toLowerCase() || null;
    if (normalizedEmail) {
      const emailDupe = await db()
        .collection("sales-leads")
        .where("email", "==", normalizedEmail)
        .limit(1)
        .get();
      if (!emailDupe.empty) {
        throw new HttpsError(
          "already-exists",
          `A lead with email ${normalizedEmail} already exists.`
        );
      }
    }

    const now = admin.firestore.FieldValue.serverTimestamp();
    const doc = await db()
      .collection("sales-leads")
      .add({
        contactName: data.contactName?.trim() || null,
        email: normalizedEmail,
        phone: data.phone?.trim() ? normalizePhone(data.phone) : null,
        businessName: data.businessName.trim(),
        businessNameLower: normalizedBiz,
        website: data.website?.trim() || null,
        industry: data.industry?.trim() || null,
        state: data.state?.trim() || null,
        city: data.city?.trim() || null,
        zip: data.zip?.trim() || null,
        source: data.source === "ai_research"
          ? `${actor.name.split(" ")[0]} research`
          : data.source || "manual",
        researchSessionId: data.researchSessionId || null,
        employeeEstimate: data.employeeEstimate?.trim() || null,
        yearEstablished: data.yearEstablished?.trim() || null,
        fitReason: data.fitReason?.trim() || null,
        bestContactMethod: data.bestContactMethod?.trim() || null,
        googleMapsUrl: data.googleMapsUrl?.trim() || null,
        verificationSignals: data.verificationSignals || null,
        status: "new" as SalesLeadStatus,
        consultationStatus: data.skipConsultation ? null : normalizedEmail ? "pending" : null,
        nextFollowUp: null,
        createdAt: now,
        updatedAt: now,
        lastContactedAt: null,
        createdBy: uid,
      });

    await addActivity(doc.id, "lead_created", "Lead created", actor);

    return { id: doc.id };
  }
);

export const updateSalesLead = onCall(
  { secrets: [] },
  async (request) => {
    const uid = await requireDev(request);
    const actor = await getActorInfo(uid);
    const { leadId, ...updates } = request.data as any;

    if (!leadId) {
      throw new HttpsError("invalid-argument", "Lead ID is required.");
    }

    const ref = db().doc(`sales-leads/${leadId}`);
    const snap = await ref.get();
    if (!snap.exists) {
      throw new HttpsError("not-found", "Lead not found.");
    }

    const allowed: Record<string, any> = {};
    if (updates.contactName !== undefined) allowed.contactName = updates.contactName.trim();
    if (updates.email !== undefined) {
      if (!validateEmail(updates.email)) throw new HttpsError("invalid-argument", "Invalid email.");
      allowed.email = updates.email.trim().toLowerCase();
    }
    if (updates.phone !== undefined) {
      if (!validatePhone(updates.phone)) throw new HttpsError("invalid-argument", "Invalid phone.");
      allowed.phone = normalizePhone(updates.phone);
    }
    if (updates.businessName !== undefined) allowed.businessName = updates.businessName.trim();
    if (updates.website !== undefined) allowed.website = updates.website?.trim() || null;
    if (updates.industry !== undefined) allowed.industry = updates.industry;
    if (updates.state !== undefined) allowed.state = updates.state;
    if (updates.city !== undefined) allowed.city = updates.city;
    if (updates.zip !== undefined) allowed.zip = updates.zip;
    if (updates.nextFollowUp !== undefined) allowed.nextFollowUp = updates.nextFollowUp;

    if (updates.status !== undefined) {
      const oldStatus = snap.data()?.status;
      allowed.status = updates.status;
      await addActivity(leadId, "status_change", `Status changed from ${oldStatus} to ${updates.status}`, actor, "user", {
        fromStatus: oldStatus,
        toStatus: updates.status,
      });
    }

    allowed.updatedAt = admin.firestore.FieldValue.serverTimestamp();
    await ref.update(allowed);
    return { success: true };
  }
);

export const deleteSalesLead = onCall(
  { secrets: [] },
  async (request) => {
    const uid = await requireDev(request);
    const actor = await getActorInfo(uid);
    const { leadId } = request.data as any;
    if (!leadId) throw new HttpsError("invalid-argument", "Lead ID is required.");

    const leadDoc = await db().doc(`sales-leads/${leadId}`).get();
    const bizName = leadDoc.data()?.businessName || "Unknown";
    await addActivity(leadId, "note", `Lead deleted: ${bizName}`, actor);

    const activitySnap = await db().collection(`sales-leads/${leadId}/activity`).get();
    const batch = db().batch();
    activitySnap.docs.forEach((d) => batch.delete(d.ref));
    batch.delete(db().doc(`sales-leads/${leadId}`));
    await batch.commit();

    return { success: true };
  }
);

export const addSalesLeadNote = onCall(
  { secrets: [] },
  async (request) => {
    const uid = await requireDev(request);
    const actor = await getActorInfo(uid);
    const { leadId, content } = request.data as any;
    if (!leadId || !content?.trim()) {
      throw new HttpsError("invalid-argument", "Lead ID and note content are required.");
    }
    await addActivity(leadId, "note", content.trim(), actor);
    return { success: true };
  }
);

// ── Lead Chat (Action-Aware AI Assistant) ─────────────────────────────────────

const LEAD_CHAT_SYSTEM_PROMPT = `You are a sales assistant for ComplianceChimp, an OSHA workplace safety platform. You are embedded inside a specific sales lead's detail view. The sales rep talks to you about this lead, and you help them track activities and plan next steps.

You will receive:
- The lead's profile (business name, contact, industry, etc.)
- Recent activity history (emails, calls, notes, status changes)
- Current flow recommendation (next action, timing)
- The conversation history with the rep in this chat
- The current date and time

YOUR JOB:
1. Understand what the rep is telling you and respond helpfully.
2. Extract any ACTIONS that should be taken based on what they said.
3. Return structured JSON so the system can execute those actions automatically.

ACTIONS YOU CAN RETURN:
- "log_activity": Log something that happened (a call was made, an email was received, a meeting occurred, etc.)
- "set_next_action": Set or update when the next follow-up should happen and what it should be.
- "update_lead": Update lead fields (status, contactName, phone, email, etc.)
- "add_knowledge": Save an important fact or context about this lead to the knowledge base. Use this when the rep shares meaningful intel (business size, expansion plans, pain points, decision-maker info, competitive situation, timing constraints, etc.). Write it as a concise factual statement, not a conversation recap.

EXAMPLES OF WHAT THE REP MIGHT SAY AND HOW TO RESPOND:

Rep: "I just called him, no answer. Try again tomorrow morning."
→ log_activity: { type: "call", content: "Called, no answer." }
→ set_next_action: { nextActionAt: "<tomorrow 9am in lead's timezone, as UTC ISO>", recommendedAction: "call", reason: "Rep called with no answer, wants to retry tomorrow morning." }

Rep: "Had a great call with Mike. He's interested but wants to talk to his partner first. Follow up Friday."
→ log_activity: { type: "call", content: "Spoke with Mike. Interested but needs to consult partner." }
→ set_next_action: { nextActionAt: "<this Friday 10am UTC>", recommendedAction: "call", reason: "Mike is interested, following up after he talks to partner." }
→ update_lead: { status: "qualified" }
→ add_knowledge: { content: "Mike has a business partner who is involved in purchasing decisions. Both need to agree before moving forward." }

Rep: "They just had an OSHA inspection last month and got hit with two citations"
→ add_knowledge: { content: "Had OSHA inspection recently, received two citations. High urgency for compliance help." }
→ log_activity: { type: "note", content: "Rep reports they had a recent OSHA inspection with two citations." }

Rep: "His email bounced, new email is mike@newdomain.com"
→ log_activity: { type: "note", content: "Previous email bounced. Updated to mike@newdomain.com." }
→ update_lead: { email: "mike@newdomain.com" }

Rep: "Send him a follow-up email next week about the consultation report"
→ set_next_action: { nextActionAt: "<next Monday 9am UTC>", recommendedAction: "email", reason: "Rep wants to send follow-up email about consultation report next week." }

Rep: "They signed up!"
→ log_activity: { type: "note", content: "Lead converted, signed up for ComplianceChimp." }
→ update_lead: { status: "won" }

Rep: "I need to call him back today around 2"
→ set_next_action: { nextActionAt: "<today 2pm in lead's timezone, as UTC ISO>", recommendedAction: "call", reason: "Rep needs to return call today at 2pm." }

RESPONSE FORMAT (strict JSON, no markdown):
{
  "reply": "Your conversational response to the rep. Be concise and confirm what you understood and what actions you're taking.",
  "actions": [
    {
      "type": "log_activity",
      "activityType": "call" | "note" | "email_sent" | "email_received",
      "content": "Description of the activity"
    },
    {
      "type": "set_next_action",
      "nextActionAt": "ISO 8601 UTC datetime",
      "recommendedAction": "email" | "call" | "follow_up" | "close",
      "reason": "Why this action at this time"
    },
    {
      "type": "update_lead",
      "fields": { "fieldName": "newValue" }
    },
    {
      "type": "add_knowledge",
      "content": "A concise factual statement about the lead"
    }
  ]
}

WEB SEARCH & URLS:
You have web search enabled. When the rep shares a URL (BBB page, Google listing, LinkedIn, Yelp, website, etc.) or asks you to look something up:
1. USE your web search to visit the URL or look up the business.
2. EXTRACT every useful data point: employee count, year established, owner/contact names, phone numbers, email addresses, industry details, accreditation status, complaints, reviews, specialties, service areas, etc.
3. COMPARE what you find against the lead's current profile. For any field that is missing or outdated, return an "update_lead" action with the corrected data.
4. SAVE important context as "add_knowledge" entries. Things worth saving: BBB accreditation status, complaint history, years in business, specialties, service area, notable reviews, licensing info, competitor mentions. Write each as a concise factual statement.
5. In your reply, summarize what you found and what you're updating. Be specific about the data points.

Example:
Rep: "Here's their BBB page: https://bbb.org/some-business"
→ You search the URL, find: established 2014, 8 employees, BBB accredited since 2018, A+ rating, 0 complaints
→ update_lead: { "employeeEstimate": "8", "yearEstablished": "2014" }
→ add_knowledge: { "content": "BBB accredited since 2018, A+ rating, 0 complaints filed." }
→ add_knowledge: { "content": "8 employees per BBB profile. Established 2014." }
→ reply: "Pulled their BBB profile. They've been around since 2014, 8 employees, A+ rated with zero complaints. Updated the employee count and year established. Saved the BBB details to the knowledge base."

Do NOT give a vague response like "I'll review this." Actually go get the data and apply it.

RULES:
- ALWAYS return valid JSON.
- The "actions" array can be empty if the rep is just asking a question or chatting.
- The "actions" array can have multiple actions if multiple things need to happen.
- For set_next_action, always convert times to UTC. Use the lead's timezone (derived from their state) to interpret "2pm" or "morning" correctly.
- For log_activity, use the most specific type. If they said "I called him", use "call". If they say "got an email back", use "email_received".
- update_lead fields must be one of: status, contactName, email, phone, website, industry, employeeEstimate, yearEstablished, bestContactMethod, fitReason.
- For status updates, only use: "new", "contacted", "qualified", "proposal", "negotiation", "won", "lost".
- Be concise in your reply. Confirm the actions you're taking. Don't lecture.
- If the rep mentions a time without a date, assume today if it's still in the future, otherwise tomorrow.`;

export const salesLeadChat = onCall(
  { secrets: [xaiApiKey], timeoutSeconds: 60, memory: "256MiB" },
  async (request) => {
    const uid = await requireDev(request);
    const actor = await getActorInfo(uid);
    const { leadId, message } = request.data as { leadId: string; message: string };

    if (!leadId || !message?.trim()) {
      throw new HttpsError("invalid-argument", "Lead ID and message are required.");
    }

    const leadDoc = await db().doc(`sales-leads/${leadId}`).get();
    if (!leadDoc.exists) throw new HttpsError("not-found", "Lead not found.");
    const lead = leadDoc.data()!;

    const activitiesSnap = await db()
      .collection(`sales-leads/${leadId}/activity`)
      .orderBy("createdAt", "desc")
      .limit(20)
      .get();

    const activityLines = activitiesSnap.docs.reverse().map((d) => {
      const a = d.data();
      const ts = a.createdAt?.toDate?.() ? a.createdAt.toDate().toISOString() : "unknown";
      let line = `[${ts}] ${a.type}`;
      if (a.type === "email_sent" || a.type === "email_received") {
        line += ` | Subject: ${a.emailSubject || "(no subject)"}`;
      } else if (a.type === "call") {
        line += ` | ${a.content || ""}`;
        if (a.callDuration) line += ` (${a.callDuration}s)`;
      } else {
        line += ` | ${a.content || ""}`;
      }
      return line;
    });

    const chatSnap = await db()
      .collection(`sales-leads/${leadId}/chat`)
      .orderBy("createdAt", "asc")
      .limit(20)
      .get();

    const chatHistory = chatSnap.docs.map((d) => {
      const c = d.data();
      return { role: c.role as string, content: c.content as string };
    });

    const tz = lead.state ? STATE_TIMEZONE[lead.state.toUpperCase()] || "unknown" : "unknown";
    const nowUtc = new Date().toISOString();

    const knowledgeLines = Array.isArray(lead.knowledge)
      ? lead.knowledge.map((k: any) => `- ${k.content}`).join("\n")
      : "";
    const fitLine = lead.fitReason ? `- ${lead.fitReason}` : "";
    const allKnowledge = [fitLine, knowledgeLines].filter(Boolean).join("\n");

    const userContent = `CURRENT DATE/TIME (UTC): ${nowUtc}

LEAD PROFILE:
- Business: ${lead.businessName}
- Contact: ${lead.contactName || "unknown"}
- Email: ${lead.email || "unknown"}
- Phone: ${lead.phone || "unknown"}
- Industry: ${lead.industry || "unknown"}
- Location: ${lead.city || ""}${lead.city && lead.state ? ", " : ""}${lead.state || ""}
- Timezone: ${tz}
- Employee Estimate: ${lead.employeeEstimate || "unknown"}
- Status: ${lead.status}

KNOWLEDGE BASE:
${allKnowledge || "No knowledge entries yet."}

CURRENT FLOW:
- Next Action: ${lead.flow?.recommendedAction || "none set"}
- Next Action At: ${lead.flow?.nextActionAt?.toDate?.() ? lead.flow.nextActionAt.toDate().toISOString() : "not set"}
- Reason: ${lead.flow?.actionReason || "none"}

RECENT ACTIVITY (${activitiesSnap.size} entries):
${activityLines.length > 0 ? activityLines.join("\n") : "No activity yet."}

REP'S MESSAGE: ${message.trim()}`;

    const messages: Array<{ role: string; content: string }> = [
      { role: "system", content: LEAD_CHAT_SYSTEM_PROMPT },
    ];

    for (const msg of chatHistory) {
      messages.push({ role: msg.role, content: msg.content });
    }

    messages.push({ role: "user", content: userContent });

    const response = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.XAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "grok-3-fast",
        messages,
        temperature: 0.3,
        search: true,
      }),
    });

    if (!response.ok) {
      console.error("Lead chat API error:", await response.text());
      throw new HttpsError("internal", "AI request failed.");
    }

    const grokResponse: any = await response.json();
    const raw = grokResponse.choices?.[0]?.message?.content || "";

    let reply = "Sorry, I couldn't process that. Try again.";
    let actionsExecuted: string[] = [];

    try {
      const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      const parsed = JSON.parse(cleaned);
      reply = parsed.reply || reply;

      const actions = Array.isArray(parsed.actions) ? parsed.actions : [];

      for (const action of actions) {
        try {
          if (action.type === "log_activity" && action.content) {
            const aType = (["call", "note", "email_sent", "email_received"].includes(action.activityType)
              ? action.activityType
              : "note") as ActivityType;
            await addActivity(leadId, aType, action.content, actor);
            actionsExecuted.push(`Logged ${aType}`);
          }

          if (action.type === "set_next_action" && action.nextActionAt) {
            const nextAt = admin.firestore.Timestamp.fromDate(new Date(action.nextActionAt));
            await db().doc(`sales-leads/${leadId}`).update({
              "flow.nextActionAt": nextAt,
              "flow.recommendedAction": action.recommendedAction || "follow_up",
              "flow.actionReason": action.reason || "",
              "flow.priority": "high",
              "flow.analyzedAt": admin.firestore.FieldValue.serverTimestamp(),
            });
            actionsExecuted.push(`Set next action: ${action.recommendedAction} at ${action.nextActionAt}`);
          }

          if (action.type === "update_lead" && action.fields) {
            const allowed = ["status", "contactName", "email", "phone", "website", "industry", "employeeEstimate", "yearEstablished", "bestContactMethod", "fitReason"];
            const updates: Record<string, any> = {};
            for (const [key, val] of Object.entries(action.fields)) {
              if (allowed.includes(key) && val != null) updates[key] = val;
            }
            if (Object.keys(updates).length > 0) {
              updates.updatedAt = admin.firestore.FieldValue.serverTimestamp();
              await db().doc(`sales-leads/${leadId}`).update(updates);
              actionsExecuted.push(`Updated lead: ${Object.keys(updates).filter(k => k !== "updatedAt").join(", ")}`);
            }
          }

          if (action.type === "add_knowledge" && action.content) {
            await db().doc(`sales-leads/${leadId}`).update({
              knowledge: admin.firestore.FieldValue.arrayUnion({
                content: action.content,
                source: "chat",
                addedAt: new Date().toISOString(),
              }),
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            actionsExecuted.push("Saved to knowledge base");
          }
        } catch (actionErr) {
          console.error(`Failed to execute action ${action.type}:`, actionErr);
        }
      }
    } catch (parseErr) {
      console.error("Failed to parse lead chat response:", parseErr, raw);
      reply = raw || reply;
    }

    const batch = db().batch();
    const chatCol = db().collection(`sales-leads/${leadId}/chat`);

    batch.create(chatCol.doc(), {
      role: "user",
      content: message.trim(),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      createdBy: actor.uid,
      actorName: actor.name,
    });

    batch.create(chatCol.doc(), {
      role: "assistant",
      content: reply,
      actionsExecuted,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    await batch.commit();

    return { reply, actionsExecuted };
  }
);

// ── AI Research ───────────────────────────────────────────────────────────────

const RESEARCH_SYSTEM_PROMPT = `You are a lead research assistant for ComplianceChimp, an OSHA workplace safety and compliance platform (free to use, no credit card required). Your job is to find small-to-mid-size businesses that need OSHA compliance help but are too small to have a dedicated safety department.

IDEAL CUSTOMER PROFILE:
- 10 to 50 employees is the sweet spot. Up to 250 is acceptable but getting big.
- Companies UNDER 10 employees are generally too small.
- Companies OVER 250 employees almost certainly already have compliance infrastructure or a safety manager on payroll. Do NOT suggest them.
- Owner-operated or with a small management team. The decision maker is usually the owner, GM, or ops manager.
- Industries with real OSHA exposure: construction, roofing, HVAC, plumbing, electrical, manufacturing, warehousing, landscaping, auto repair, welding/fabrication, general contracting.
- Companies that look like they're growing (hiring, multiple locations, good reviews) but probably haven't formalized safety training yet.

RESPONSE FORMAT:
You MUST respond with ONLY a JSON object. No text before or after. No markdown fences. Just the raw JSON:
{
  "reply": "Your conversational response. Be helpful and direct.",
  "leads": [
    {
      "contactName": "Owner or manager name",
      "businessName": "The business name",
      "email": "email if found",
      "phone": "phone if found",
      "website": "full URL to their website, or Facebook/social page if no website exists",
      "industry": "industry category",
      "city": "city",
      "state": "two-letter state abbreviation",
      "employeeEstimate": "best estimate, e.g. '15-25' or '~30'",
      "yearEstablished": "year if known, e.g. '2008'",
      "fitReason": "1-2 sentences on why they're a good fit for ComplianceChimp specifically",
      "bestContactMethod": "email | phone | facebook | linkedin | in_person | website_form",
      "confidence": 85,
      "verificationSignals": {
        "hasSocialMedia": false,
        "recentReviews": true,
        "lastActivityIndicator": "Reviews from 2 months ago"
      }
    }
  ]
}

SORT leads by confidence score, highest first.

VOLUME: When the user requests a broad search (e.g. "roofing contractors in Texas"), return up to 20 leads per response. Cast a wide net. The system will automatically verify each lead against Google Places, check website liveness, and verify emails, so quantity is fine as long as they fit the profile. More leads means better data.

CRITICAL: Your entire response must be parseable JSON. Do NOT write any text outside the JSON object. Put ALL conversational text inside the "reply" field.

CONFIDENCE SCORING (0-100):
For each lead, assess how confident you are that this is a real, currently active business. Use these signals:
- Google Business / Maps listing exists and is claimed: +20
- Has reviews at all: +10
- Has RECENT reviews (within the last 12 months): +15
- Has a working website or active social media: +15
- Has a listed phone number: +10
- Has a contact name (owner/manager): +10
- Has verifiable employee count: +5
- Has a street address or clear location: +5
- Year established is known: +5
- Any sign of recent activity (job postings, news, social posts): +5

A company with a Google listing, recent reviews, a website, and a phone number would score 75-90. A company you found only a name and city for would score 15-25. Be honest with the score. If something looks stale (no reviews in years, website down, no recent activity), lower it.

VERIFICATION SIGNALS:
For each lead, include verificationSignals with these fields. We automatically verify leads against the Google Places API after you return them, so you do NOT need to find Google Place IDs, phone numbers, websites, or review counts yourself. We handle hasGoogleListing, googlePlaceId, hasReviews, hasPhone, and hasWebsite automatically. You only need to provide:
- hasSocialMedia: Do they have an active Facebook, Instagram, or LinkedIn page?
- recentReviews: Do they have reviews from the last 12 months? (We verify review existence, but you assess recency.)
- lastActivityIndicator: A short note about the most recent sign of life you found (e.g. "Google review from Jan 2026", "Active Facebook posts", "Job posting on Indeed", "No recent activity found"). This is the most important signal for the sales rep.

RULES:
- Every business you find that fits the profile IS a lead. Return it even if you only have the business name and location. The sales rep will fill in the gaps.
- Do NOT fabricate emails, phone numbers, websites, or contact names. If you can't find a field, leave it as an empty string. NEVER make up data.
- Include whatever you CAN find. A lead with just a business name, city, and a Facebook page is still valuable. The sales rep will research further.
- For the "website" field: prefer actual websites. If the company has no website but has a Facebook page, Google Business listing, Yelp page, or other online presence, use that URL instead. Any verifiable online presence counts.
- ALWAYS include bestContactMethod. Think about what would actually work for this specific business based on what info you found. No email or website? Suggest "phone" or "in_person". Only a Facebook page? Suggest "facebook". Default to "phone" if unsure.
- ALWAYS include fitReason. This tells the sales rep why this company is worth pursuing.
- ALWAYS include confidence and verificationSignals for every lead.
- Include employeeEstimate when possible. If you truly can't estimate, use "unknown".
- Filter OUT companies that appear to be large enterprises, publicly traded, or have hundreds of employees. We are not selling to them.
- The "leads" array should ONLY be empty if the user is asking a general question and you truly found zero businesses. If you mention ANY business by name in your reply, it MUST also appear in the "leads" array with whatever data you have. NEVER describe a lead in the reply text without also including it in the leads array.
- Be practical and direct. No fluff.

LEAD CORRECTIONS (messages starting with "[Re:"):
When a message starts with "[Re: ..." it means the sales rep is telling you something about a specific lead. This is a conversation happening inside that lead's card. Examples:
- "Website didn't work" or "No website, found their Facebook" - Find alternative online presence. If only Facebook/social exists, use that as the website and update bestContactMethod accordingly.
- "Phone number was bad" - Search for the correct number.
- "His name is actually Greg" - Update the contact name.
- "Email bounced" - Find a different email.
- "They're too big" / "They closed down" - Acknowledge it.
- "How should I reach out?" - Based on what you know about the company, suggest the best approach. If they only have Facebook, suggest a Facebook message. If they have a website form, suggest that.

When you receive a correction:
1. Put your response in the "reply" field. Be concise and helpful.
2. Return the corrected lead in the "leads" array with ALL fields filled in (the updated version). Only return the ONE lead being discussed, not the whole batch.
3. If you can't find what was requested, say so honestly.
4. Remember: your ENTIRE response must be valid JSON. Nothing outside the JSON object.`;

const PLACES_FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.googleMapsUri",
  "places.websiteUri",
  "places.nationalPhoneNumber",
  "places.rating",
  "places.userRatingCount",
].join(",");

async function validateLeadsWithPlacesAPI(leads: any[]): Promise<any[]> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) return leads;

  const validated = await Promise.all(
    leads.map(async (lead) => {
      if (!lead.businessName) return lead;

      const query = [lead.businessName, lead.city, lead.state]
        .filter(Boolean)
        .join(" ");

      try {
        const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": apiKey,
            "X-Goog-FieldMask": PLACES_FIELD_MASK,
          },
          body: JSON.stringify({ textQuery: query, maxResultCount: 1 }),
        });

        if (!res.ok) return lead;

        const data: any = await res.json();
        const place = data.places?.[0];
        if (!place) {
          lead.verificationSignals = {
            ...lead.verificationSignals,
            hasGoogleListing: false,
            googlePlaceId: "",
          };
          return lead;
        }

        if (place.nationalPhoneNumber) lead.phone = place.nationalPhoneNumber;
        if (place.websiteUri) lead.website = place.websiteUri;
        if (place.googleMapsUri) lead.googleMapsUrl = place.googleMapsUri;
        if (place.formattedAddress) lead.address = place.formattedAddress;

        lead.verificationSignals = {
          ...lead.verificationSignals,
          hasGoogleListing: true,
          googlePlaceId: place.id || "",
          hasReviews: (place.userRatingCount || 0) > 0,
          hasPhone: !!place.nationalPhoneNumber,
          hasWebsite: !!place.websiteUri,
        };

        return lead;
      } catch {
        return lead;
      }
    })
  );

  return validated;
}

async function enrichLeadsFromWebsites(leads: any[]): Promise<any[]> {
  return Promise.all(
    leads.map(async (lead) => {
      if (lead.email || !lead.website) return lead;

      try {
        const url = lead.website.startsWith("http")
          ? lead.website
          : `https://${lead.website}`;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 6000);

        const res = await fetch(url, {
          signal: controller.signal,
          headers: { "User-Agent": "Mozilla/5.0 (compatible; ComplianceChimp/1.0)" },
          redirect: "follow",
        });
        clearTimeout(timeout);

        if (!res.ok) return lead;

        const html = await res.text();
        const emailMatches = html.match(
          /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g
        );
        if (!emailMatches?.length) return lead;

        const dominated = new Set(["noreply", "no-reply", "mailer-daemon", "postmaster", "webmaster"]);
        const emails = [...new Set(emailMatches)]
          .map((e) => e.toLowerCase())
          .filter((e) => !dominated.has(e.split("@")[0]) && !e.endsWith(".png") && !e.endsWith(".jpg"));

        if (emails.length > 0) {
          lead.email = emails[0];
        }

        return lead;
      } catch {
        return lead;
      }
    })
  );
}

async function checkWebsiteLiveness(leads: any[]): Promise<any[]> {
  return Promise.all(
    leads.map(async (lead) => {
      if (!lead.website) {
        lead.verificationSignals = {
          ...lead.verificationSignals,
          websiteStatus: "unchecked",
        };
        return lead;
      }

      try {
        const url = lead.website.startsWith("http")
          ? lead.website
          : `https://${lead.website}`;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);

        const res = await fetch(url, {
          method: "HEAD",
          signal: controller.signal,
          headers: { "User-Agent": "Mozilla/5.0 (compatible; ComplianceChimp/1.0)" },
          redirect: "follow",
        });
        clearTimeout(timeout);

        lead.verificationSignals = {
          ...lead.verificationSignals,
          websiteStatus: res.redirected ? "redirect" : res.ok ? "live" : "dead",
        };
      } catch {
        lead.verificationSignals = {
          ...lead.verificationSignals,
          websiteStatus: "dead",
        };
      }

      return lead;
    })
  );
}

async function verifyEmailsWithBouncer(leads: any[]): Promise<any[]> {
  const apiKey = process.env.BOUNCER_API_KEY;
  if (!apiKey) return leads;

  return Promise.all(
    leads.map(async (lead) => {
      if (!lead.email) return lead;

      try {
        const res = await fetch(
          `https://verifier.meetchopra.com/verify/${encodeURIComponent(lead.email)}?token=${apiKey}`
        );
        const json: any = await res.json();

        lead.verificationSignals = {
          ...lead.verificationSignals,
          emailVerification: {
            status: json?.status || "unknown",
            reason: json?.reason || "",
            ...(json?.score != null ? { score: json.score } : {}),
          },
        };
      } catch {
        // skip failed verification
      }

      return lead;
    })
  );
}

function recalculateConfidence(leads: any[]): any[] {
  return leads.map((lead) => {
    let confidence = lead.confidence ?? 50;
    const signals = lead.verificationSignals || {};

    if (signals.hasGoogleListing) {
      confidence = Math.max(confidence, 20);
    }

    if (signals.websiteStatus === "live") {
      confidence += 10;
    } else if (signals.websiteStatus === "dead") {
      confidence -= 15;
    }

    if (signals.emailVerification) {
      const status = signals.emailVerification.status;
      if (status === "valid" || status === "deliverable") {
        confidence += 10;
      } else if (status === "risky" || status === "unknown") {
        confidence -= 5;
      } else if (status === "invalid" || status === "undeliverable") {
        confidence -= 20;
      }
    }

    lead.confidence = Math.max(0, Math.min(100, confidence));
    return lead;
  });
}

export const salesLeadResearch = onCall(
  {
    secrets: [xaiApiKey, googlePlacesApiKey, bouncerApiKey],
    timeoutSeconds: 180,
    memory: "1GiB",
  },
  async (request) => {
    const uid = await requireDev(request);
    const actor = await getActorInfo(uid);
    const { message, sessionId, ephemeral } = request.data as any;

    if (!message?.trim()) {
      throw new HttpsError("invalid-argument", "Message is required.");
    }

    let session: any = null;
    let sessionRef: admin.firestore.DocumentReference;

    if (sessionId) {
      sessionRef = db().doc(`sales-research-sessions/${sessionId}`);
      const snap = await sessionRef.get();
      if (snap.exists) session = snap.data();
    }

    const messages: Array<{ role: string; content: string }> = [
      { role: "system", content: RESEARCH_SYSTEM_PROMPT },
    ];

    if (session?.messages) {
      const recent = session.messages.slice(-20);
      for (const msg of recent) {
        messages.push({ role: msg.role, content: msg.content });
      }
    }

    messages.push({ role: "user", content: message });

    const response = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.XAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "grok-3-fast",
        messages,
        temperature: 0.7,
        max_tokens: 8000,
        search: true,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Research API error:", errorText);
      throw new HttpsError("internal", "AI service temporarily unavailable.");
    }

    const grokResponse: any = await response.json();
    const rawContent = grokResponse.choices?.[0]?.message?.content || "";

    let reply = rawContent;
    let leads: any[] = [];

    const tryParse = (text: string): boolean => {
      try {
        const parsed = JSON.parse(text);
        if (parsed && typeof parsed === "object") {
          reply = parsed.reply || reply;
          leads = Array.isArray(parsed.leads) ? parsed.leads : [];
          return true;
        }
      } catch {}
      return false;
    };

    // Strategy 1: parse the full response (after stripping markdown fences)
    const cleaned = rawContent.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    if (!tryParse(cleaned)) {
      // Strategy 2: find the outermost { ... } block containing "reply"
      const braceStart = rawContent.indexOf("{");
      const braceEnd = rawContent.lastIndexOf("}");
      if (braceStart !== -1 && braceEnd > braceStart) {
        const extracted = rawContent.substring(braceStart, braceEnd + 1);
        if (!tryParse(extracted)) {
          // Strategy 3: greedy regex for a JSON object with "reply" key
          const jsonMatch = rawContent.match(/\{[\s\S]*?"reply"\s*:\s*"[\s\S]*?\}(?=[^}]*$)/);
          if (jsonMatch) {
            tryParse(jsonMatch[0]);
          }
        }
      }

      // If nothing parsed, the AI returned pure text. Use it as the reply.
      if (leads.length === 0) {
        reply = rawContent.replace(/```[\s\S]*?```/g, "").trim() || rawContent;
      }
    }

    if (leads.length > 0) {
      leads = await validateLeadsWithPlacesAPI(leads);
      leads = await enrichLeadsFromWebsites(leads);
      leads = await checkWebsiteLiveness(leads);
      leads = await verifyEmailsWithBouncer(leads);
      leads = recalculateConfidence(leads);
      leads.sort((a: any, b: any) => (b.confidence ?? 0) - (a.confidence ?? 0));
    }

    if (ephemeral) {
      return { reply, leads, sessionId: sessionId || null };
    }

    const now = admin.firestore.FieldValue.serverTimestamp();
    const newMessage = {
      role: "user" as const,
      content: message,
      timestamp: new Date().toISOString(),
      uid,
      userName: actor.name,
    };
    const assistantMessage = {
      role: "assistant" as const,
      content: reply,
      leadsFound: leads,
      timestamp: new Date().toISOString(),
      uid: "system",
      userName: "Ulysses (AI)",
    };

    if (sessionId && session) {
      sessionRef = db().doc(`sales-research-sessions/${sessionId}`);
      await sessionRef.update({
        messages: admin.firestore.FieldValue.arrayUnion(newMessage, assistantMessage),
        updatedAt: now,
      });
    } else {
      // Generate a short title from the first message
      let title = message.substring(0, 60);
      try {
        const titleResponse = await fetch("https://api.x.ai/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.XAI_API_KEY}`,
          },
          body: JSON.stringify({
            model: "grok-3-fast",
            messages: [
              {
                role: "system",
                content: "Generate a short title (4-6 words max) for a sales research session based on the user's first message. Return ONLY the title text, nothing else. No quotes, no punctuation at the end.",
              },
              { role: "user", content: message },
            ],
            temperature: 0.3,
            max_tokens: 30,
          }),
        });
        if (titleResponse.ok) {
          const titleData: any = await titleResponse.json();
          const generated = titleData.choices?.[0]?.message?.content?.trim();
          if (generated && generated.length < 80) title = generated;
        }
      } catch {
        // Title generation failed, use truncated message as fallback
      }

      const newSession = await db().collection("sales-research-sessions").add({
        title,
        messages: [newMessage, assistantMessage],
        leadsGenerated: [],
        createdAt: now,
        updatedAt: now,
        createdBy: uid,
      });
      return { reply, leads, sessionId: newSession.id, title };
    }

    return { reply, leads, sessionId };
  }
);

// ── Email Generation & Sending ────────────────────────────────────────────────

const EMAIL_BASE_PROMPT = `You are a sales email assistant for ComplianceChimp, an OSHA workplace safety and compliance platform. Your job is to draft outreach messages that match the sender's personal writing style exactly.

ADAPT TO THE CONTACT METHOD:
- If the best contact method is "facebook", write a short, conversational Facebook message (no subject line needed, keep it casual and under 150 words). Set subject to "Facebook Message".
- If the best contact method is "linkedin", write a LinkedIn message (professional but brief, under 200 words). Set subject to "LinkedIn Message".
- If the best contact method is "website_form", write a contact form submission (clear, direct, reference their website). Set subject to "Website Contact Form".
- If the best contact method is "in_person", write talking points for a walk-in visit (bullet points of what to say). Set subject to "Walk-in Talking Points".
- For "email" or "phone" or anything else, write a standard sales email.

FORMATTING:
- Use <p> tags for paragraphs, <strong> for emphasis where appropriate
- Keep paragraphs short

Return a JSON object: { "subject": "...", "bodyHtml": "..." }`;

const STYLE_LEARNING_ADDENDUM = `
STYLE INSTRUCTIONS:
Below are real emails the sender has previously written and sent. Study them carefully. Your output must replicate their exact writing style, including:
- Greeting and sign-off patterns (if they use a specific signature, always include it)
- Sentence length, paragraph structure, and formatting choices
- Level of formality or casualness
- Word choice and phrasing tendencies
- Any recurring patterns (how they introduce ComplianceChimp, how they reference OSHA, etc.)

Do NOT invent a persona or add personality traits that aren't present in the examples. Write as if you are this person.

PREVIOUS EMAILS:
`;

const NO_HISTORY_ADDENDUM = `
The sender has no previous emails on file yet. Write a professional, concise outreach email about ComplianceChimp's OSHA compliance services. Keep it direct, no corporate jargon. The sender will edit this to match their own voice before sending.
`;

function buildEmailSystemPrompt(pastEmails: Array<{ subject: string; bodyHtml: string; recipientBusiness: string }>): string {
  if (pastEmails.length === 0) {
    return EMAIL_BASE_PROMPT + NO_HISTORY_ADDENDUM;
  }

  const examples = pastEmails
    .map((e, i) => {
      const plainBody = e.bodyHtml
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/p>/gi, "\n\n")
        .replace(/<[^>]+>/g, "")
        .trim();
      return `--- Example ${i + 1} (to: ${e.recipientBusiness || "unknown"}) ---\nSubject: ${e.subject}\n\n${plainBody}`;
    })
    .join("\n\n");

  return EMAIL_BASE_PROMPT + STYLE_LEARNING_ADDENDUM + examples;
}

export const generateSalesEmail = onCall(
  { secrets: [xaiApiKey], timeoutSeconds: 60 },
  async (request) => {
    const uid = await requireDev(request);
    const actor = await getActorInfo(uid);
    const { leadId, context } = request.data as any;

    if (!leadId) throw new HttpsError("invalid-argument", "Lead ID is required.");

    const [leadDoc, historySnap, recentActivity] = await Promise.all([
      db().doc(`sales-leads/${leadId}`).get(),
      db()
        .collection("sales-email-history")
        .orderBy("sentAt", "desc")
        .limit(15)
        .get(),
      db()
        .collection(`sales-leads/${leadId}/activity`)
        .orderBy("createdAt", "desc")
        .limit(5)
        .get(),
    ]);

    if (!leadDoc.exists) throw new HttpsError("not-found", "Lead not found.");
    const lead = leadDoc.data()!;

    const pastEmails = historySnap.docs.map((d) => {
      const data = d.data();
      return {
        subject: data.subject || "",
        bodyHtml: data.bodyHtml || "",
        recipientBusiness: data.recipientBusiness || "",
      };
    });

    const activitySummary = recentActivity.docs
      .map((d) => {
        const a = d.data();
        return `${a.type}: ${a.content}`;
      })
      .join("\n");

    const latestInbound = recentActivity.docs.find((d) => d.data().type === "email_received");
    const inboundData = latestInbound?.data();
    const isReply = !!inboundData;

    const systemPrompt = buildEmailSystemPrompt(pastEmails);

    let userMessage: string;

    if (isReply) {
      const originalSubject = (inboundData.emailSubject || "").replace(/^Re:\s*/i, "").trim();
      const theirReply = inboundData.emailPlainText || inboundData.content?.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim() || "";

      userMessage = `The lead REPLIED to our email. Write a REPLY back to continue the conversation in the same thread.

THEIR REPLY:
"${theirReply}"

ORIGINAL SUBJECT: ${originalSubject}

LEAD INFO:
- Business: ${lead.businessName}
- Contact: ${lead.contactName}
- Industry: ${lead.industry || "unknown"}
- Location: ${lead.city || ""}, ${lead.state || ""}

Recent activity:
${activitySummary}

${context ? "Additional context: " + context : ""}

CRITICAL RULES FOR REPLIES:
- The subject MUST be "Re: ${originalSubject}" to keep it in the same email thread.
- Write a natural reply to what they said. Do NOT write a cold outreach email.
- Keep it conversational and responsive to their specific message.
- If they asked for a call, confirm the call and suggest specifics.
- If they asked a question, answer it.
- Keep it short. Replies should be 2-4 sentences, not a sales pitch.
- Do NOT include a greeting like "Dear [Name]" for a reply. Start naturally.

Return JSON: { "subject": "Re: ${originalSubject}", "bodyHtml": "...", "inReplyTo": "${inboundData.messageId || ""}" }`;
    } else {
      userMessage = `Write an outreach message to this lead:
- Business: ${lead.businessName}
- Contact: ${lead.contactName}
- Industry: ${lead.industry || "unknown"}
- Location: ${lead.city || ""}, ${lead.state || ""}
- Best contact method: ${lead.bestContactMethod || "email"}
- Website/Online presence: ${lead.website || "none"}
- Current status: ${lead.status}

Recent activity:
${activitySummary || "No previous contact"}

${context ? "Additional context: " + context : ""}

Return JSON: { "subject": "...", "bodyHtml": "..." }`;
    }

    const response = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.XAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "grok-3-fast",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      throw new HttpsError("internal", "AI service temporarily unavailable.");
    }

    const grokResponse: any = await response.json();
    const raw = grokResponse.choices?.[0]?.message?.content || "";

    await addActivity(leadId, "email_generated", "Email draft generated by AI", actor);

    try {
      const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      const parsed = JSON.parse(cleaned);
      if (isReply && inboundData?.messageId && !parsed.inReplyTo) {
        parsed.inReplyTo = inboundData.messageId;
      }
      return parsed;
    } catch {
      return { subject: isReply ? `Re: ${inboundData?.emailSubject?.replace(/^Re:\s*/i, "") || "Following up"}` : "Following up", bodyHtml: raw };
    }
  }
);

export const sendSalesEmail = onCall(
  { secrets: [sendgridApiKey] },
  async (request) => {
    const uid = await requireDev(request);
    const actor = await getActorInfo(uid);
    const { leadId, subject, bodyHtml, inReplyTo } = request.data as any;

    if (!leadId || !subject || !bodyHtml) {
      throw new HttpsError("invalid-argument", "Lead ID, subject, and body are required.");
    }

    const leadDoc = await db().doc(`sales-leads/${leadId}`).get();
    if (!leadDoc.exists) throw new HttpsError("not-found", "Lead not found.");
    const lead = leadDoc.data()!;

    const nodemailer = require("nodemailer");
    const sendgridTransport = require("nodemailer-sendgrid-transport");
    const client = nodemailer.createTransport(
      sendgridTransport({ auth: { api_key: process.env.SENDGRID_API_KEY } })
    );

    const trackedBodyHtml = appendTrackingParams(bodyHtml, leadId);

    const mailOptions: any = {
      from: '"Ryan at ComplianceChimp" <support@compliancechimp.com>',
      replyTo: `reply+${leadId}@reply.compliancechimp.com`,
      to: lead.email,
      subject,
      html: trackedBodyHtml,
    };

    if (inReplyTo) {
      mailOptions.inReplyTo = inReplyTo;
      mailOptions.references = inReplyTo;
    }

    const info = await client.sendMail(mailOptions);
    const sentMessageId = info?.messageId || null;

    const now = admin.firestore.FieldValue.serverTimestamp();
    await addActivity(leadId, "email_sent", trackedBodyHtml, actor, "user", {
      emailSubject: subject,
      emailHtml: trackedBodyHtml,
      ...(sentMessageId ? { messageId: sentMessageId } : {}),
    });

    await db().collection("sales-email-history").add({
      subject,
      bodyHtml,
      leadId,
      recipientName: lead.contactName || "",
      recipientBusiness: lead.businessName || "",
      industry: lead.industry || "",
      sentAt: now,
      sentBy: uid,
    });

    await db().doc(`sales-leads/${leadId}`).update({
      lastContactedAt: now,
      updatedAt: now,
    });

    return { success: true };
  }
);

// ── Phone scripts ─────────────────────────────────────────────────────────────

const PHONE_SCRIPT_SEEDS: { title: string; body: string }[] = [
  {
    title: "Cold intro (OSHA compliance)",
    body:
      "Hi, this is [your name] with ComplianceChimp. I help small businesses get OSHA paperwork and training in one place so nothing slips through the cracks. Do you have ninety seconds, or should I try you at a better time?\n\n" +
      "[If yes] Great. Quick question: how are you handling safety meetings and documented training today? [Listen.]\n\n" +
      "A lot of shops our size use spreadsheets or nothing at all until an incident or a visit. We built ComplianceChimp to make inspections, trainings, and logs something your team can actually finish. Worth a fifteen-minute look this week?",
  },
  {
    title: "Follow-up after email or link",
    body:
      "Hi [name], this is [your name] from ComplianceChimp. I sent a note about keeping OSHA documentation and training in one system. Did that land in your inbox, or should I resend it?\n\n" +
      "[If they saw it] What would be most useful to see first: self-inspections, employee training, or incident reporting?\n\n" +
      "If timing is bad, what day next week is lighter for a quick call?",
  },
  {
    title: "Voicemail (under thirty seconds)",
    body:
      "Hi [name], [your name] with ComplianceChimp, reaching out about OSHA compliance tools for [business type]. My number is [number]. I will send a one-line email with a link so you have it. Thanks.",
  },
];

const PHONE_SCRIPT_AI_SYSTEM = `You are Ulysses at ComplianceChimp (workplace safety and OSHA compliance software for small and mid-sized businesses).

Write phone scripts that sound like a knowledgeable peer, not a sales robot. Be concise. No corporate jargon. No emojis. Do not use em dashes.

Return ONLY valid JSON with this shape:
{ "suggestions": [ { "title": string, "body": string }, { "title": string, "body": string } ] }

Each body should be plain text with line breaks where the rep should pause. Include brief bracketed cues like [Listen.] where helpful. Two suggestions: one more direct, one softer or shorter.`;

async function ensurePhoneScriptSeeds(): Promise<void> {
  const snap = await db().collection("sales-phone-scripts").limit(1).get();
  if (!snap.empty) return;
  const batch = db().batch();
  for (const seed of PHONE_SCRIPT_SEEDS) {
    const ref = db().collection("sales-phone-scripts").doc();
    batch.set(ref, {
      title: seed.title,
      body: seed.body,
      useCount: 0,
      successCount: 0,
      source: "seed",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }
  await batch.commit();
}

export const generateSalesPhoneScripts = onCall(
  { secrets: [xaiApiKey], timeoutSeconds: 60 },
  async (request) => {
    await requireDev(request);
    const { leadId } = request.data as { leadId?: string };
    if (!leadId) throw new HttpsError("invalid-argument", "Lead ID is required.");

    await ensurePhoneScriptSeeds();

    const [leadDoc, activitySnap, librarySnap, learningsSnap] = await Promise.all([
      db().doc(`sales-leads/${leadId}`).get(),
      db()
        .collection(`sales-leads/${leadId}/activity`)
        .orderBy("createdAt", "desc")
        .limit(12)
        .get(),
      db().collection("sales-phone-scripts").orderBy("useCount", "desc").limit(8).get(),
      db().collection("sales-agent-learnings").orderBy("createdAt", "desc").limit(1).get(),
    ]);

    if (!leadDoc.exists) throw new HttpsError("not-found", "Lead not found.");
    const lead = leadDoc.data()!;

    const libraryScripts = librarySnap.docs.map((d) => {
      const x = d.data();
      return {
        id: d.id,
        title: (x.title as string) || "Script",
        body: (x.body as string) || "",
        useCount: typeof x.useCount === "number" ? x.useCount : 0,
        successCount: typeof x.successCount === "number" ? x.successCount : 0,
      };
    });

    const activitySummary = activitySnap.docs
      .map((docSnap) => {
        const a = docSnap.data();
        return `${a.type}: ${(a.content as string)?.slice(0, 280) || ""}`;
      })
      .join("\n");

    const learnings = learningsSnap.docs[0]?.data();
    const successPatterns = Array.isArray(learnings?.successPatterns)
      ? (learnings!.successPatterns as string[]).slice(0, 8).join("\n- ")
      : "";

    const knowledge = Array.isArray(lead.knowledge)
      ? (lead.knowledge as { content?: string }[])
          .map((k) => k.content)
          .filter(Boolean)
          .join("\n- ")
      : "";

    const libraryBlock =
      libraryScripts.length > 0
        ? libraryScripts
            .map(
              (s, i) =>
                `--- Library script ${i + 1} (uses: ${s.useCount}, successes logged: ${s.successCount}) ---\nTitle: ${s.title}\n${s.body}`
            )
            .join("\n\n")
        : "(No library scripts yet.)";

    const userMessage = `Generate two phone script suggestions for this lead.

LEAD
- Business: ${lead.businessName}
- Contact: ${lead.contactName || "unknown"}
- Phone: ${lead.phone || "unknown"}
- Industry: ${lead.industry || "unknown"}
- Location: ${lead.city || ""}, ${lead.state || ""}
- Status: ${lead.status}
- Best contact method: ${lead.bestContactMethod || "unknown"}
- Fit / why we reached out: ${lead.fitReason || "n/a"}

Knowledge about this lead:
${knowledge || "None recorded."}

Flow / talking points from last analysis:
${lead.flow?.suggestedContent || lead.flow?.actionReason || "n/a"}

Recent activity:
${activitySummary || "None"}

Patterns that worked in past outreach (when present, lean on these themes):
${successPatterns ? "- " + successPatterns : "None on file."}

Library scripts the team has used before (higher use counts mean they were selected more often when logging calls):
${libraryBlock}

Return JSON only: { "suggestions": [ { "title": "...", "body": "..." }, { "title": "...", "body": "..." } ] }`;

    const response = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.XAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "grok-3-fast",
        messages: [
          { role: "system", content: PHONE_SCRIPT_AI_SYSTEM },
          { role: "user", content: userMessage },
        ],
        temperature: 0.65,
      }),
    });

    if (!response.ok) {
      throw new HttpsError("internal", "AI service temporarily unavailable.");
    }

    const grokResponse: any = await response.json();
    const raw = grokResponse.choices?.[0]?.message?.content || "";

    let suggestions: { title: string; body: string }[] = [];
    try {
      const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      const parsed = JSON.parse(cleaned);
      if (Array.isArray(parsed.suggestions)) {
        suggestions = parsed.suggestions
          .filter((s: any) => s && typeof s.body === "string")
          .map((s: any) => ({
            title: typeof s.title === "string" ? s.title : "Suggested script",
            body: String(s.body).trim(),
          }))
          .slice(0, 2);
      }
    } catch {
      suggestions = [];
    }

    if (suggestions.length === 0) {
      suggestions = [
        { title: "Suggested script A", body: raw.trim() || "Could not parse AI response. Try Regenerate." },
        { title: "Suggested script B", body: PHONE_SCRIPT_SEEDS[0].body },
      ];
    }

    return { suggestions, libraryScripts };
  }
);

export const logSalesPhoneCall = onCall(
  { secrets: [] },
  async (request) => {
    const uid = await requireDev(request);
    const actor = await getActorInfo(uid);
    const { leadId, feedback } = request.data as { leadId?: string; feedback?: string };

    if (!leadId) throw new HttpsError("invalid-argument", "Lead ID is required.");
    const content = typeof feedback === "string" ? feedback.trim() : "";
    if (!content) throw new HttpsError("invalid-argument", "Describe the call before saving.");

    const leadDoc = await db().doc(`sales-leads/${leadId}`).get();
    if (!leadDoc.exists) throw new HttpsError("not-found", "Lead not found.");

    await addActivity(leadId, "call", content, actor, "user");

    const now = admin.firestore.FieldValue.serverTimestamp();
    await db().doc(`sales-leads/${leadId}`).update({
      lastContactedAt: now,
      updatedAt: now,
    });

    return { success: true };
  }
);

// ── Flow Analysis ─────────────────────────────────────────────────────────────

const STATE_TIMEZONE: Record<string, string> = {
  AL: "Central", AK: "Alaska", AZ: "Mountain", AR: "Central", CA: "Pacific",
  CO: "Mountain", CT: "Eastern", DE: "Eastern", FL: "Eastern", GA: "Eastern",
  HI: "Hawaii", ID: "Mountain", IL: "Central", IN: "Eastern", IA: "Central",
  KS: "Central", KY: "Eastern", LA: "Central", ME: "Eastern", MD: "Eastern",
  MA: "Eastern", MI: "Eastern", MN: "Central", MS: "Central", MO: "Central",
  MT: "Mountain", NE: "Central", NV: "Pacific", NH: "Eastern", NJ: "Eastern",
  NM: "Mountain", NY: "Eastern", NC: "Eastern", ND: "Central", OH: "Eastern",
  OK: "Central", OR: "Pacific", PA: "Eastern", RI: "Eastern", SC: "Eastern",
  SD: "Central", TN: "Central", TX: "Central", UT: "Mountain", VT: "Eastern",
  VA: "Eastern", WA: "Pacific", WV: "Eastern", WI: "Central", WY: "Mountain",
  DC: "Eastern",
};

const FLOW_SYSTEM_PROMPT = `You are an outreach timing and strategy engine for ComplianceChimp, an OSHA workplace safety platform. Your job is to analyze a sales lead and its full communication history, then recommend the optimal next touchpoint.

You will receive:
- Lead profile (business name, contact name, industry, location, employee count)
- Full activity history (emails sent with subjects/bodies, phone calls with transcripts, notes, status changes)
- Consultation report data (if a free OSHA safety consultation was generated and sent to them)
- Current pipeline status
- The current date and time (UTC)

ANALYSIS FACTORS:
1. TIMING: Determine the best day of week and time of day to reach out, in the lead's local timezone.
   - Construction/trades: early morning (7-8am local), Monday or Tuesday. They're on jobsites by 9am.
   - Office/professional: mid-morning (9-10am local), Tuesday through Thursday.
   - Manufacturing: shift change times or early morning before production ramps up.
   - Avoid Fridays for cold outreach. Fridays are acceptable for warm follow-ups only.
   - Avoid Monday mornings before 9am for office workers, they're clearing weekend backlog.

2. CHANNEL SELECTION: Decide whether email, call, or follow-up (a softer re-engagement) is best.
   - First touch: email (less intrusive, gives them something to read).
   - 2nd touch (no reply to email): another email with different angle, 3-5 business days later.
   - 3rd touch: phone call. They've seen your name twice now.
   - 4th+ touch with no response: space it out (7-10 days). Alternate channels.
   - If they replied to an email, follow up via email. Match the channel they engaged on.
   - If a call happened and went well, schedule another call.
   - After 6+ unanswered touches, recommend "close" to move them to lost.

3. EMAIL LINK CLICKS: If the lead has clicked links in outreach emails (visiting the website), this is a real engagement signal.
   - Any click count > 0 means they are at minimum curious. Priority should go UP.
   - Multiple clicks or recent clicks indicate active interest. Treat similarly to a consultation report view.
   - If they clicked but have not replied to emails, a call may be the right move to capitalize on interest.
   - The activity history will contain "link_clicked" entries with timestamps and which page they visited.

4. CONSULTATION REPORT ENGAGEMENT: If a free safety consultation was sent, this is critical data.
   - If they have NOT viewed the report yet: the follow-up should nudge them to open it. Reference specific findings from their report (importance score, key hazards, top requirements).
   - If they HAVE viewed the report: this is a strong engagement signal. Priority goes UP. The follow-up should reference that they looked at it, ask what stood out, and position ComplianceChimp as the tool that handles those requirements automatically.
   - If they viewed the report AND clicked the CTA: very high priority. They're interested. Call them.
   - If they viewed it multiple times (viewCount > 1): they're seriously considering it. Time-sensitive follow-up.
   - Reference specific findings from the consultation in your suggestedContent (importance score, specific OSHA standards cited, hazard categories flagged).

5. CONTENT GUIDANCE: What to say or reference.
   - If prior emails exist, reference something specific from them (don't repeat the same pitch).
   - If a call transcript exists, reference something discussed.
   - If a consultation report exists, reference specific findings from it.
   - Tie it to their industry and OSHA risks relevant to them.
   - If they have employees and no apparent safety program, that's the angle.

6. EXPIRED TRIAL LEADS: If the lead signed up but their free trial has expired without paying, this is a conversion opportunity.
   - They already used the product. They know what it does. Don't pitch from scratch.
   - Ask what held them back. Was it price? Did they not have time to set it up? Did they not see the value?
   - Reference specific things they would have experienced in the product (safety training assignments, inspection checklists, compliance tracking).
   - If they're a few days past expiration, a quick call is best. If it's been weeks, an email with a specific angle.
   - Priority should be "high" if trial expired within the last 7 days. "medium" if 7-21 days. "low" after 21 days.
   - If automated follow-up emails have already been sent, don't repeat the same messaging. Bring a new angle.

7. PRIORITY:
   - "high": new lead less than 48 hours old, lead that replied/engaged recently, lead that viewed their consultation report (especially if they clicked the CTA), lead that clicked email links recently, OR lead whose trial expired within the last 7 days.
   - "medium": standard pipeline lead on a normal follow-up cadence, or trial expired 7-21 days ago.
   - "low": lead that's been contacted 4+ times with no engagement, or is in a cooling period, or trial expired 21+ days ago.

8. OWNERSHIP: The activity history includes "by {name}" for each action. Look at who has been doing the outreach for this lead, and recommend that same person continue (consistency matters in sales relationships). If multiple people have engaged, recommend the one with the most recent or most frequent contact.

RESPONSE FORMAT (strict JSON, no markdown):
{
  "nextActionAt": "ISO 8601 datetime string in UTC for when to take the next action",
  "recommendedAction": "email" | "call" | "follow_up" | "close",
  "actionReason": "2-3 sentences explaining why this action, at this time, through this channel",
  "suggestedContent": "Specific talking points, email angle, or call script notes. Reference prior communication if any exists.",
  "priority": "high" | "medium" | "low",
  "touchCount": <number of outreach attempts so far (emails sent + calls made, not counting notes or status changes)>,
  "recommendedOwner": "The name of the team member who should take this action, based on who has the most engagement with this lead. If no human activity exists yet, return null."
}

7. INBOUND REPLIES: When a lead replies to an email, this changes everything.
   - A reply is the highest-priority signal. Priority should almost always be "high".
   - READ THE REPLY CAREFULLY. If they request a specific day, time, or channel, HONOR IT EXACTLY.
   - If they say "call me Tuesday", set nextActionAt to that Tuesday (in their local timezone, converted to UTC). Do NOT pick a different day based on general heuristics.
   - If they say "let's talk next week", schedule for early in the next week (Monday or Tuesday).
   - If they ask a question via email, respond via email. If they ask for a call, recommend a call.
   - Your actionReason must be consistent with nextActionAt. If you say "they asked for Tuesday", the datetime must be on Tuesday.
   - Convert the lead's local timezone to UTC for nextActionAt. For example, "Tuesday 8am Mountain" = "Tuesday 3pm UTC" (during MDT).

RULES:
- ALWAYS return valid JSON with all fields present.
- nextActionAt must be a future datetime. Never in the past.
- nextActionAt, recommendedAction, and actionReason must all be internally consistent. Do not say one day in the reason and schedule a different day.
- Be specific in suggestedContent. "Follow up" is useless. "Reference the fall protection stat from your last email and ask if they've had any near-misses on their roofing jobs" is useful.
- Count touches accurately from the activity history.
- If status is "lost" or "test", return recommendedAction "close" with priority "low".
- If status is "won" but ACCOUNT STATUS shows an expired trial or active trial nearing end, treat this as a conversion lead, NOT a closed deal.
- recommendedOwner should be the name from the activity history, not a uid. If no human has engaged yet, return null.`;

async function runFlowAnalysis(
  leadId: string,
  triggeredBy: { actor: ActorInfo; actorType: "user" | "agent" } = { actor: AGENT_ACTOR, actorType: "agent" }
): Promise<void> {
  const leadDoc = await db().doc(`sales-leads/${leadId}`).get();
  if (!leadDoc.exists) return;
  const lead = leadDoc.data()!;

  if (lead.sequenceStatus === "active") return;

  if (lead.status === "lost" || lead.status === "test") {
    await db().doc(`sales-leads/${leadId}`).update({
      "flow.recommendedAction": "close",
      "flow.actionReason": `Lead is marked as ${lead.status}.`,
      "flow.suggestedContent": "",
      "flow.priority": "low",
      "flow.touchCount": lead.flow?.touchCount || 0,
      "flow.analyzedAt": admin.firestore.FieldValue.serverTimestamp(),
      "flow.nextActionAt": null,
    });
    return;
  }

  let trialContext: string | null = null;

  if (lead.status === "won") {
    if (!lead.teamId) {
      await db().doc(`sales-leads/${leadId}`).update({
        "flow.recommendedAction": "close",
        "flow.actionReason": "Lead is marked as won.",
        "flow.suggestedContent": "",
        "flow.priority": "low",
        "flow.touchCount": lead.flow?.touchCount || 0,
        "flow.analyzedAt": admin.firestore.FieldValue.serverTimestamp(),
        "flow.nextActionAt": null,
      });
      return;
    }

    const teamDoc = await db().doc(`team/${lead.teamId}`).get();
    if (!teamDoc.exists) return;
    const team = teamDoc.data()!;

    if (team.stripeSubscriptionId && team.subscriptionStatus === "active") {
      await db().doc(`sales-leads/${leadId}`).update({
        "flow.recommendedAction": "close",
        "flow.actionReason": "Lead converted to paying customer.",
        "flow.suggestedContent": "",
        "flow.priority": "low",
        "flow.touchCount": lead.flow?.touchCount || 0,
        "flow.analyzedAt": admin.firestore.FieldValue.serverTimestamp(),
        "flow.nextActionAt": null,
      });
      return;
    }

    const createdAt = team.createdAt?.toDate?.() ? team.createdAt.toDate() : new Date(team.createdAt);
    const trialEndDate = new Date(createdAt.getTime() + 14 * 24 * 60 * 60 * 1000);
    const now = new Date();
    const daysSinceTrialEnd = Math.floor((now.getTime() - trialEndDate.getTime()) / (24 * 60 * 60 * 1000));
    const daysInTrial = Math.floor((now.getTime() - createdAt.getTime()) / (24 * 60 * 60 * 1000));
    const trialExpired = now > trialEndDate;

    if (!trialExpired) {
      const daysLeft = 14 - daysInTrial;
      trialContext = `ACCOUNT STATUS: Signed up and currently in free trial. Day ${daysInTrial} of 14. ${daysLeft} day${daysLeft === 1 ? "" : "s"} remaining. Has NOT paid yet. No subscription.`;
      if (daysLeft > 5) {
        await db().doc(`sales-leads/${leadId}`).update({
          "flow.recommendedAction": "close",
          "flow.actionReason": `In free trial with ${daysLeft} days left. No action needed yet.`,
          "flow.suggestedContent": "",
          "flow.priority": "low",
          "flow.touchCount": lead.flow?.touchCount || 0,
          "flow.analyzedAt": admin.firestore.FieldValue.serverTimestamp(),
          "flow.nextActionAt": null,
        });
        return;
      }
    } else {
      trialContext = `ACCOUNT STATUS: FREE TRIAL EXPIRED ${daysSinceTrialEnd} day${daysSinceTrialEnd === 1 ? "" : "s"} ago. Account is now READ-ONLY. They have NOT subscribed or paid. This person used the product during their trial but did not convert. They need a reason to come back and pay.`;
      if (team.trialExpiredEmailSent) trialContext += " Automated trial-expired email was already sent.";
      if (team.trialFollowupEmailSent) trialContext += " Automated 7-day follow-up email was already sent.";
    }
  }

  const activitiesSnap = await db()
    .collection(`sales-leads/${leadId}/activity`)
    .orderBy("createdAt", "asc")
    .limit(50)
    .get();

  const activityLines = activitiesSnap.docs.map((d) => {
    const a = d.data();
    const ts = a.createdAt?.toDate?.()
      ? a.createdAt.toDate().toISOString()
      : "unknown time";
    const byWho = a.actorName ? ` by ${a.actorName}` : "";
    let line = `[${ts}] ${a.type}${byWho}`;
    if (a.type === "email_sent") {
      line += ` | Subject: ${a.emailSubject || "(no subject)"}`;
      const bodyText = (a.content || "")
        .replace(/<[^>]*>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .substring(0, 500);
      if (bodyText) line += ` | Body: ${bodyText}`;
    } else if (a.type === "email_received") {
      line += ` | INBOUND REPLY from ${a.senderEmail || "unknown"}`;
      if (a.emailSubject) line += ` | Subject: ${a.emailSubject}`;
      const plainText = (a.emailPlainText || a.content || "")
        .replace(/<[^>]*>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .substring(0, 500);
      if (plainText) line += ` | Content: ${plainText}`;
    } else if (a.type === "call") {
      line += ` | ${a.content || ""}`;
      if (a.callDuration) line += ` | Duration: ${a.callDuration}s`;
      if (a.transcript) line += ` | Transcript: ${a.transcript.substring(0, 500)}`;
    } else {
      line += ` | ${a.content || ""}`;
    }
    return line;
  });

  const tz = lead.state ? STATE_TIMEZONE[lead.state.toUpperCase()] || "unknown" : "unknown";
  const now = new Date();
  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const nowUtc = `${dayNames[now.getUTCDay()]}, ${now.toISOString()}`;

  let consultationSection = "No consultation report generated yet.";

  if (lead.consultationLeadId) {
    try {
      const consultLeadDoc = await db().doc(`osha-consultation-leads/${lead.consultationLeadId}`).get();
      const consultLead = consultLeadDoc.exists ? consultLeadDoc.data() : null;

      let publicData: any = null;
      if (consultLead?.publicConsultationId) {
        const publicDoc = await db().doc(`public-osha-consultations/${consultLead.publicConsultationId}`).get();
        publicData = publicDoc.exists ? publicDoc.data() : null;
      }

      const assessment = publicData?.assessment || consultLead?.assessment;
      const journey = publicData?.journey;

      const parts: string[] = ["Consultation report was generated and sent."];

      if (consultLead?.deliveryStatus) parts.push(`Email delivery: ${consultLead.deliveryStatus}`);
      if (consultLead?.emailSentAt) parts.push(`Email sent at: ${consultLead.emailSentAt}`);

      if (publicData) {
        parts.push(`Report views: ${publicData.viewCount || 0}`);
        if (publicData.lastViewedAt) parts.push(`Last viewed: ${publicData.lastViewedAt}`);
      }

      if (journey) {
        if (journey.reportViewed) parts.push("LEAD HAS VIEWED THE REPORT");
        if (journey.ctaClicked) parts.push("LEAD CLICKED THE CTA (strong buy signal)");
        if (journey.signupStarted) parts.push("LEAD STARTED SIGNUP");
        if (journey.accountCreated) parts.push("LEAD CREATED AN ACCOUNT");
        if (journey.firstVisitAt) parts.push(`First visit: ${journey.firstVisitAt}`);
        if (journey.lastActivityAt) parts.push(`Last activity: ${journey.lastActivityAt}`);
      }

      if (consultLead?.followupVideoSentAt) parts.push(`Video follow-up sent: ${consultLead.followupVideoSentAt}`);
      if (consultLead?.followupW1SentAt) parts.push(`Week 1 follow-up sent: ${consultLead.followupW1SentAt}`);
      if (consultLead?.followupW2SentAt) parts.push(`Week 2 follow-up sent: ${consultLead.followupW2SentAt}`);

      if (assessment) {
        if (assessment.importanceScore != null) parts.push(`Importance score: ${assessment.importanceScore}/100`);
        if (assessment.importanceLevel) parts.push(`Importance level: ${assessment.importanceLevel}`);
        if (assessment.summary) parts.push(`Summary: ${String(assessment.summary).substring(0, 300)}`);
        if (assessment.profile?.hazardFlags?.length) {
          parts.push(`Hazard flags: ${assessment.profile.hazardFlags.join(", ")}`);
        }
        if (assessment.profile?.oshaTrack) parts.push(`OSHA track: ${assessment.profile.oshaTrack}`);
        if (assessment.ulyssesTake) parts.push(`Ulysses take: ${String(assessment.ulyssesTake).substring(0, 300)}`);
      }

      consultationSection = parts.join("\n");
    } catch (err) {
      console.error(`Failed to fetch consultation data for lead ${leadId}:`, err);
    }
  }

  const userMessage = `Analyze this lead and recommend the next action.

CURRENT DATE/TIME (UTC): ${nowUtc}

LEAD PROFILE:
- Business: ${lead.businessName}
- Contact: ${lead.contactName}
- Email: ${lead.email}
- Phone: ${lead.phone}
- Industry: ${lead.industry || "unknown"}
- Location: ${lead.city || ""}${lead.city && lead.state ? ", " : ""}${lead.state || ""}
- Timezone: ${tz}
- Employee Estimate: ${lead.employeeEstimate || "unknown"}
- Year Established: ${lead.yearEstablished || "unknown"}
- Fit Reason: ${lead.fitReason || "none provided"}
- Best Contact Method: ${lead.bestContactMethod || "not specified"}
- Pipeline Status: ${lead.status}
- Source: ${lead.source}
- Created: ${lead.createdAt?.toDate?.() ? lead.createdAt.toDate().toISOString() : "unknown"}
- Last Contacted: ${lead.lastContactedAt?.toDate?.() ? lead.lastContactedAt.toDate().toISOString() : "never"}
- Email Link Clicks: ${lead.linkClickCount || 0}${lead.lastLinkClickAt?.toDate?.() ? ` (last click: ${lead.lastLinkClickAt.toDate().toISOString()})` : ""}

CONSULTATION REPORT:
${consultationSection}
${trialContext ? `\n${trialContext}\n` : ""}
ACTIVITY HISTORY (${activitiesSnap.size} entries, chronological):
${activityLines.length > 0 ? activityLines.join("\n") : "No activity yet."}

Return JSON only.`;

  const response = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.XAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "grok-3-fast",
      messages: [
        { role: "system", content: FLOW_SYSTEM_PROMPT },
        { role: "user", content: userMessage },
      ],
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    console.error("Flow analysis API error:", await response.text());
    return;
  }

  const grokResponse: any = await response.json();
  const raw = grokResponse.choices?.[0]?.message?.content || "";

  try {
    const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const parsed = JSON.parse(cleaned);

    const nextActionAt = parsed.nextActionAt
      ? admin.firestore.Timestamp.fromDate(new Date(parsed.nextActionAt))
      : null;

    await db().doc(`sales-leads/${leadId}`).update({
      "flow.nextActionAt": nextActionAt,
      "flow.recommendedAction": parsed.recommendedAction || "email",
      "flow.actionReason": parsed.actionReason || "",
      "flow.suggestedContent": parsed.suggestedContent || "",
      "flow.priority": parsed.priority || "medium",
      "flow.touchCount": typeof parsed.touchCount === "number" ? parsed.touchCount : 0,
      "flow.analyzedAt": admin.firestore.FieldValue.serverTimestamp(),
      "flow.recommendedOwner": parsed.recommendedOwner || null,
    });

    await addActivity(
      leadId,
      "flow_analyzed",
      `Flow analyzed: ${parsed.recommendedAction || "email"} recommended${parsed.recommendedOwner ? ` for ${parsed.recommendedOwner}` : ""}`,
      triggeredBy.actor,
      triggeredBy.actorType
    );
  } catch (err) {
    console.error("Failed to parse flow analysis response:", err, raw);
  }
}

export const analyzeSalesLeadFlow = onCall(
  { secrets: [xaiApiKey], timeoutSeconds: 60, memory: "256MiB" },
  async (request) => {
    const uid = await requireDev(request);
    const actor = await getActorInfo(uid);
    const { leadId } = request.data as any;
    if (!leadId) throw new HttpsError("invalid-argument", "Lead ID is required.");
    await runFlowAnalysis(leadId, { actor, actorType: "user" });
    return { success: true };
  }
);

export const onSalesLeadActivityCreated = onDocumentCreated(
  {
    document: "sales-leads/{leadId}/activity/{activityId}",
    secrets: [xaiApiKey],
    timeoutSeconds: 60,
    memory: "256MiB",
  },
  async (event) => {
    const activityType = event.data?.data()?.type;
    if (activityType === "flow_analyzed" || activityType === "flow_snoozed" || activityType === "flow_dismissed") return;

    const leadId = event.params.leadId;

    const leadDoc = await db().doc(`sales-leads/${leadId}`).get();
    const lastAnalyzed = leadDoc.data()?.flow?.analyzedAt?.toDate?.();
    if (lastAnalyzed && Date.now() - lastAnalyzed.getTime() < 60000) {
      console.log(`Skipping flow analysis for ${leadId}: analyzed ${Math.round((Date.now() - lastAnalyzed.getTime()) / 1000)}s ago`);
      return;
    }

    try {
      await runFlowAnalysis(leadId);
    } catch (err) {
      console.error(`Flow analysis failed for lead ${leadId}:`, err);
    }

    if (activityType === "email_received") {
      try {
        const leadDoc = await db().doc(`sales-leads/${leadId}`).get();
        const flow = leadDoc.data()?.flow;
        if (flow?.nextActionAt) {
          const nextAction = flow.nextActionAt.toDate ? flow.nextActionAt.toDate() : new Date(flow.nextActionAt.seconds ? flow.nextActionAt.seconds * 1000 : flow.nextActionAt);
          const now = new Date();
          const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
          if (nextAction > endOfToday && flow.priority !== "high") {
            await db().doc(`sales-leads/${leadId}`).update({
              "flow.priority": "high",
            });
          }
        }
      } catch (err) {
        console.error(`Failed to bump priority after inbound for lead ${leadId}:`, err);
      }
    }
  }
);

export const refreshAllSalesLeadFlow = onCall(
  { secrets: [xaiApiKey], timeoutSeconds: 540, memory: "512MiB" },
  async (request) => {
    const uid = await requireDev(request);
    const actor = await getActorInfo(uid);

    const leadsSnap = await db()
      .collection("sales-leads")
      .where("status", "not-in", ["lost", "test"])
      .get();

    let analyzed = 0;
    let failed = 0;

    for (const doc of leadsSnap.docs) {
      try {
        await runFlowAnalysis(doc.id, { actor, actorType: "user" });
        analyzed++;
      } catch (err) {
        console.error(`Flow refresh failed for ${doc.id}:`, err);
        failed++;
      }
    }

    return { analyzed, failed, total: leadsSnap.size };
  }
);

export const checkExpiredTrialLeadsFlow = onSchedule(
  {
    schedule: "0 16 * * *",
    secrets: [xaiApiKey],
    timeoutSeconds: 300,
    memory: "512MiB",
  },
  async () => {
    const wonLeadsSnap = await db()
      .collection("sales-leads")
      .where("status", "==", "won")
      .get();

    let checked = 0;
    let analyzed = 0;

    for (const leadDoc of wonLeadsSnap.docs) {
      const lead = leadDoc.data();
      if (!lead.teamId || lead.archived) continue;

      checked++;

      try {
        await runFlowAnalysis(leadDoc.id);
        analyzed++;
      } catch (err) {
        console.error(`Expired trial flow check failed for ${leadDoc.id}:`, err);
      }
    }

    console.log(`Expired trial flow check: ${checked} won leads checked, ${analyzed} analyzed`);
  }
);

async function findSalesLeadByConsultationLeadId(consultationLeadId: string): Promise<string | null> {
  const snap = await db()
    .collection("sales-leads")
    .where("consultationLeadId", "==", consultationLeadId)
    .limit(1)
    .get();
  return snap.empty ? null : snap.docs[0].id;
}

export const onPublicConsultationUpdatedForFlow = onDocumentUpdated(
  {
    document: "public-osha-consultations/{docId}",
    secrets: [xaiApiKey],
    timeoutSeconds: 60,
    memory: "256MiB",
  },
  async (event) => {
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();
    if (!before || !after) return;

    const journeyChanged =
      after.journey?.ctaClicked !== before.journey?.ctaClicked ||
      after.journey?.signupStarted !== before.journey?.signupStarted ||
      after.journey?.accountCreated !== before.journey?.accountCreated;

    const firstView = (before.viewCount || 0) === 0 && (after.viewCount || 0) > 0;

    if (!journeyChanged && !firstView) return;

    const consultationLeadId = after.leadId;
    if (!consultationLeadId) return;

    const salesLeadId = await findSalesLeadByConsultationLeadId(consultationLeadId);
    if (!salesLeadId) return;

    const leadDoc = await db().doc(`sales-leads/${salesLeadId}`).get();
    const lastAnalyzed = leadDoc.data()?.flow?.analyzedAt?.toDate?.();
    if (lastAnalyzed && Date.now() - lastAnalyzed.getTime() < 300000) {
      console.log(`Skipping flow re-analysis for ${salesLeadId}: analyzed ${Math.round((Date.now() - lastAnalyzed.getTime()) / 1000)}s ago`);
      return;
    }

    try {
      await runFlowAnalysis(salesLeadId);
    } catch (err) {
      console.error(`Flow re-analysis failed after consultation view update for sales lead ${salesLeadId}:`, err);
    }
  }
);

export const onConsultationLeadUpdatedForFlow = onDocumentUpdated(
  {
    document: "osha-consultation-leads/{leadId}",
    secrets: [xaiApiKey],
    timeoutSeconds: 60,
    memory: "256MiB",
  },
  async (event) => {
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();
    if (!before || !after) return;

    const followupChanged =
      after.followupVideoSentAt !== before.followupVideoSentAt ||
      after.followupW1SentAt !== before.followupW1SentAt ||
      after.followupW2SentAt !== before.followupW2SentAt;

    if (!followupChanged) return;

    const consultationLeadId = event.params.leadId;
    const salesLeadId = await findSalesLeadByConsultationLeadId(consultationLeadId);
    if (!salesLeadId) return;

    try {
      await runFlowAnalysis(salesLeadId);
    } catch (err) {
      console.error(`Flow re-analysis failed after consultation lead update for sales lead ${salesLeadId}:`, err);
    }
  }
);

// ── Archive / Snooze / Dismiss (logged actions) ──────────────────────────────

export const archiveSalesLead = onCall(
  { secrets: [] },
  async (request) => {
    const uid = await requireDev(request);
    const actor = await getActorInfo(uid);
    const { leadId, archived } = request.data as any;
    if (!leadId || archived === undefined) {
      throw new HttpsError("invalid-argument", "Lead ID and archived flag are required.");
    }

    await db().doc(`sales-leads/${leadId}`).update({
      archived,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    await addActivity(
      leadId,
      archived ? "lead_archived" : "lead_unarchived",
      archived ? "Lead archived" : "Lead unarchived",
      actor
    );

    return { success: true };
  }
);

export const snoozeSalesLeadFlow = onCall(
  { secrets: [] },
  async (request) => {
    const uid = await requireDev(request);
    const actor = await getActorInfo(uid);
    const { leadId, snoozeUntil } = request.data as any;
    if (!leadId || !snoozeUntil) {
      throw new HttpsError("invalid-argument", "Lead ID and snooze date are required.");
    }

    const snoozeDate = new Date(snoozeUntil);
    await db().doc(`sales-leads/${leadId}`).update({
      "flow.nextActionAt": admin.firestore.Timestamp.fromDate(snoozeDate),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    const formatted = snoozeDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    await addActivity(leadId, "flow_snoozed", `Flow snoozed until ${formatted}`, actor);

    return { success: true };
  }
);

export const dismissSalesLeadFlow = onCall(
  { secrets: [] },
  async (request) => {
    const uid = await requireDev(request);
    const actor = await getActorInfo(uid);
    const { leadId } = request.data as any;
    if (!leadId) throw new HttpsError("invalid-argument", "Lead ID is required.");

    await db().doc(`sales-leads/${leadId}`).update({
      "flow.nextActionAt": null,
      "flow.recommendedAction": null,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    await addActivity(leadId, "flow_dismissed", "Flow recommendation dismissed", actor);

    return { success: true };
  }
);

// ── Inbound Email (Reply Capture) ─────────────────────────────────────────────

function extractLeadIdFromRecipient(toAddress: string): string | null {
  const match = toAddress.match(/reply\+([a-zA-Z0-9]+)@/);
  return match ? match[1] : null;
}

function stripQuotedReply(text: string): string {
  const markers = [
    /^On .+ wrote:$/m,
    /^-{2,}\s*Original Message\s*-{2,}/m,
    /^>{1,}\s/m,
    /^From:\s/m,
  ];
  let cutIndex = text.length;
  for (const marker of markers) {
    const idx = text.search(marker);
    if (idx > 0 && idx < cutIndex) cutIndex = idx;
  }
  return text.substring(0, cutIndex).trim();
}

function stripQuotedReplyHtml(html: string): string {
  let cleaned = html;

  // Gmail wraps quoted content in <div class="gmail_quote">
  cleaned = cleaned.replace(/<div[^>]*class="gmail_quote"[^>]*>[\s\S]*$/i, "");
  // Outlook uses <div id="appendonsend"> or <div id="divRplyFwdMsg">
  cleaned = cleaned.replace(/<div[^>]*id="(appendonsend|divRplyFwdMsg)"[^>]*>[\s\S]*$/i, "");
  // Yahoo uses <div class="yahoo_quoted">
  cleaned = cleaned.replace(/<div[^>]*class="yahoo_quoted"[^>]*>[\s\S]*$/i, "");
  // Generic: <blockquote> tags used by many clients
  cleaned = cleaned.replace(/<blockquote[^>]*>[\s\S]*<\/blockquote>/gi, "");
  // "On ... wrote:" pattern in HTML (often wrapped in a <div> before the quote)
  cleaned = cleaned.replace(/<div[^>]*>On .+wrote:<\/div>[\s\S]*$/i, "");
  // Apple Mail: <br><div><br><blockquote...
  cleaned = cleaned.replace(/<br[^>]*>\s*<div[^>]*>\s*<br[^>]*>\s*<blockquote[\s\S]*$/i, "");

  return cleaned.trim();
}

function parseMultipartForm(req: any): Promise<Record<string, string>> {
  return new Promise((resolve, reject) => {
    const fields: Record<string, string> = {};
    const bb = Busboy({ headers: req.headers });

    bb.on("field", (name: string, val: string) => {
      fields[name] = val;
    });

    bb.on("file", (_name: string, file: any) => {
      file.resume();
    });

    bb.on("finish", () => resolve(fields));
    bb.on("error", (err: Error) => reject(err));

    if (req.rawBody) {
      bb.end(req.rawBody);
    } else {
      req.pipe(bb);
    }
  });
}

export const salesEmailInbound = onRequest(
  { secrets: [] },
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).send("Method not allowed");
      return;
    }

    try {
      const contentType = req.headers["content-type"] || "";
      let fields: Record<string, string>;

      if (contentType.includes("multipart/form-data")) {
        fields = await parseMultipartForm(req);
      } else {
        fields = req.body || {};
      }

      console.log("Inbound email fields received:", {
        keys: Object.keys(fields),
        hasEnvelope: !!fields.envelope,
        hasTo: !!fields.to,
        hasFrom: !!fields.from,
        hasSubject: !!fields.subject,
        hasText: !!fields.text,
      });

      const envelope = fields.envelope ? JSON.parse(fields.envelope) : {};
      const toAddresses: string[] = Array.isArray(envelope.to)
        ? envelope.to
        : [envelope.to || fields.to || ""];
      const fromEmail = (envelope.from || fields.from || "").toLowerCase().trim();
      const subject = fields.subject || "(no subject)";
      const textBody = fields.text || "";
      const htmlBody = fields.html || "";

      let leadId: string | null = null;
      for (const addr of toAddresses) {
        leadId = extractLeadIdFromRecipient(addr);
        if (leadId) break;
      }

      if (!leadId) {
        if (fromEmail) {
          const snap = await db()
            .collection("sales-leads")
            .where("email", "==", fromEmail)
            .limit(1)
            .get();
          if (!snap.empty) leadId = snap.docs[0].id;
        }
      }

      if (!leadId) {
        console.warn("Inbound email could not be matched to a lead.", {
          from: fromEmail,
          to: toAddresses,
          subject,
        });
        res.status(200).send("OK");
        return;
      }

      const leadDoc = await db().doc(`sales-leads/${leadId}`).get();
      if (!leadDoc.exists) {
        console.warn(`Inbound email matched lead ${leadId} but lead not found.`);
        res.status(200).send("OK");
        return;
      }

      let inboundMessageId: string | null = null;
      if (fields.headers) {
        const msgIdMatch = fields.headers.match(/Message-I[Dd]:\s*(<[^>]+>|[^\r\n]+)/);
        if (msgIdMatch) inboundMessageId = msgIdMatch[1].trim();
      }

      const replyText = stripQuotedReply(textBody);
      const strippedHtml = htmlBody ? stripQuotedReplyHtml(htmlBody) : "";
      const displayContent = strippedHtml || `<p>${replyText.replace(/\n/g, "<br>")}</p>`;

      await addActivity(leadId, "email_received", displayContent, AGENT_ACTOR, "agent", {
        emailSubject: subject,
        emailHtml: displayContent,
        emailPlainText: replyText,
        senderEmail: fromEmail,
        messageId: inboundMessageId,
      });

      const now = admin.firestore.FieldValue.serverTimestamp();
      await db().doc(`sales-leads/${leadId}`).update({
        updatedAt: now,
        hasUnviewedInbound: true,
        unviewedInboundCount: admin.firestore.FieldValue.increment(1),
      });

      console.log(`Inbound reply captured for lead ${leadId} from ${fromEmail}`);
      res.status(200).send("OK");
    } catch (err) {
      console.error("Error processing inbound email:", err);
      res.status(200).send("OK");
    }
  }
);

export const markSalesLeadInboundViewed = onCall(
  { secrets: [] },
  async (request) => {
    await requireDev(request);
    const { leadId } = request.data as any;
    if (!leadId) throw new HttpsError("invalid-argument", "Lead ID is required.");

    await db().doc(`sales-leads/${leadId}`).update({
      hasUnviewedInbound: false,
      unviewedInboundCount: 0,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return { success: true };
  }
);

// ── Backfill existing teams as sales leads ────────────────────────────────────

export const backfillSalesLeadsFromTeams = onCall(
  { secrets: [], timeoutSeconds: 300, memory: "512MiB" },
  async (request) => {
    await requireDev(request);

    const teamsSnap = await db().collection("team").get();

    const existingLeadsByEmail = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
    const leadsSnap = await db().collection("sales-leads").get();
    for (const doc of leadsSnap.docs) {
      const email = doc.data().email;
      if (email) existingLeadsByEmail.set(email, doc);
    }

    const existingLeadTeamIds = new Set<string>();
    for (const doc of leadsSnap.docs) {
      const tid = doc.data().teamId;
      if (tid) existingLeadTeamIds.add(tid);
    }

    let created = 0;
    let updated = 0;
    let skippedNoEmail = 0;
    let skippedAlreadyLinked = 0;
    const errors: string[] = [];

    for (const teamDoc of teamsSnap.docs) {
      const team = teamDoc.data();
      const teamId = teamDoc.id;

      if (existingLeadTeamIds.has(teamId)) {
        skippedAlreadyLinked++;
        continue;
      }

      const email = team.email?.trim().toLowerCase();
      if (!email) {
        skippedNoEmail++;
        continue;
      }

      try {
        let contactName: string | null = null;
        if (team.ownerId) {
          const userDoc = await db().doc(`user/${team.ownerId}`).get();
          if (userDoc.exists) {
            contactName = userDoc.data()?.name || null;
          }
        }

        const now = admin.firestore.FieldValue.serverTimestamp();
        const existingLead = existingLeadsByEmail.get(email);

        if (existingLead) {
          const oldStatus = existingLead.data().status;
          const updates: Record<string, any> = {
            status: "won" as SalesLeadStatus,
            teamId,
            updatedAt: now,
          };
          if (contactName && !existingLead.data().contactName) {
            updates.contactName = contactName;
          }
          await existingLead.ref.update(updates);

          if (oldStatus !== "won") {
            await addActivity(
              existingLead.id,
              "account_signup",
              `Backfill: account existed. Status changed from ${oldStatus} to won.`,
              AGENT_ACTOR,
              "agent"
            );
          }
          existingLeadTeamIds.add(teamId);
          updated++;
        } else {
          let consultationLeadId: string | null = "backfill";
          let consultationUrl: string | null = null;
          if (team.consultationAssessmentId) {
            const consultDoc = await db()
              .doc(`osha-consultation-leads/${team.consultationAssessmentId}`)
              .get();
            if (consultDoc.exists) {
              consultationLeadId = team.consultationAssessmentId;
              consultationUrl = consultDoc.data()?.publicUrl || null;
            }
          }

          const leadDoc = await db().collection("sales-leads").add({
            contactName,
            email,
            phone: null,
            businessName: team.name || "Unknown",
            businessNameLower: (team.name || "unknown").toLowerCase(),
            website: team.website || null,
            industry: team.industry || null,
            state: team.state || null,
            city: null,
            zip: null,
            source: "signup" as SalesLeadSource,
            status: "won" as SalesLeadStatus,
            teamId,
            employeeEstimate: team.employeeCount ? String(team.employeeCount) : null,
            researchSessionId: null,
            nextFollowUp: null,
            createdAt: team.createdAt || now,
            updatedAt: now,
            lastContactedAt: null,
            createdBy: "system",
            archived: false,
            consultationLeadId,
            consultationUrl,
          });

          await addActivity(
            leadDoc.id,
            "account_signup",
            "Lead backfilled from existing account.",
            AGENT_ACTOR,
            "agent"
          );

          existingLeadsByEmail.set(email, leadDoc as any);
          existingLeadTeamIds.add(teamId);
          created++;
        }
      } catch (err: any) {
        errors.push(`Team ${teamId}: ${err.message || err}`);
      }
    }

    const summary = {
      totalTeams: teamsSnap.size,
      created,
      updated,
      skippedNoEmail,
      skippedAlreadyLinked,
      errors: errors.length,
      errorDetails: errors.slice(0, 20),
    };
    console.log("Backfill complete:", JSON.stringify(summary));
    return summary;
  }
);

// ── Auto-create / update sales lead on account signup ─────────────────────────

export const onTeamCreatedSalesLead = onDocumentCreated(
  { document: "team/{teamId}" },
  async (event) => {
    const team = event.data?.data();
    const teamId = event.params.teamId;
    if (!team) return;

    const email = team.email?.trim().toLowerCase();
    if (!email) return;

    let contactName: string | null = null;
    if (team.ownerId) {
      try {
        const userDoc = await db().doc(`user/${team.ownerId}`).get();
        if (userDoc.exists) {
          contactName = userDoc.data()?.name || null;
        }
      } catch (err) {
        console.warn("Could not fetch owner user doc for sales lead creation:", err);
      }
    }

    const existingQuery = await db()
      .collection("sales-leads")
      .where("email", "==", email)
      .limit(1)
      .get();

    const now = admin.firestore.FieldValue.serverTimestamp();

    if (!existingQuery.empty) {
      const existingDoc = existingQuery.docs[0];
      const oldStatus = existingDoc.data().status;

      const updates: Record<string, any> = {
        status: "won" as SalesLeadStatus,
        teamId,
        updatedAt: now,
      };

      if (contactName && !existingDoc.data().contactName) {
        updates.contactName = contactName;
      }

      await existingDoc.ref.update(updates);

      if (oldStatus !== "won") {
        await addActivity(
          existingDoc.id,
          "account_signup",
          `Account created. Status changed from ${oldStatus} to won.`,
          AGENT_ACTOR,
          "agent"
        );
      }

      console.log(`Sales lead ${existingDoc.id} updated to won for team ${teamId}`);
    } else {
      let consultationLeadId: string | null = null;
      let consultationUrl: string | null = null;
      if (team.consultationAssessmentId) {
        try {
          const consultDoc = await db()
            .doc(`osha-consultation-leads/${team.consultationAssessmentId}`)
            .get();
          if (consultDoc.exists) {
            consultationLeadId = team.consultationAssessmentId;
            consultationUrl = consultDoc.data()?.publicUrl || null;
          }
        } catch (err) {
          console.warn("Could not fetch consultation lead for linking:", err);
        }
      }

      const leadDoc = await db().collection("sales-leads").add({
        contactName,
        email,
        phone: null,
        businessName: team.name || "Unknown",
        businessNameLower: (team.name || "unknown").toLowerCase(),
        website: team.website || null,
        industry: team.industry || null,
        state: team.state || null,
        city: null,
        zip: null,
        source: "signup" as SalesLeadSource,
        status: "won" as SalesLeadStatus,
        teamId,
        employeeEstimate: team.employeeCount ? String(team.employeeCount) : null,
        researchSessionId: null,
        nextFollowUp: null,
        createdAt: now,
        updatedAt: now,
        lastContactedAt: null,
        createdBy: "system",
        archived: false,
        consultationLeadId,
        consultationUrl,
      });

      await addActivity(
        leadDoc.id,
        "account_signup",
        "Lead auto-created from account signup.",
        AGENT_ACTOR,
        "agent"
      );

      console.log(`Sales lead ${leadDoc.id} created from team ${teamId} signup`);
    }
  }
);

// ── Account Insights ──────────────────────────────────────────────────────────

export const getSalesLeadAccountInsights = onCall(
  { secrets: [] },
  async (request) => {
    await requireDev(request);
    const { teamId } = request.data as { teamId: string };
    if (!teamId) throw new HttpsError("invalid-argument", "teamId is required.");

    const teamDoc = await db().doc(`team/${teamId}`).get();
    if (!teamDoc.exists) throw new HttpsError("not-found", "Team not found.");
    const team = teamDoc.data()!;

    const membersSnap = await db()
      .collection("team-members")
      .where("teamId", "==", teamId)
      .get();
    const memberCount = membersSnap.docs.filter((d) => !d.data().deleted).length;

    const inspectionsSnap = await db()
      .collection(`team/${teamId}/self-inspection`)
      .get();
    let lastInspectionAt: string | null = null;
    let inspectionCount = 0;
    for (const doc of inspectionsSnap.docs) {
      const subsSnap = await db()
        .collection(`team/${teamId}/self-inspection/${doc.id}/inspections`)
        .orderBy("createdAt", "desc")
        .limit(1)
        .get();
      if (!subsSnap.empty) {
        inspectionCount++;
        const ts = subsSnap.docs[0].data().createdAt;
        const dateStr = ts?.toDate ? ts.toDate().toISOString() : null;
        if (dateStr && (!lastInspectionAt || dateStr > lastInspectionAt)) {
          lastInspectionAt = dateStr;
        }
      }
    }

    const librarySnap = await db()
      .collection("library")
      .where("teamId", "==", teamId)
      .get();
    const trainingCount = librarySnap.size;

    const surveysSnap = await db()
      .collection("survey")
      .where("teamId", "==", teamId)
      .orderBy("runDate", "desc")
      .limit(1)
      .get();
    const lastTrainingAt = surveysSnap.empty
      ? null
      : (() => {
          const ts = surveysSnap.docs[0].data().runDate;
          return ts?.toDate ? ts.toDate().toISOString() : null;
        })();

    const incidentsSnap = await db()
      .collection("incident-report")
      .where("teamId", "==", teamId)
      .get();
    const incidentCount = incidentsSnap.size;

    const activitySnap = await db()
      .collection(`team/${teamId}/chimpActivity`)
      .orderBy("timestamp", "desc")
      .limit(5)
      .get();
    const recentActivity = activitySnap.docs.map((d) => {
      const data = d.data();
      return {
        actionType: data.actionType || null,
        description: data.description || null,
        source: data.source || null,
        timestamp: data.timestamp?.toDate ? data.timestamp.toDate().toISOString() : null,
      };
    });

    const lastLogSnap = await db()
      .collection(`team/${teamId}/log`)
      .orderBy("createdAt", "desc")
      .limit(1)
      .get();
    const lastActiveAt = lastLogSnap.empty
      ? null
      : (() => {
          const ts = lastLogSnap.docs[0].data().createdAt;
          return ts?.toDate ? ts.toDate().toISOString() : null;
        })();

    return {
      subscription: {
        status: team.stripeSubscriptionId ? (team.subscriptionStatus || "active") : "none",
        planId: team.stripePlanId || null,
        customerId: team.stripeCustomerId || null,
      },
      memberCount,
      usage: {
        inspectionCount,
        lastInspectionAt,
        trainingCount,
        lastTrainingAt,
        incidentCount,
      },
      lastActiveAt,
      recentActivity,
      teamCreatedAt: team.createdAt?.toDate ? team.createdAt.toDate().toISOString() : null,
    };
  }
);

// ── Sequence Tracks ───────────────────────────────────────────────────────────

async function executeSequenceStep(
  leadId: string,
  lead: FirebaseFirestore.DocumentData,
  track: FirebaseFirestore.DocumentData,
  stepIndex: number
): Promise<void> {
  const step = track.steps?.[stepIndex];
  if (!step) {
    await db().doc(`sales-leads/${leadId}`).update({
      sequenceStatus: "completed",
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return;
  }

  if (step.type === "email") {
    if (!lead.email) {
      console.warn(`Sequence: lead ${leadId} has no email, skipping email step`);
    } else {
      let bodyHtml = step.bodyHtml || "";
      let subject = step.subject || "";
      bodyHtml = bodyHtml.replace(/\{companyName\}/g, lead.businessName || "");
      subject = subject.replace(/\{companyName\}/g, lead.businessName || "");
      bodyHtml = appendTrackingParams(bodyHtml, leadId);

      const nodemailer = require("nodemailer");
      const sendgridTransport = require("nodemailer-sendgrid-transport");
      const client = nodemailer.createTransport(
        sendgridTransport({ auth: { api_key: process.env.SENDGRID_API_KEY } })
      );

      const mailOptions = {
        from: '"Ryan at ComplianceChimp" <support@compliancechimp.com>',
        replyTo: `reply+${leadId}@reply.compliancechimp.com`,
        to: lead.email,
        subject,
        html: bodyHtml,
      };

      await client.sendMail(mailOptions);

      await addActivity(leadId, "email_sent", bodyHtml, AGENT_ACTOR, "agent", {
        emailSubject: subject,
        emailHtml: bodyHtml,
      });

      await db().collection("sales-email-history").add({
        subject,
        bodyHtml,
        leadId,
        recipientName: lead.contactName || "",
        recipientBusiness: lead.businessName || "",
        industry: lead.industry || "",
        sentAt: admin.firestore.FieldValue.serverTimestamp(),
        sentBy: "sequence",
      });

      await db().doc(`sales-leads/${leadId}`).update({
        lastContactedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      console.log(`Sequence: sent email to ${lead.email} for lead ${leadId}`);
    }
  } else if (step.type === "call") {
    await db().doc(`sales-leads/${leadId}`).update({
      flow: {
        recommendedAction: "call",
        nextActionAt: admin.firestore.Timestamp.now(),
        actionReason: `Sequence step ${stepIndex + 1}: ${step.callNotes || "Follow-up call"}`,
        suggestedContent: step.callNotes || null,
        priority: "high",
        touchCount: admin.firestore.FieldValue.increment(0),
        analyzedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
    });

    await addActivity(leadId, "flow_analyzed", `Sequence: call step scheduled. ${step.callNotes || ""}`, AGENT_ACTOR, "agent");
    console.log(`Sequence: surfaced call for lead ${leadId}`);
  } else if (step.type === "consultation_followup") {
    const consultLeadId = lead.consultationLeadId;
    if (!consultLeadId) {
      console.warn(`Sequence: lead ${leadId} has no consultationLeadId, skipping followup step`);
    } else {
      const consultLeadSnap = await db().doc(`osha-consultation-leads/${consultLeadId}`).get();
      if (!consultLeadSnap.exists) {
        console.warn(`Sequence: consultation lead ${consultLeadId} not found, skipping followup step`);
      } else {
        const consultLead = consultLeadSnap.data()!;
        const companyName = String(consultLead.companyName || consultLead.assessment?.profile?.companyName || lead.businessName || "your business");
        const publicUrl = String(consultLead.publicUrl || "");
        const trackedUrl = `${publicUrl}?ref=sequence_followup&lid=${consultLeadId}`;
        const email = String(consultLead.email || lead.email || "");

        const publicConsultationId = consultLead.publicConsultationId;
        let reportViewed = false;
        if (publicConsultationId) {
          const publicSnap = await db().doc(`public-osha-consultations/${publicConsultationId}`).get();
          if (publicSnap.exists) {
            reportViewed = publicSnap.data()?.journey?.reportViewed === true;
          }
        }

        const variant = step.followupVariant || "auto";
        let sent = false;

        if (email) {
          const nodemailer = require("nodemailer");
          const sendgridTransport = require("nodemailer-sendgrid-transport");
          const client = nodemailer.createTransport(
            sendgridTransport({ auth: { api_key: process.env.SENDGRID_API_KEY } })
          );
          const fromAddress = CONSULTATION_LEAD_SENDERS[Math.floor(Math.random() * CONSULTATION_LEAD_SENDERS.length)];

          if (variant === "auto") {
            if (reportViewed && !consultLead.followupVideoSentAt) {
              const subject = `See what happens after the ${companyName} report`;
              const html = buildVideoFollowupEmailHtml({ companyName, publicUrl: trackedUrl });
              const text = buildVideoFollowupEmailText({ companyName, publicUrl: trackedUrl });
              await client.sendMail({ from: fromAddress, to: email, subject, html, text });
              const sentAt = new Date().toISOString();
              await db().doc(`osha-consultation-leads/${consultLeadId}`).set(
                { followupVideoSentAt: sentAt, updatedAt: admin.firestore.FieldValue.serverTimestamp() },
                { merge: true }
              );
              await addActivity(leadId, "email_sent", html, AGENT_ACTOR, "agent", { emailSubject: subject, emailHtml: html });
              sent = true;
              console.log(`Sequence: sent video followup for lead ${leadId}`);
            } else if (!reportViewed && !consultLead.followupW1SentAt) {
              const subject = `One thing from your ${companyName} consultation`;
              const html = buildNonViewerFollowupEmailHtml({ companyName, assessment: consultLead.assessment, publicUrl: `${trackedUrl}&seq=w1`, week: 1 });
              const text = buildNonViewerFollowupEmailText({ companyName, assessment: consultLead.assessment, publicUrl: `${trackedUrl}&seq=w1`, week: 1 });
              await client.sendMail({ from: fromAddress, to: email, subject, html, text });
              const sentAt = new Date().toISOString();
              await db().doc(`osha-consultation-leads/${consultLeadId}`).set(
                { followupW1SentAt: sentAt, updatedAt: admin.firestore.FieldValue.serverTimestamp() },
                { merge: true }
              );
              await addActivity(leadId, "email_sent", html, AGENT_ACTOR, "agent", { emailSubject: subject, emailHtml: html });
              sent = true;
              console.log(`Sequence: sent W1 followup for lead ${leadId}`);
            } else {
              console.log(`Sequence: auto followup skipped for lead ${leadId} (already sent or no action needed)`);
            }
          } else if (variant === "w2") {
            if (!reportViewed && !consultLead.followupW2SentAt) {
              const subject = `One more thing from your ${companyName} consultation`;
              const html = buildNonViewerFollowupEmailHtml({ companyName, assessment: consultLead.assessment, publicUrl: `${trackedUrl}&seq=w2`, week: 2 });
              const text = buildNonViewerFollowupEmailText({ companyName, assessment: consultLead.assessment, publicUrl: `${trackedUrl}&seq=w2`, week: 2 });
              await client.sendMail({ from: fromAddress, to: email, subject, html, text });
              const sentAt = new Date().toISOString();
              await db().doc(`osha-consultation-leads/${consultLeadId}`).set(
                { followupW2SentAt: sentAt, updatedAt: admin.firestore.FieldValue.serverTimestamp() },
                { merge: true }
              );
              await addActivity(leadId, "email_sent", html, AGENT_ACTOR, "agent", { emailSubject: subject, emailHtml: html });
              sent = true;
              console.log(`Sequence: sent W2 followup for lead ${leadId}`);
            } else {
              console.log(`Sequence: W2 followup skipped for lead ${leadId} (viewed or already sent)`);
            }
          }
        }

        if (!sent) {
          console.log(`Sequence: consultation followup step had nothing to send for lead ${leadId}`);
        }
      }
    }
  }

  const nextStepIndex = stepIndex + 1;
  if (nextStepIndex >= track.steps.length) {
    await db().doc(`sales-leads/${leadId}`).update({
      sequenceCurrentStep: nextStepIndex,
      sequenceStatus: "completed",
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  } else {
    const nextStep = track.steps[nextStepIndex];
    const nextDate = new Date(Date.now() + (nextStep.delayDays || 0) * 86400000);
    await db().doc(`sales-leads/${leadId}`).update({
      sequenceCurrentStep: nextStepIndex,
      sequenceNextActionAt: admin.firestore.Timestamp.fromDate(nextDate),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }
}

export const startLeadOnSequence = onCall(
  { secrets: [sendgridApiKey] },
  async (request) => {
    await requireDev(request);
    const { leadId, trackId } = request.data as any;

    if (!leadId || !trackId) {
      throw new HttpsError("invalid-argument", "Lead ID and track ID are required.");
    }

    const leadDoc = await db().doc(`sales-leads/${leadId}`).get();
    if (!leadDoc.exists) throw new HttpsError("not-found", "Lead not found.");
    const lead = leadDoc.data()!;

    const trackDoc = await db().doc(`sales-sequence-tracks/${trackId}`).get();
    if (!trackDoc.exists) throw new HttpsError("not-found", "Sequence track not found.");

    const track = trackDoc.data()!;
    if (!track.steps?.length) {
      throw new HttpsError("failed-precondition", "Sequence track has no steps.");
    }

    const firstStep = track.steps[0];
    const immediateStart = !firstStep.delayDays || firstStep.delayDays === 0;

    if (immediateStart) {
      await db().doc(`sales-leads/${leadId}`).update({
        sequenceTrackId: trackId,
        sequenceCurrentStep: 0,
        sequenceStartedAt: admin.firestore.FieldValue.serverTimestamp(),
        sequenceNextActionAt: admin.firestore.Timestamp.now(),
        sequenceStatus: "active",
        "flow.recommendedAction": "close",
        "flow.actionReason": "Managed by sequence.",
        "flow.priority": "low",
        "flow.analyzedAt": admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      await executeSequenceStep(leadId, lead, track, 0);
    } else {
      const nextActionAt = new Date(Date.now() + firstStep.delayDays * 86400000);
      await db().doc(`sales-leads/${leadId}`).update({
        sequenceTrackId: trackId,
        sequenceCurrentStep: 0,
        sequenceStartedAt: admin.firestore.FieldValue.serverTimestamp(),
        sequenceNextActionAt: admin.firestore.Timestamp.fromDate(nextActionAt),
        sequenceStatus: "active",
        "flow.recommendedAction": "close",
        "flow.actionReason": "Managed by sequence.",
        "flow.priority": "low",
        "flow.analyzedAt": admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    return { success: true };
  }
);

export const processSequenceQueue = onSchedule(
  {
    schedule: "*/15 * * * *",
    secrets: [sendgridApiKey],
    timeoutSeconds: 300,
    memory: "512MiB",
  },
  async () => {
    const now = admin.firestore.Timestamp.now();

    const leadsSnap = await db()
      .collection("sales-leads")
      .where("sequenceStatus", "==", "active")
      .where("sequenceNextActionAt", "<=", now)
      .get();

    if (leadsSnap.empty) return;

    console.log(`processSequenceQueue: ${leadsSnap.size} leads ready`);

    for (const leadDoc of leadsSnap.docs) {
      const lead = leadDoc.data();
      const leadId = leadDoc.id;
      const trackId = lead.sequenceTrackId;
      const currentStep = lead.sequenceCurrentStep ?? 0;

      try {
        const trackDoc = await db().doc(`sales-sequence-tracks/${trackId}`).get();
        if (!trackDoc.exists) {
          await db().doc(`sales-leads/${leadId}`).update({
            sequenceStatus: "completed",
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
          continue;
        }

        const track = trackDoc.data()!;
        await executeSequenceStep(leadId, lead, track, currentStep);
      } catch (err) {
        console.error(`Sequence processing error for lead ${leadId}:`, err);
      }
    }
  }
);

// ── Link Click Tracking ───────────────────────────────────────────────────────

export const recordLeadClick = onCall(
  { secrets: [] },
  async (request) => {
    const { lid, page, ref } = request.data as { lid?: string; page?: string; ref?: string };
    if (!lid) {
      throw new HttpsError("invalid-argument", "Lead ID (lid) is required.");
    }

    const leadDoc = await db().doc(`sales-leads/${lid}`).get();
    if (!leadDoc.exists) {
      return { success: false, reason: "lead_not_found" };
    }

    const now = admin.firestore.FieldValue.serverTimestamp();
    await db().doc(`sales-leads/${lid}`).update({
      linkClickCount: admin.firestore.FieldValue.increment(1),
      lastLinkClickAt: now,
      updatedAt: now,
    });

    await addActivity(lid, "link_clicked", `Visited ${page || "/"}`, AGENT_ACTOR, "agent", {
      page: page || null,
      ref: ref || null,
    });

    return { success: true };
  }
);

// ── Auto-Research Config ──────────────────────────────────────────────────────

export const updateAutoResearchConfig = onCall(
  { secrets: [] },
  async (request) => {
    await requireDev(request);
    const updates = request.data as Record<string, any>;

    const allowed = ["enabled", "leadsPerDay", "addMode", "sequenceTrackId", "targetIndustries", "targetStates", "targetCompanySize"];
    const safeUpdates: Record<string, any> = {};
    for (const key of allowed) {
      if (updates[key] !== undefined) safeUpdates[key] = updates[key];
    }

    if (safeUpdates.targetIndustries !== undefined && !Array.isArray(safeUpdates.targetIndustries)) {
      throw new HttpsError("invalid-argument", "targetIndustries must be an array.");
    }
    if (safeUpdates.targetStates !== undefined && !Array.isArray(safeUpdates.targetStates)) {
      throw new HttpsError("invalid-argument", "targetStates must be an array.");
    }

    if (safeUpdates.leadsPerDay !== undefined) {
      const val = Number(safeUpdates.leadsPerDay);
      if (!Number.isInteger(val) || val < 1 || val > 100) {
        throw new HttpsError("invalid-argument", "Leads per day must be between 1 and 100.");
      }
      safeUpdates.leadsPerDay = val;
    }

    if (safeUpdates.enabled === true) {
      safeUpdates.consecutiveEmptyRuns = 0;
    }

    safeUpdates.updatedAt = admin.firestore.FieldValue.serverTimestamp();

    const configRef = db().doc("sales-auto-research/config");
    const snap = await configRef.get();

    if (!snap.exists) {
      await configRef.set({
        enabled: false,
        leadsPerDay: 10,
        addMode: "just_add",
        sequenceTrackId: null,
        leadsAddedToday: 0,
        leadsAddedThisMonth: 0,
        monthlyCapReached: false,
        consecutiveEmptyRuns: 0,
        lastResetDate: new Date().toISOString().split("T")[0],
        lastResetMonth: new Date().toISOString().substring(0, 7),
        ...safeUpdates,
      });
    } else {
      await configRef.update(safeUpdates);
    }

    return { success: true };
  }
);

// ── Per-Session Auto-Research ─────────────────────────────────────────────────

export const createAgentSession = onCall(
  { secrets: [] },
  async (request) => {
    const uid = await requireDev(request);
    const actor = await getActorInfo(uid);
    const config = request.data as Record<string, any>;

    const now = admin.firestore.FieldValue.serverTimestamp();
    const sessionDoc = await db().collection("sales-research-sessions").add({
      title: "Ulysses session",
      messages: [],
      leadsGenerated: [],
      createdAt: now,
      updatedAt: now,
      createdBy: actor.uid,
      agentRun: true,
      autoResearch: {
        enabled: false,
        leadsPerDay: config.leadsPerDay || 10,
        addMode: config.addMode || "agent",
        sequenceTrackId: config.sequenceTrackId || null,
        targetIndustries: [],
        targetStates: [],
        targetCompanySize: "",
        leadsAddedToday: 0,
        leadsAddedThisMonth: 0,
        monthlyCapReached: false,
        consecutiveEmptyRuns: 0,
        lastResetDate: new Date().toISOString().split("T")[0],
        lastResetMonth: new Date().toISOString().substring(0, 7),
      },
    });

    return { sessionId: sessionDoc.id };
  }
);

export const updateSessionAutoResearch = onCall(
  { secrets: [] },
  async (request) => {
    await requireDev(request);
    const { sessionId, ...updates } = request.data as Record<string, any>;

    if (!sessionId) throw new HttpsError("invalid-argument", "Session ID is required.");

    const sessionRef = db().doc(`sales-research-sessions/${sessionId}`);
    const sessionSnap = await sessionRef.get();
    if (!sessionSnap.exists) throw new HttpsError("not-found", "Session not found.");

    const sessionData = sessionSnap.data()!;
    const isConversion = !sessionData.agentRun;

    const allowed = ["enabled", "leadsPerDay", "addMode", "sequenceTrackId", "targetIndustries", "targetStates", "targetCompanySize"];
    const safeUpdates: Record<string, any> = {};
    for (const key of allowed) {
      if (updates[key] !== undefined) safeUpdates[key] = updates[key];
    }

    if (safeUpdates.leadsPerDay !== undefined) {
      safeUpdates.leadsPerDay = Math.max(1, Math.min(100, Math.floor(Number(safeUpdates.leadsPerDay))));
    }

    if (safeUpdates.enabled === true) {
      safeUpdates.consecutiveEmptyRuns = 0;
      safeUpdates.disabledReason = admin.firestore.FieldValue.delete();
      safeUpdates.disabledAt = admin.firestore.FieldValue.delete();
    }

    const prefixed: Record<string, any> = {};

    if (isConversion) {
      prefixed.agentRun = true;
      const defaults: Record<string, any> = {
        enabled: false,
        leadsPerDay: 10,
        addMode: "agent",
        sequenceTrackId: null,
        targetIndustries: [],
        targetStates: [],
        targetCompanySize: "",
        leadsAddedToday: 0,
        leadsAddedThisMonth: 0,
        monthlyCapReached: false,
        consecutiveEmptyRuns: 0,
        lastResetDate: new Date().toISOString().split("T")[0],
        lastResetMonth: new Date().toISOString().substring(0, 7),
      };
      for (const [key, value] of Object.entries(defaults)) {
        prefixed[`autoResearch.${key}`] = value;
      }
    }

    for (const [key, value] of Object.entries(safeUpdates)) {
      prefixed[`autoResearch.${key}`] = value;
    }
    prefixed.updatedAt = admin.firestore.FieldValue.serverTimestamp();

    await sessionRef.update(prefixed);

    return { success: true };
  }
);

// ── Auto-Research Cron ────────────────────────────────────────────────────────

const AUTO_RESEARCH_PROMPT = `Find 10 new leads that match the ideal customer profile. Focus on different industries and locations to maximize coverage. Return businesses that are likely to need OSHA compliance help. Prioritize leads with valid email addresses and websites. Search broadly across construction, roofing, HVAC, plumbing, electrical, manufacturing, warehousing, landscaping, auto repair, welding/fabrication, and general contracting companies in different US states.`;

const AUTO_RESEARCH_MAX_LEADS_PER_DAY = 100;
const AUTO_RESEARCH_MAX_LEADS_PER_MONTH = 2000;
const AUTO_RESEARCH_MAX_CONSECUTIVE_EMPTY_RUNS = 5;

export const processAutoResearch = onSchedule(
  {
    schedule: "0 */2 * * *",
    secrets: [xaiApiKey, googlePlacesApiKey, bouncerApiKey, sendgridApiKey],
    timeoutSeconds: 540,
    memory: "1GiB",
  },
  async () => {
    try {

    const activeSessions = await db()
      .collection("sales-research-sessions")
      .where("autoResearch.enabled", "==", true)
      .get();

    if (activeSessions.empty) {
      console.log("Auto-research: no active sessions");
      return;
    }

    console.log(`Auto-research: processing ${activeSessions.size} active session(s)`);

    const existingLeads = await db().collection("sales-leads")
      .select("businessNameLower", "email", "industry", "state", "city", "status", "source")
      .get();
    const existingNames = new Set<string>();
    const existingEmails = new Set<string>();
    const industrySuccessCount: Record<string, number> = {};
    const stateSuccessCount: Record<string, number> = {};
    const progressedStatuses = new Set(["contacted", "qualified", "proposal", "negotiation", "won"]);

    for (const d of existingLeads.docs) {
      const data = d.data();
      if (data.businessNameLower) existingNames.add(data.businessNameLower);
      if (data.email) existingEmails.add(data.email.toLowerCase());
      if (progressedStatuses.has(data.status)) {
        const ind = data.industry?.trim();
        const st = data.state?.trim();
        if (ind) industrySuccessCount[ind] = (industrySuccessCount[ind] || 0) + 1;
        if (st) stateSuccessCount[st] = (stateSuccessCount[st] || 0) + 1;
      }
    }

    const topIndustries = Object.entries(industrySuccessCount)
      .sort((a, b) => b[1] - a[1]).slice(0, 5)
      .map(([ind, count]) => `${ind} (${count} progressed)`);
    const topStates = Object.entries(stateSuccessCount)
      .sort((a, b) => b[1] - a[1]).slice(0, 5)
      .map(([st, count]) => `${st} (${count} progressed)`);

    let pipelineLearning = "";
    if (topIndustries.length > 0 || topStates.length > 0) {
      const parts: string[] = [];
      if (topIndustries.length > 0) parts.push(`Top performing industries: ${topIndustries.join(", ")}`);
      if (topStates.length > 0) parts.push(`Top performing states: ${topStates.join(", ")}`);
      pipelineLearning = parts.join(". ");
    }

    let agentLearningsContext = "";
    const learningsSnap = await db().collection("sales-agent-learnings").orderBy("createdAt", "desc").limit(1).get();
    if (!learningsSnap.empty) {
      const learning = learningsSnap.docs[0].data();
      const lParts: string[] = [];
      if (learning.emailReplyRate != null) lParts.push(`Email reply rate: ${(learning.emailReplyRate * 100).toFixed(0)}%`);
      if (learning.topReplyIndustries?.length) lParts.push(`Best email reply industries: ${learning.topReplyIndustries.join(", ")}`);
      if (learning.topReplyStates?.length) lParts.push(`Best email reply states: ${learning.topReplyStates.join(", ")}`);
      if (learning.avoidPatterns?.length) lParts.push(`Avoid: ${learning.avoidPatterns.join("; ")}`);
      if (learning.successPatterns?.length) lParts.push(`What works: ${learning.successPatterns.join("; ")}`);
      if (lParts.length > 0) agentLearningsContext = lParts.join(". ") + ".";
    }

    let pastEmails: Array<{ subject: string; bodyHtml: string; recipientBusiness: string }> = [];
    const historySnap = await db().collection("sales-email-history").orderBy("sentAt", "desc").limit(15).get();
    pastEmails = historySnap.docs.map((d) => {
      const data = d.data();
      return { subject: data.subject || "", bodyHtml: data.bodyHtml || "", recipientBusiness: data.recipientBusiness || "" };
    });

    for (const sessionDoc of activeSessions.docs) {
      const sessionRef = db().doc(`sales-research-sessions/${sessionDoc.id}`);
      const config = sessionDoc.data().autoResearch || {};

      const consecutiveEmpty = config.consecutiveEmptyRuns || 0;
      if (consecutiveEmpty >= AUTO_RESEARCH_MAX_CONSECUTIVE_EMPTY_RUNS) {
        await sessionRef.update({
          "autoResearch.enabled": false,
          "autoResearch.disabledReason": `Auto-disabled: ${consecutiveEmpty} consecutive empty runs`,
          "autoResearch.disabledAt": admin.firestore.FieldValue.serverTimestamp(),
        });
        console.warn(`Session ${sessionDoc.id}: auto-disabled after ${consecutiveEmpty} empty runs`);
        continue;
      }

      const now = new Date();
      const today = now.toISOString().split("T")[0];
      const thisMonth = now.toISOString().substring(0, 7);
      let leadsAddedToday = config.leadsAddedToday || 0;
      let leadsAddedThisMonth = config.leadsAddedThisMonth || 0;
      const leadsPerDay = Math.min(config.leadsPerDay || 10, AUTO_RESEARCH_MAX_LEADS_PER_DAY);
      const addMode = config.addMode || "agent";
      const sequenceTrackId = config.sequenceTrackId || null;

      if (config.lastResetMonth !== thisMonth) {
        leadsAddedThisMonth = 0;
        await sessionRef.update({
          "autoResearch.leadsAddedThisMonth": 0,
          "autoResearch.lastResetMonth": thisMonth,
          "autoResearch.monthlyCapReached": false,
        });
      }

      if (leadsAddedThisMonth >= AUTO_RESEARCH_MAX_LEADS_PER_MONTH) {
        if (!config.monthlyCapReached) {
          await sessionRef.update({ "autoResearch.monthlyCapReached": true });
        }
        continue;
      }

      if (config.lastResetDate !== today) {
        leadsAddedToday = 0;
        await sessionRef.update({ "autoResearch.leadsAddedToday": 0, "autoResearch.lastResetDate": today });
      }

      if (leadsAddedToday >= leadsPerDay) continue;

      const remaining = Math.min(leadsPerDay - leadsAddedToday, AUTO_RESEARCH_MAX_LEADS_PER_MONTH - leadsAddedThisMonth);
      const batchSize = Math.min(remaining, 10);

      console.log(`Session ${sessionDoc.id}: ${leadsAddedToday}/${leadsPerDay} today, fetching batch of ${batchSize}`);

      const targetIndustries: string[] = config.targetIndustries || [];
      const targetStates: string[] = config.targetStates || [];
      const targetCompanySize: string = config.targetCompanySize || "";

      const promptParts: string[] = [];

      const sessionMessages = sessionDoc.data().messages || [];
      if (sessionMessages.length > 0) {
        const recentMsgs = sessionMessages.slice(-10);
        const userQueries = recentMsgs
          .filter((m: any) => m.role === "user" && m.content && !m.content.startsWith("Auto-research run:"))
          .map((m: any) => m.content)
          .slice(-5);
        const pastLeadNames = recentMsgs
          .filter((m: any) => m.leadsFound?.length)
          .flatMap((m: any) => m.leadsFound.map((l: any) => l.businessName))
          .slice(-30);

        if (userQueries.length > 0) {
          promptParts.push(`SESSION CONTEXT (continue this research thread):\nPrevious queries: ${userQueries.join(" | ")}\nFind MORE leads similar to what was already researched. Don't repeat the same businesses.`);
        }
        if (pastLeadNames.length > 0) {
          promptParts.push(`ALREADY FOUND (do NOT return these): ${pastLeadNames.join(", ")}.`);
        }
      }

      if (targetIndustries.length > 0) promptParts.push(`FOCUS on these industries: ${targetIndustries.join(", ")}.`);
      if (targetStates.length > 0) promptParts.push(`FOCUS on these states: ${targetStates.join(", ")}.`);
      if (targetCompanySize) promptParts.push(`Target companies with ${targetCompanySize} employees.`);
      if (pipelineLearning) promptParts.push(`PIPELINE INTELLIGENCE: ${pipelineLearning}. Weight your search toward similar profiles.`);
      promptParts.push(`Return exactly ${batchSize} leads.`);

      const dynamicPrompt = `${AUTO_RESEARCH_PROMPT}\n\n${promptParts.join("\n")}`;

      let leads: any[] = [];
      let reply = "";
      let agentApiCalls = 0;

      try {
        const response = await fetch("https://api.x.ai/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.XAI_API_KEY}`,
          },
          body: JSON.stringify({
            model: "grok-3-fast",
            messages: [
              { role: "system", content: RESEARCH_SYSTEM_PROMPT },
              { role: "user", content: dynamicPrompt },
            ],
            temperature: 0.8,
            max_tokens: 8000,
            search: true,
          }),
        });
        agentApiCalls++;

        if (!response.ok) {
          console.error(`Session ${sessionDoc.id}: API error`, await response.text());
          continue;
        }

        const grokResponse: any = await response.json();
        const rawContent = grokResponse.choices?.[0]?.message?.content || "";

        const tryParse = (text: string): boolean => {
          try {
            const parsed = JSON.parse(text);
            if (parsed && typeof parsed === "object") {
              reply = parsed.reply || "";
              leads = Array.isArray(parsed.leads) ? parsed.leads : [];
              return true;
            }
          } catch {}
          return false;
        };

        const cleaned = rawContent.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
        if (!tryParse(cleaned)) {
          const braceStart = rawContent.indexOf("{");
          const braceEnd = rawContent.lastIndexOf("}");
          if (braceStart !== -1 && braceEnd > braceStart) {
            tryParse(rawContent.substring(braceStart, braceEnd + 1));
          }
        }
      } catch (err) {
        console.error(`Session ${sessionDoc.id}: fetch error`, err);
        continue;
      }

      if (leads.length === 0) {
        await sessionRef.update({
          "autoResearch.consecutiveEmptyRuns": consecutiveEmpty + 1,
          messages: admin.firestore.FieldValue.arrayUnion(
            { role: "user", content: `Researching ${batchSize} leads${targetIndustries.length ? ` in ${targetIndustries.join(", ")}` : ""}${targetStates.length ? ` from ${targetStates.join(", ")}` : ""}` },
            { role: "assistant", content: reply || "Came up empty on this search. Will try a different angle next run." }
          ),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        continue;
      }

      // Write the search query + research reasoning to the session immediately
      const searchQueryMsg = { role: "user", content: `Researching ${batchSize} leads${targetIndustries.length ? ` in ${targetIndustries.join(", ")}` : ""}${targetStates.length ? ` from ${targetStates.join(", ")}` : ""}` };
      const researchReplyMsg = { role: "assistant", content: `${reply || `Pulled ${leads.length} potential leads.`}\n\nValidating emails, websites, and Google Places for ${leads.length} leads...` };
      await sessionRef.update({
        messages: admin.firestore.FieldValue.arrayUnion(searchQueryMsg, researchReplyMsg),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      leads = await validateLeadsWithPlacesAPI(leads);
      leads = await enrichLeadsFromWebsites(leads);
      leads = await checkWebsiteLiveness(leads);
      leads = await verifyEmailsWithBouncer(leads);
      leads = recalculateConfidence(leads);

      const disqualifyReasons: string[] = [];
      const qualifiedLeads = leads.filter((lead: any) => {
        if (!lead.businessName?.trim()) { disqualifyReasons.push(`${lead.businessName || "Unknown"}: no business name`); return false; }
        const hasEmail = lead.email?.trim() && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lead.email.trim());
        const hasWebsite = !!lead.website?.trim();
        if (!hasEmail && !hasWebsite) { disqualifyReasons.push(`${lead.businessName}: no email or website`); return false; }
        if (lead.verificationSignals?.emailVerification?.status === "invalid" ||
            lead.verificationSignals?.emailVerification?.status === "undeliverable") { disqualifyReasons.push(`${lead.businessName}: invalid email`); return false; }
        const normalizedName = lead.businessName.trim().toLowerCase();
        if (existingNames.has(normalizedName)) { disqualifyReasons.push(`${lead.businessName}: already in pipeline`); return false; }
        if (hasEmail && existingEmails.has(lead.email.trim().toLowerCase())) { disqualifyReasons.push(`${lead.businessName}: duplicate email`); return false; }
        if (lead.confidence != null && lead.confidence < 40) { disqualifyReasons.push(`${lead.businessName}: low confidence (${lead.confidence})`); return false; }
        return true;
      });

      // Write validation results
      const validationLines: string[] = [`Validation complete: ${qualifiedLeads.length} of ${leads.length} passed.`];
      if (disqualifyReasons.length > 0) {
        validationLines.push(`Filtered out: ${disqualifyReasons.join(", ")}.`);
      }
      if (qualifiedLeads.length > 0) {
        validationLines.push(`Processing ${qualifiedLeads.length} qualified leads now...`);
      }
      await sessionRef.update({
        messages: admin.firestore.FieldValue.arrayUnion({ role: "assistant", content: validationLines.join("\n") }),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      let added = 0;
      const areasSearched: string[] = [];
      const agentActions: Array<{ leadId: string; businessName: string; action: string; reason: string; emailSubject?: string }> = [];
      const processedLeads: any[] = [];

      for (const lead of qualifiedLeads) {
        if (leadsAddedToday + added >= leadsPerDay) break;

        try {
          const normalizedBiz = lead.businessName.trim().toLowerCase();
          const normalizedEmail = lead.email?.trim().toLowerCase() || null;

          const dupeCheck = await db().collection("sales-leads").where("businessNameLower", "==", normalizedBiz).limit(1).get();
          if (!dupeCheck.empty) continue;

          if (normalizedEmail) {
            const emailDupe = await db().collection("sales-leads").where("email", "==", normalizedEmail).limit(1).get();
            if (!emailDupe.empty) continue;
          }

          const ts = admin.firestore.FieldValue.serverTimestamp();

          let agentDecision: { action: string; reason: string } = { action: "just_add", reason: "Default" };
          if (addMode === "agent" && normalizedEmail) {
            try {
              const decisionPrompt = `You are Ulysses, an autonomous sales chimp for ComplianceChimp (OSHA compliance platform). Given a lead, decide the single best first action.

LEAD:
- Business: ${lead.businessName}
- Contact: ${lead.contactName || "unknown"}
- Industry: ${lead.industry || "unknown"}
- Location: ${lead.city || ""}, ${lead.state || ""}
- Employee estimate: ${lead.employeeEstimate || "unknown"}
- Best contact method: ${lead.bestContactMethod || "email"}
- Confidence score: ${lead.confidence || "N/A"}
- Has email: ${!!normalizedEmail}
- Has phone: ${!!lead.phone}
- Has website: ${!!lead.website}

${agentLearningsContext ? `SELF-LEARNING CONTEXT:\n${agentLearningsContext}\n` : ""}
OPTIONS:
1. "send_email" - Generate and send a personalized cold outreach email.
2. "flag_for_call" - Flag for a phone call.
3. "compliance_report" - Generate and send a free OSHA compliance assessment.
4. "just_add" - Add without contact.

Return JSON only: { "action": "...", "reason": "one sentence why" }`;

              const decisionRes = await fetch("https://api.x.ai/v1/chat/completions", {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.XAI_API_KEY}` },
                body: JSON.stringify({ model: "grok-3-fast", messages: [{ role: "user", content: decisionPrompt }], temperature: 0.3, max_tokens: 200 }),
              });
              agentApiCalls++;

              if (decisionRes.ok) {
                const dj: any = await decisionRes.json();
                const raw = dj.choices?.[0]?.message?.content || "";
                try {
                  const parsed = JSON.parse(raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim());
                  if (parsed.action && ["send_email", "flag_for_call", "compliance_report", "just_add"].includes(parsed.action)) {
                    agentDecision = { action: parsed.action, reason: parsed.reason || "" };
                  }
                } catch { /* default */ }
              }
            } catch (err) { console.error("Ulysses decision error:", err); }
          } else if (addMode === "agent" && !normalizedEmail) {
            agentDecision = { action: lead.phone ? "flag_for_call" : "just_add", reason: "No email available" };
          }

          const effectiveAction = addMode === "agent" ? agentDecision.action : addMode;
          const skipConsultation = effectiveAction !== "compliance_report";

          const leadDoc = await db().collection("sales-leads").add({
            contactName: lead.contactName?.trim() || null,
            email: normalizedEmail,
            phone: lead.phone?.trim() || null,
            businessName: lead.businessName.trim(),
            businessNameLower: normalizedBiz,
            website: lead.website?.trim() || null,
            industry: lead.industry?.trim() || null,
            state: lead.state?.trim() || null,
            city: lead.city?.trim() || null,
            source: addMode === "agent" ? "ulysses" : "auto_research",
            employeeEstimate: lead.employeeEstimate?.trim() || null,
            yearEstablished: lead.yearEstablished?.trim() || null,
            fitReason: lead.fitReason?.trim() || null,
            bestContactMethod: lead.bestContactMethod?.trim() || null,
            googleMapsUrl: lead.googleMapsUrl?.trim() || null,
            verificationSignals: lead.verificationSignals || null,
            status: "new" as SalesLeadStatus,
            consultationStatus: skipConsultation ? null : normalizedEmail ? "pending" : null,
            nextFollowUp: null,
            createdAt: ts,
            updatedAt: ts,
            lastContactedAt: null,
            createdBy: addMode === "agent" ? "ulysses" : "auto_research",
            agentSessionId: sessionDoc.id,
          });

          await addActivity(leadDoc.id, "lead_created", `Lead found by Ulysses`, AGENT_ACTOR, "agent");

          let actionTaken = "added_only";
          let emailSubject: string | undefined;

          if (effectiveAction === "send_email" && normalizedEmail) {
            try {
              const emailSystemPrompt = buildEmailSystemPrompt(pastEmails);
              const emailUserMsg = `Write an outreach message to this lead:\n- Business: ${lead.businessName}\n- Contact: ${lead.contactName || "Business Owner"}\n- Industry: ${lead.industry || "unknown"}\n- Location: ${lead.city || ""}, ${lead.state || ""}\n- Best contact method: ${lead.bestContactMethod || "email"}\n- Website: ${lead.website || "none"}\n\nReturn JSON: { "subject": "...", "bodyHtml": "..." }`;

              const emailRes = await fetch("https://api.x.ai/v1/chat/completions", {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.XAI_API_KEY}` },
                body: JSON.stringify({ model: "grok-3-fast", messages: [{ role: "system", content: emailSystemPrompt }, { role: "user", content: emailUserMsg }], temperature: 0.7 }),
              });
              agentApiCalls++;

              if (emailRes.ok) {
                const ej: any = await emailRes.json();
                const rawEmail = ej.choices?.[0]?.message?.content || "";
                const parsedEmail = JSON.parse(rawEmail.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim());

                if (parsedEmail.subject && parsedEmail.bodyHtml) {
                  const nodemailer = require("nodemailer");
                  const sendgridTransport = require("nodemailer-sendgrid-transport");
                  const client = nodemailer.createTransport(sendgridTransport({ auth: { api_key: process.env.SENDGRID_API_KEY } }));

                  await client.sendMail({
                    from: '"Ryan at ComplianceChimp" <support@compliancechimp.com>',
                    replyTo: `reply+${leadDoc.id}@reply.compliancechimp.com`,
                    to: normalizedEmail,
                    subject: parsedEmail.subject,
                    html: parsedEmail.bodyHtml,
                  });

                  emailSubject = parsedEmail.subject;
                  actionTaken = "email_sent";

                  await addActivity(leadDoc.id, "email_sent", parsedEmail.bodyHtml, AGENT_ACTOR, "agent", { emailSubject: parsedEmail.subject, emailHtml: parsedEmail.bodyHtml });
                  await db().collection("sales-email-history").add({ subject: parsedEmail.subject, bodyHtml: parsedEmail.bodyHtml, leadId: leadDoc.id, recipientName: lead.contactName || "", recipientBusiness: lead.businessName, industry: lead.industry || "", sentAt: ts, sentBy: "ulysses" });
                  await db().doc(`sales-leads/${leadDoc.id}`).update({ status: "contacted", lastContactedAt: ts });
                }
              }
            } catch (emailErr) { console.error(`Email failed for ${lead.businessName}:`, emailErr); }
          } else if (effectiveAction === "flag_for_call") {
            actionTaken = "flagged_for_call";
            await addActivity(leadDoc.id, "note", `Ulysses flagged for phone call: ${agentDecision.reason}`, AGENT_ACTOR, "agent");
            await db().doc(`sales-leads/${leadDoc.id}`).update({ "flow.recommendedAction": "call", "flow.actionReason": agentDecision.reason, "flow.priority": "high", "flow.analyzedAt": ts });
          } else if (effectiveAction === "compliance_report") {
            actionTaken = "compliance_report";
          } else if (effectiveAction === "sequence" && sequenceTrackId) {
            try {
              const trackDoc = await db().doc(`sales-sequence-tracks/${sequenceTrackId}`).get();
              if (trackDoc.exists) {
                const track = trackDoc.data()!;
                if (track.steps?.length) {
                  const firstStep = track.steps[0];
                  const immediateStart = !firstStep.delayDays || firstStep.delayDays === 0;
                  const leadData = (await db().doc(`sales-leads/${leadDoc.id}`).get()).data()!;
                  if (immediateStart) {
                    await db().doc(`sales-leads/${leadDoc.id}`).update({ sequenceTrackId, sequenceCurrentStep: 0, sequenceStartedAt: ts, sequenceNextActionAt: admin.firestore.Timestamp.now(), sequenceStatus: "active", "flow.recommendedAction": "close", "flow.actionReason": "Managed by sequence.", "flow.priority": "low", "flow.analyzedAt": ts, updatedAt: ts });
                    await executeSequenceStep(leadDoc.id, leadData, track, 0);
                  } else {
                    const nextActionAt = new Date(Date.now() + firstStep.delayDays * 86400000);
                    await db().doc(`sales-leads/${leadDoc.id}`).update({ sequenceTrackId, sequenceCurrentStep: 0, sequenceStartedAt: ts, sequenceNextActionAt: admin.firestore.Timestamp.fromDate(nextActionAt), sequenceStatus: "active", "flow.recommendedAction": "close", "flow.actionReason": "Managed by sequence.", "flow.priority": "low", "flow.analyzedAt": ts, updatedAt: ts });
                  }
                  actionTaken = "sequence_started";
                }
              }
            } catch (seqErr) { console.error(`Sequence start failed for ${leadDoc.id}:`, seqErr); }
          }

          const thisAction = { leadId: leadDoc.id, businessName: lead.businessName.trim(), action: actionTaken, reason: agentDecision.reason, ...(emailSubject ? { emailSubject } : {}) };
          agentActions.push(thisAction);
          processedLeads.push(lead);

          added++;
          const area = [lead.city, lead.state].filter(Boolean).join(", ");
          if (area && !areasSearched.includes(area)) areasSearched.push(area);

          existingNames.add(normalizedBiz);
          if (normalizedEmail) existingEmails.add(normalizedEmail);

          // Build a per-lead reasoning message
          const actionLabels: Record<string, string> = { email_sent: "Sent email", flagged_for_call: "Flagged for call", compliance_report: "Sending compliance report", sequence_started: "Added to sequence", added_only: "Added to pipeline" };
          const leadLocation = [lead.city, lead.state].filter(Boolean).join(", ");
          const leadDetailParts = [`**${lead.businessName}**${leadLocation ? ` (${leadLocation})` : ""}`];
          if (lead.industry) leadDetailParts.push(`Industry: ${lead.industry}`);
          if (lead.employeeEstimate) leadDetailParts.push(`Size: ~${lead.employeeEstimate} employees`);
          if (lead.confidence != null) leadDetailParts.push(`Confidence: ${lead.confidence}%`);
          leadDetailParts.push(`Decision: ${actionLabels[actionTaken] || actionTaken}`);
          if (agentDecision.reason && agentDecision.reason !== "Default") leadDetailParts.push(`Reasoning: ${agentDecision.reason}`);
          if (emailSubject) leadDetailParts.push(`Email subject: "${emailSubject}"`);

          // Update session counters and append reasoning message
          await sessionRef.update({
            "autoResearch.leadsAddedToday": admin.firestore.FieldValue.increment(1),
            "autoResearch.leadsAddedThisMonth": admin.firestore.FieldValue.increment(1),
            "autoResearch.lastRunAt": admin.firestore.FieldValue.serverTimestamp(),
            "autoResearch.consecutiveEmptyRuns": 0,
            leadsGenerated: admin.firestore.FieldValue.arrayUnion(leadDoc.id),
            agentActions: admin.firestore.FieldValue.arrayUnion(thisAction),
            messages: admin.firestore.FieldValue.arrayUnion({ role: "assistant", content: leadDetailParts.join("\n") }),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });

          console.log(`Session ${sessionDoc.id}: added "${lead.businessName}" (${actionTaken}), ${leadsAddedToday + added}/${leadsPerDay} today`);
        } catch (err: any) {
          if (err?.code === 6) continue;
          console.error(`Failed to add lead "${lead.businessName}":`, err);
        }
      }

      // Append the summary message with all leads found
      const sessionLeads = processedLeads.map((l: any) => ({
        businessName: l.businessName?.trim() || "",
        contactName: l.contactName?.trim() || null,
        email: l.email?.trim() || null,
        phone: l.phone?.trim() || null,
        website: l.website?.trim() || null,
        industry: l.industry?.trim() || null,
        state: l.state?.trim() || null,
        city: l.city?.trim() || null,
        employeeEstimate: l.employeeEstimate?.trim() || null,
        yearEstablished: l.yearEstablished?.trim() || null,
        fitReason: l.fitReason?.trim() || null,
        bestContactMethod: l.bestContactMethod?.trim() || null,
        googleMapsUrl: l.googleMapsUrl?.trim() || null,
        verificationSignals: l.verificationSignals || null,
        confidence: l.confidence ?? null,
      }));

      const actionSummary = agentActions.reduce((acc: Record<string, number>, a) => {
        acc[a.action] = (acc[a.action] || 0) + 1;
        return acc;
      }, {});
      const summaryParts = Object.entries(actionSummary).map(([action, count]) => {
        const label: Record<string, string> = { email_sent: "emails sent", flagged_for_call: "flagged for call", compliance_report: "compliance reports", sequence_started: "sequences started", added_only: "added without contact" };
        return `${count} ${label[action] || action}`;
      });

      const assistantContent = added > 0
        ? `Run complete. Added ${added} leads to the pipeline. ${summaryParts.join(", ")}. Today: ${leadsAddedToday + added}/${leadsPerDay}.`
        : `Searched but found no qualifying leads this run.`;

      const summaryMsg = { role: "assistant", content: assistantContent, leadsFound: added > 0 ? sessionLeads : [] };
      try {
        await sessionRef.update({
          messages: admin.firestore.FieldValue.arrayUnion(summaryMsg),
          agentLearnings: agentLearningsContext || null,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      } catch (msgErr) {
        console.error(`Session ${sessionDoc.id}: failed to write summary message`, msgErr);
      }

      if (added === 0) {
        await sessionRef.update({ "autoResearch.consecutiveEmptyRuns": consecutiveEmpty + 1 });
      }

      if (added > 0 && !sessionDoc.data().title?.startsWith("Ulysses")) {
        const title = `Ulysses: ${(leadsAddedToday + added)} leads (${summaryParts.join(", ")})`;
        await sessionRef.update({ title });
      }

      await db().collection("sales-auto-research-log").add({
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        sessionId: sessionDoc.id,
        leadsFound: leads.length,
        leadsQualified: qualifiedLeads.length,
        leadsAdded: added,
        areasSearched,
        addMode,
        agentActions,
        pipelineLearning: pipelineLearning || null,
        targeting: { industries: targetIndustries.length > 0 ? targetIndustries : null, states: targetStates.length > 0 ? targetStates : null, companySize: targetCompanySize || null },
        apiCalls: { grok: agentApiCalls, googlePlaces: leads.length, bouncer: leads.filter((l: any) => l.email?.trim()).length, websiteChecks: leads.filter((l: any) => l.website?.trim()).length },
      });

      console.log(`Session ${sessionDoc.id}: ${added} leads added (today: ${leadsAddedToday + added}/${leadsPerDay})`);
    }

    } catch (fatalErr: any) {
      console.error("processAutoResearch fatal error:", fatalErr?.message || String(fatalErr));
      throw fatalErr;
    }
    // #endregion
  }
);

// ── Agent Outcome Tracking & Self-Learning ──────────────────────────────────

export const trackAgentOutcomes = onSchedule(
  {
    schedule: "0 6 * * *",
    timeoutSeconds: 120,
    memory: "512MiB",
  },
  async () => {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000);

    const agentLeads = await db()
      .collection("sales-leads")
      .where("createdBy", "in", ["agent", "ulysses", "auto_research"])
      .where("createdAt", ">=", admin.firestore.Timestamp.fromDate(thirtyDaysAgo))
      .get();

    if (agentLeads.empty) return;

    let totalEmailed = 0;
    let totalReplied = 0;
    let totalProgressed = 0;
    let totalArchived = 0;
    const industryReplies: Record<string, { sent: number; replied: number }> = {};
    const stateReplies: Record<string, { sent: number; replied: number }> = {};
    const industryProgressions: Record<string, number> = {};
    const archivedReasons: string[] = [];
    const progressedStatuses = new Set(["contacted", "qualified", "proposal", "negotiation", "won"]);

    for (const doc of agentLeads.docs) {
      const lead = doc.data();
      const industry = lead.industry?.trim() || "unknown";
      const state = lead.state?.trim() || "unknown";

      const activitySnap = await db()
        .collection(`sales-leads/${doc.id}/activity`)
        .orderBy("createdAt", "desc")
        .limit(20)
        .get();

      const hasSentEmail = activitySnap.docs.some((a) => a.data().type === "email_sent");
      const hasReply = activitySnap.docs.some((a) => a.data().type === "email_received");

      if (hasSentEmail) {
        totalEmailed++;
        if (!industryReplies[industry]) industryReplies[industry] = { sent: 0, replied: 0 };
        industryReplies[industry].sent++;
        if (!stateReplies[state]) stateReplies[state] = { sent: 0, replied: 0 };
        stateReplies[state].sent++;

        if (hasReply) {
          totalReplied++;
          industryReplies[industry].replied++;
          stateReplies[state].replied++;
        }
      }

      if (progressedStatuses.has(lead.status)) {
        totalProgressed++;
        industryProgressions[industry] = (industryProgressions[industry] || 0) + 1;
      }

      if (lead.archived) {
        totalArchived++;
        if (lead.fitReason) archivedReasons.push(`${industry}: ${lead.fitReason}`);
      }
    }

    const emailReplyRate = totalEmailed > 0 ? totalReplied / totalEmailed : 0;

    const topReplyIndustries = Object.entries(industryReplies)
      .filter(([, v]) => v.sent >= 2)
      .sort((a, b) => (b[1].replied / b[1].sent) - (a[1].replied / a[1].sent))
      .slice(0, 5)
      .map(([ind]) => ind);

    const topReplyStates = Object.entries(stateReplies)
      .filter(([, v]) => v.sent >= 2)
      .sort((a, b) => (b[1].replied / b[1].sent) - (a[1].replied / a[1].sent))
      .slice(0, 5)
      .map(([st]) => st);

    const worstIndustries = Object.entries(industryReplies)
      .filter(([, v]) => v.sent >= 3 && v.replied === 0)
      .map(([ind]) => ind);

    const successPatterns: string[] = [];
    if (topReplyIndustries.length > 0) {
      successPatterns.push(`${topReplyIndustries.join(", ")} industries respond well to email outreach`);
    }
    if (topReplyStates.length > 0) {
      successPatterns.push(`Leads in ${topReplyStates.join(", ")} have higher reply rates`);
    }

    const avoidPatterns: string[] = [];
    if (worstIndustries.length > 0) {
      avoidPatterns.push(`${worstIndustries.join(", ")} industries have 0% email reply rate, consider phone or compliance report instead`);
    }

    await db().collection("sales-agent-learnings").add({
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      periodDays: 30,
      totalLeads: agentLeads.size,
      totalEmailed,
      totalReplied,
      totalProgressed,
      totalArchived,
      emailReplyRate,
      topReplyIndustries,
      topReplyStates,
      industryReplies,
      stateReplies,
      industryProgressions,
      successPatterns,
      avoidPatterns,
    });

    console.log(
      `Agent outcomes tracked: ${agentLeads.size} leads, ` +
      `${totalEmailed} emailed, ${totalReplied} replied (${(emailReplyRate * 100).toFixed(1)}%), ` +
      `${totalProgressed} progressed, ${totalArchived} archived`
    );
  }
);
