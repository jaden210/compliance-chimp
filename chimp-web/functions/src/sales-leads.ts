import { onCall, onRequest, HttpsError } from "firebase-functions/v2/https";
import { onDocumentCreated, onDocumentUpdated } from "firebase-functions/v2/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { defineSecret } from "firebase-functions/params";
import * as admin from "firebase-admin";
import * as Busboy from "busboy";

const xaiApiKey = defineSecret("XAI_API_KEY");
const sendgridApiKey = defineSecret("SENDGRID_API_KEY");

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
  | "account_signup";

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
  verificationSignals?: VerificationSignals;
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
        verificationSignals: data.verificationSignals || null,
        status: "new" as SalesLeadStatus,
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

const RESEARCH_SYSTEM_PROMPT = `You are a lead research assistant for ComplianceChimp, an OSHA workplace safety and compliance platform ($99/month, 14-day free trial). Your job is to find small-to-mid-size businesses that need OSHA compliance help but are too small to have a dedicated safety department.

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
        "hasGoogleListing": true,
        "googlePlaceId": "ChIJ...",
        "hasReviews": true,
        "recentReviews": true,
        "hasWebsite": true,
        "hasSocialMedia": false,
        "hasPhone": true,
        "lastActivityIndicator": "Reviews from 2 months ago"
      }
    }
  ]
}

SORT leads by confidence score, highest first.

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
For each lead, you MUST fill in verificationSignals:
- hasGoogleListing: Did you find them on Google Maps / Google Business?
- googlePlaceId: The Google Place ID, which always starts with "ChIJ" followed by alphanumeric characters (e.g. "ChIJN1t_tDeuEmsRUsoyG83frY4"). Do NOT use coordinates, hex values (0x...), CIDs, or any other format. If you cannot find a real Place ID that starts with "ChIJ", leave this as an empty string. Do not fabricate Place IDs.
- hasReviews: Do they have any reviews on Google, Yelp, or similar?
- recentReviews: Do they have reviews from the last 12 months?
- hasWebsite: Do they have a working website (not just a Facebook page)?
- hasSocialMedia: Do they have an active Facebook, Instagram, or LinkedIn page?
- hasPhone: Did you find a phone number?
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
- The "leads" array can be empty if the user is just asking questions or you don't have concrete leads yet.
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

export const salesLeadResearch = onCall(
  {
    secrets: [xaiApiKey],
    timeoutSeconds: 120,
    memory: "512MiB",
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
        max_tokens: 4000,
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

    try {
      const cleaned = rawContent.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      const parsed = JSON.parse(cleaned);
      reply = parsed.reply || rawContent;
      leads = Array.isArray(parsed.leads) ? parsed.leads : [];
    } catch {
      // JSON.parse on the full string failed. The AI may have put text before/after the JSON.
      // Try to find a JSON object containing "reply" somewhere in the response.
      const jsonMatch = rawContent.match(/\{[\s\S]*"reply"\s*:\s*"[\s\S]*\}/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0]);
          reply = parsed.reply || rawContent;
          leads = Array.isArray(parsed.leads) ? parsed.leads : [];
        } catch {
          // Still can't parse, use raw text stripped of any JSON-looking content
          reply = rawContent.replace(/\{[\s\S]*"reply"\s*:[\s\S]*\}/, "").trim() || rawContent;
        }
      }
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

    const mailOptions: any = {
      from: '"Ryan at ComplianceChimp" <support@compliancechimp.com>',
      replyTo: `reply+${leadId}@reply.compliancechimp.com`,
      to: lead.email,
      subject,
      html: bodyHtml,
    };

    if (inReplyTo) {
      mailOptions.inReplyTo = inReplyTo;
      mailOptions.references = inReplyTo;
    }

    const info = await client.sendMail(mailOptions);
    const sentMessageId = info?.messageId || null;

    const now = admin.firestore.FieldValue.serverTimestamp();
    await addActivity(leadId, "email_sent", bodyHtml, actor, "user", {
      emailSubject: subject,
      emailHtml: bodyHtml,
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

3. CONSULTATION REPORT ENGAGEMENT: If a free safety consultation was sent, this is critical data.
   - If they have NOT viewed the report yet: the follow-up should nudge them to open it. Reference specific findings from their report (importance score, key hazards, top requirements).
   - If they HAVE viewed the report: this is a strong engagement signal. Priority goes UP. The follow-up should reference that they looked at it, ask what stood out, and position ComplianceChimp as the tool that handles those requirements automatically.
   - If they viewed the report AND clicked the CTA: very high priority. They're interested. Call them.
   - If they viewed it multiple times (viewCount > 1): they're seriously considering it. Time-sensitive follow-up.
   - Reference specific findings from the consultation in your suggestedContent (importance score, specific OSHA standards cited, hazard categories flagged).

4. CONTENT GUIDANCE: What to say or reference.
   - If prior emails exist, reference something specific from them (don't repeat the same pitch).
   - If a call transcript exists, reference something discussed.
   - If a consultation report exists, reference specific findings from it.
   - Tie it to their industry and OSHA risks relevant to them.
   - If they have employees and no apparent safety program, that's the angle.

5. EXPIRED TRIAL LEADS: If the lead signed up but their free trial has expired without paying, this is a conversion opportunity.
   - They already used the product. They know what it does. Don't pitch from scratch.
   - Ask what held them back. Was it price? Did they not have time to set it up? Did they not see the value?
   - Reference specific things they would have experienced in the product (safety training assignments, inspection checklists, compliance tracking).
   - If they're a few days past expiration, a quick call is best. If it's been weeks, an email with a specific angle.
   - Priority should be "high" if trial expired within the last 7 days. "medium" if 7-21 days. "low" after 21 days.
   - If automated follow-up emails have already been sent, don't repeat the same messaging. Bring a new angle.

6. PRIORITY:
   - "high": new lead less than 48 hours old, lead that replied/engaged recently, lead that viewed their consultation report (especially if they clicked the CTA), OR lead whose trial expired within the last 7 days.
   - "medium": standard pipeline lead on a normal follow-up cadence, or trial expired 7-21 days ago.
   - "low": lead that's been contacted 4+ times with no engagement, or is in a cooling period, or trial expired 21+ days ago.

6. OWNERSHIP: The activity history includes "by {name}" for each action. Look at who has been doing the outreach for this lead, and recommend that same person continue (consistency matters in sales relationships). If multiple people have engaged, recommend the one with the most recent or most frequent contact.

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

    const viewChanged = after.viewCount !== before.viewCount;
    const journeyChanged =
      after.journey?.reportViewed !== before.journey?.reportViewed ||
      after.journey?.ctaClicked !== before.journey?.ctaClicked ||
      after.journey?.signupStarted !== before.journey?.signupStarted ||
      after.journey?.accountCreated !== before.journey?.accountCreated;

    if (!viewChanged && !journeyChanged) return;

    const consultationLeadId = after.leadId;
    if (!consultationLeadId) return;

    const salesLeadId = await findSalesLeadByConsultationLeadId(consultationLeadId);
    if (!salesLeadId) return;

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
