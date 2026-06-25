// Shared consultation email templates used by both index.ts (standalone follow-ups)
// and sales-leads.ts (sequence-driven follow-ups).

export const ULYSSES_FUN_FACTS: string[] = [
  "I had a banana for lunch. Unrelated, but worth mentioning.",
  "My therapist says I worry too much about fall protection. I say she doesn't worry enough.",
  "People ask why a chimp runs a compliance company. I ask why it took this long for one to step up.",
  "I type 40 words per minute. Impressive for someone who also uses his feet.",
  "I can bench press 600 pounds. Unrelated to compliance but I like to bring it up.",
  "Sometimes I just sit and think about PPE. That's not a joke. I genuinely do that.",
  "My team wanted casual Fridays. I reminded them that hard hats aren't optional. We compromised on Hawaiian hard hats.",
  "I once read the entire OSHA 1910 general industry standard. Cover to cover. On vacation.",
  "They say dress for the job you want. I want the job where everyone goes home safe. So, steel-toed banana peels.",
  "I started this company because I care about two things: safety and bananas. In that order. Usually.",
  "Technically I'm not licensed to give legal advice. Technically I'm also a chimp. Lots of technicalities.",
  "I was grooming earlier and found a citation under my fur. Just kidding. But I have found them in stranger places.",
];

export function getRandomUlyssesFunFact(): string {
  return ULYSSES_FUN_FACTS[Math.floor(Math.random() * ULYSSES_FUN_FACTS.length)];
}

export const CONSULTATION_LEAD_SENDERS = [
  '"ComplianceChimp" <support@compliancechimp.app>',
  '"ComplianceChimp" <support@compliancechimp.org>',
];

export const CHIMP_DEMO_VIDEO_URL = "https://www.youtube.com/watch?v=-CbdLuBbd1s";
export const CHIMP_DEMO_THUMBNAIL_URL = "https://img.youtube.com/vi/-CbdLuBbd1s/maxresdefault.jpg";

export function buildConsultationLeadEmailSubject(companyName: string): string {
  return `Your free safety consultation for ${companyName}`;
}

export function buildConsultationLeadEmailHtml(args: {
  companyName: string;
  assessment: any;
  publicUrl: string;
}): string {
  const { companyName, assessment, publicUrl } = args;
  const funFact = getRandomUlyssesFunFact();
  const nextActions = Array.isArray(assessment.nextActions)
    ? assessment.nextActions.slice(0, 3)
    : [];
  const nextActionsHtml = nextActions.length
    ? nextActions
        .map(
          (action: any) =>
            `<li style="margin:0 0 8px;"><strong>${action.title}</strong>: ${action.description}</li>`
        )
        .join("")
    : `<li style="margin:0;">Open the consultation to review your recommended next steps.</li>`;

  return `
    <div style="font-family:Arial,sans-serif;background:#f6f8fb;margin:0;padding:32px 16px;color:#1b1b1b;">
      <div style="max-width:680px;margin:0 auto;background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 10px 30px rgba(0,0,0,0.08);">
        <div style="background:linear-gradient(135deg,#054d8a 0%,#04355f 100%);padding:24px 32px;text-align:center;">
          <img src="https://compliancechimp.com/assets/complianceChimpLogoLight.png" alt="Compliance Chimp" style="height:40px;" />
        </div>
        <div style="padding:32px;">
          <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:24px;">
            <tr>
              <td style="width:140px;vertical-align:top;padding-right:20px;">
                <img src="https://compliancechimp.com/assets/chimp.png" alt="Ulysses" style="width:140px;height:auto;display:block;" />
              </td>
              <td style="vertical-align:top;">
                <h2 style="margin:0 0 6px;font-size:22px;color:#054d8a;">A New Era of Workplace Safety</h2>
                <p style="margin:0 0 10px;font-size:14px;color:#5b6470;line-height:1.5;">
                  I'm Ulysses, the world's first AI agent for workplace safety with a total mastery of OSHA.
                </p>
                <p style="margin:0;line-height:1.7;">
                  I help small businesses put together real safety programs. Training plans, inspections, compliance tracking, record keeping. The whole system, without the price tag of a full-time safety manager.
                </p>
              </td>
            </tr>
          </table>
          <p style="margin:0 0 24px;line-height:1.7;">
            I went ahead and ran <strong>${companyName}</strong> against current OSHA standards to see where you stand. Here is what I found.
          </p>
          <table cellpadding="0" cellspacing="0" border="0" width="100%" style="padding:20px;border-radius:16px;background:#f6f8fb;border:1px solid rgba(5,77,138,0.12);">
            <tr>
              <td style="vertical-align:middle;">
                <div style="font-size:12px;text-transform:uppercase;letter-spacing:0.08em;color:#5b6470;">Compliance urgency score</div>
                <div style="font-size:44px;font-weight:700;color:#054d8a;">${assessment.importanceScore}</div>
                <div style="font-size:16px;font-weight:700;color:#1b1b1b;">${assessment.importanceLevel}</div>
              </td>
              <td style="vertical-align:middle;text-align:right;">
                <a href="${publicUrl}" style="display:inline-block;padding:14px 22px;border-radius:999px;background:#ff9100;color:#ffffff;text-decoration:none;font-weight:700;line-height:1;">Open My Consultation</a>
              </td>
            </tr>
          </table>
          <div style="margin-top:24px;">
            <h2 style="margin:0 0 12px;font-size:22px;color:#054d8a;">Ulysses's quick read</h2>
            <p style="margin:0;line-height:1.7;">${assessment.ulyssesTake}</p>
          </div>
          <div style="margin-top:24px;">
            <h2 style="margin:0 0 12px;font-size:22px;color:#054d8a;">First things to look at</h2>
            <ul style="margin:0;padding-left:20px;line-height:1.7;">
              ${nextActionsHtml}
            </ul>
          </div>
          <div style="margin-top:28px;padding-top:20px;border-top:1px solid rgba(5,77,138,0.12);">
            <p style="margin:0;line-height:1.7;color:#4b5563;">
              Full consultation link: <a href="${publicUrl}" style="color:#054d8a;">${publicUrl}</a>
            </p>
          </div>
          <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top:24px;border-radius:14px;background:rgba(5,77,138,0.04);">
            <tr>
              <td style="width:80px;vertical-align:middle;padding:16px 0 16px 16px;">
                <img src="https://compliancechimp.com/assets/chimpDesk.png" alt="Ulysses" style="width:72px;height:auto;display:block;" />
              </td>
              <td style="vertical-align:middle;padding:16px 20px;">
                <p style="margin:0 0 4px;font-size:11px;text-transform:uppercase;letter-spacing:0.08em;font-weight:700;color:#054d8a;">Fun fact about me</p>
                <p style="margin:0;font-size:14px;line-height:1.6;color:#4b5563;font-style:italic;">${funFact}</p>
              </td>
            </tr>
          </table>
        </div>
      </div>
    </div>
  `;
}

export function buildConsultationLeadEmailText(args: {
  companyName: string;
  assessment: any;
  publicUrl: string;
}): string {
  const { companyName, assessment, publicUrl } = args;
  const funFact = getRandomUlyssesFunFact();
  const nextActions = Array.isArray(assessment.nextActions)
    ? assessment.nextActions
        .slice(0, 3)
        .map((action: any) => `- ${action.title}: ${action.description}`)
        .join("\n")
    : "- Open the consultation to review your recommended next steps.";

  return [
    `A New Era of Workplace Safety`,
    `I'm Ulysses, the world's first AI agent for workplace safety with a total mastery of OSHA.`,
    "",
    `I help small businesses put together real safety programs. Training plans, inspections, compliance tracking, record keeping. The whole system, without the price tag of a full-time safety manager.`,
    "",
    `I went ahead and ran ${companyName} against current OSHA standards to see where you stand. Here is what I found.`,
    "",
    `Compliance urgency score: ${assessment.importanceScore} (${assessment.importanceLevel})`,
    "",
    "Ulysses's quick read:",
    assessment.ulyssesTake,
    "",
    "First things to look at:",
    nextActions,
    "",
    `Open your consultation: ${publicUrl}`,
    "",
    `Fun fact about me: ${funFact}`,
  ].join("\n");
}

// ── Follow-up email: viewed report → show the video ──────────────────────────

export function buildVideoFollowupEmailHtml(args: { companyName: string; publicUrl: string }): string {
  const { companyName, publicUrl } = args;
  const funFact = getRandomUlyssesFunFact();
  return `
    <div style="font-family:Arial,sans-serif;background:#f6f8fb;margin:0;padding:32px 16px;color:#1b1b1b;">
      <div style="max-width:680px;margin:0 auto;background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 10px 30px rgba(0,0,0,0.08);">
        <div style="background:linear-gradient(135deg,#054d8a 0%,#04355f 100%);padding:24px 32px;text-align:center;">
          <img src="https://compliancechimp.com/assets/complianceChimpLogoLight.png" alt="Compliance Chimp" style="height:40px;" />
        </div>
        <div style="padding:32px;">
          <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:24px;">
            <tr>
              <td style="width:140px;vertical-align:top;padding-right:20px;">
                <img src="https://compliancechimp.com/assets/chimp.png" alt="Ulysses" style="width:140px;height:auto;display:block;" />
              </td>
              <td style="vertical-align:top;">
                <h2 style="margin:0 0 8px;font-size:22px;color:#054d8a;">You opened the report. Good.</h2>
                <p style="margin:0;line-height:1.7;">
                  You have seen the score and what applies to <strong>${companyName}</strong>. Most people stop there. The next step takes 75 seconds to watch.
                </p>
              </td>
            </tr>
          </table>
          <a href="${CHIMP_DEMO_VIDEO_URL}" target="_blank" rel="noopener noreferrer" style="display:block;text-decoration:none;margin-bottom:12px;">
            <img src="${CHIMP_DEMO_THUMBNAIL_URL}" alt="Watch Ulysses build a full safety program in 75 seconds" style="width:100%;height:auto;display:block;border-radius:12px;border:0;" />
          </a>
          <div style="text-align:center;margin-bottom:24px;">
            <a href="${CHIMP_DEMO_VIDEO_URL}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:12px 28px;border-radius:999px;background:#ff9100;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;line-height:1;">Watch the Full Onboarding (75 sec)</a>
          </div>
          <p style="margin:0 0 28px;line-height:1.7;color:#4b5563;">
            That is the full program. Every written plan, training assignment, and document built from your specific report. Once it is set up, Ulysses keeps monitoring it. No safety manager required.
          </p>
          <div style="text-align:center;margin-bottom:28px;">
            <a href="${publicUrl}" style="display:inline-block;padding:16px 32px;border-radius:999px;background:#054d8a;color:#ffffff;text-decoration:none;font-weight:700;font-size:16px;line-height:1;">Start Building My Program</a>
          </div>
          <div style="padding-top:20px;border-top:1px solid rgba(5,77,138,0.12);">
            <p style="margin:0;line-height:1.7;color:#4b5563;">
              Your consultation: <a href="${publicUrl}" style="color:#054d8a;">${publicUrl}</a>
            </p>
          </div>
          <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top:24px;border-radius:14px;background:rgba(5,77,138,0.04);">
            <tr>
              <td style="width:80px;vertical-align:middle;padding:16px 0 16px 16px;">
                <img src="https://compliancechimp.com/assets/chimpDesk.png" alt="Ulysses" style="width:72px;height:auto;display:block;" />
              </td>
              <td style="vertical-align:middle;padding:16px 20px;">
                <p style="margin:0 0 4px;font-size:11px;text-transform:uppercase;letter-spacing:0.08em;font-weight:700;color:#054d8a;">Fun fact about me</p>
                <p style="margin:0;font-size:14px;line-height:1.6;color:#4b5563;font-style:italic;">${funFact}</p>
              </td>
            </tr>
          </table>
        </div>
      </div>
    </div>
  `;
}

export function buildVideoFollowupEmailText(args: { companyName: string; publicUrl: string }): string {
  const { companyName, publicUrl } = args;
  const funFact = getRandomUlyssesFunFact();
  return [
    `You opened the report. Good.`,
    "",
    `You have seen the score and what applies to ${companyName}. The next step takes 75 seconds to watch.`,
    "",
    `Watch the full onboarding: ${CHIMP_DEMO_VIDEO_URL}`,
    "",
    `That is the full program. Every written plan, training assignment, and document built from your specific report. Once it is set up, Ulysses keeps monitoring it. No safety manager required.`,
    "",
    `Start building your program: ${publicUrl}`,
    "",
    `Your consultation: ${publicUrl}`,
    "",
    `Fun fact about me: ${funFact}`,
  ].join("\n");
}

// ── Follow-up emails: non-viewer drip (week 1 and week 2) ────────────────────

export function pickFollowupObligation(assessment: any, index: number): any | null {
  const all = [
    ...(Array.isArray(assessment?.federalRequirements) ? assessment.federalRequirements : []),
    ...(Array.isArray(assessment?.stateRequirements) ? assessment.stateRequirements : []),
  ];
  const priorityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
  all.sort((a: any, b: any) => (priorityOrder[a.priority] ?? 1) - (priorityOrder[b.priority] ?? 1));
  return all[index] ?? null;
}

export function buildNonViewerFollowupEmailHtml(args: {
  companyName: string;
  assessment: any;
  publicUrl: string;
  week: 1 | 2;
}): string {
  const { companyName, assessment, publicUrl, week } = args;
  const obligation = pickFollowupObligation(assessment, week - 1);
  const totalObligations =
    (Array.isArray(assessment?.federalRequirements) ? assessment.federalRequirements.length : 0) +
    (Array.isArray(assessment?.stateRequirements) ? assessment.stateRequirements.length : 0);
  const funFact = getRandomUlyssesFunFact();

  const introText = week === 1
    ? `Your compliance consultation for <strong>${companyName}</strong> has been ready for a week. I will bring one item from it to you instead of waiting for you to click through.`
    : `Your compliance consultation for <strong>${companyName}</strong> has been sitting for two weeks. One more item before I let it go.`;

  const obligationHtml = obligation
    ? `
      <div style="padding:20px;border-radius:16px;background:#f6f8fb;border:1px solid rgba(5,77,138,0.12);margin-bottom:24px;">
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:#5b6470;margin-bottom:6px;">
          ${obligation.requirementLevel === "required" ? "Required" : "Conditional"} obligation
        </div>
        <h3 style="margin:0 0 8px;font-size:18px;color:#054d8a;">${obligation.title}</h3>
        <p style="margin:0 0 10px;line-height:1.6;color:#4b5563;">${obligation.appliesBecause}</p>
        ${obligation.details && obligation.details[0] ? `<p style="margin:0;line-height:1.6;"><strong>What this means:</strong> ${obligation.details[0]}</p>` : ""}
      </div>
    `
    : "";

  const remainingCount = Math.max(0, totalObligations - week);
  const remainingText = remainingCount > 0
    ? `There ${remainingCount === 1 ? "is" : "are"} ${remainingCount} more obligation${remainingCount === 1 ? "" : "s"} in your full report, each with the specific regulation and what it requires from you.`
    : `Your full report has the complete picture of what applies to your business.`;

  return `
    <div style="font-family:Arial,sans-serif;background:#f6f8fb;margin:0;padding:32px 16px;color:#1b1b1b;">
      <div style="max-width:680px;margin:0 auto;background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 10px 30px rgba(0,0,0,0.08);">
        <div style="background:linear-gradient(135deg,#054d8a 0%,#04355f 100%);padding:24px 32px;text-align:center;">
          <img src="https://compliancechimp.com/assets/complianceChimpLogoLight.png" alt="Compliance Chimp" style="height:40px;" />
        </div>
        <div style="padding:32px;">
          <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:24px;">
            <tr>
              <td style="width:140px;vertical-align:top;padding-right:20px;">
                <img src="https://compliancechimp.com/assets/chimp.png" alt="Ulysses" style="width:140px;height:auto;display:block;" />
              </td>
              <td style="vertical-align:top;">
                <h2 style="margin:0 0 8px;font-size:22px;color:#054d8a;">Something from your report worth knowing</h2>
                <p style="margin:0;line-height:1.7;">${introText}</p>
              </td>
            </tr>
          </table>
          ${obligationHtml}
          <p style="margin:0 0 24px;line-height:1.7;color:#4b5563;">${remainingText}</p>
          <div style="text-align:center;margin-bottom:28px;">
            <a href="${publicUrl}" style="display:inline-block;padding:16px 32px;border-radius:999px;background:#ff9100;color:#ffffff;text-decoration:none;font-weight:700;font-size:16px;line-height:1;">Open My Consultation</a>
          </div>
          <div style="padding-top:20px;border-top:1px solid rgba(5,77,138,0.12);">
            <p style="margin:0;line-height:1.7;color:#4b5563;">
              Full consultation link: <a href="${publicUrl}" style="color:#054d8a;">${publicUrl}</a>
            </p>
          </div>
          <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top:24px;border-radius:14px;background:rgba(5,77,138,0.04);">
            <tr>
              <td style="width:80px;vertical-align:middle;padding:16px 0 16px 16px;">
                <img src="https://compliancechimp.com/assets/chimpDesk.png" alt="Ulysses" style="width:72px;height:auto;display:block;" />
              </td>
              <td style="vertical-align:middle;padding:16px 20px;">
                <p style="margin:0 0 4px;font-size:11px;text-transform:uppercase;letter-spacing:0.08em;font-weight:700;color:#054d8a;">Fun fact about me</p>
                <p style="margin:0;font-size:14px;line-height:1.6;color:#4b5563;font-style:italic;">${funFact}</p>
              </td>
            </tr>
          </table>
        </div>
      </div>
    </div>
  `;
}

export function buildNonViewerFollowupEmailText(args: {
  companyName: string;
  assessment: any;
  publicUrl: string;
  week: 1 | 2;
}): string {
  const { companyName, assessment, publicUrl, week } = args;
  const obligation = pickFollowupObligation(assessment, week - 1);
  const funFact = getRandomUlyssesFunFact();

  const introText = week === 1
    ? `Your compliance consultation for ${companyName} has been ready for a week. Here is one item from it worth knowing about.`
    : `Your compliance consultation for ${companyName} has been sitting for two weeks. One more item before I let it go.`;

  const lines: string[] = [
    `Something from your report worth knowing`,
    "",
    introText,
    "",
  ];

  if (obligation) {
    lines.push(`${obligation.requirementLevel === "required" ? "Required" : "Conditional"} obligation: ${obligation.title}`);
    lines.push(obligation.appliesBecause);
    if (obligation.details && obligation.details[0]) {
      lines.push(`What this means: ${obligation.details[0]}`);
    }
    lines.push("");
  }

  lines.push(`Open your consultation: ${publicUrl}`);
  lines.push("");
  lines.push(`Fun fact about me: ${funFact}`);

  return lines.join("\n");
}
