export interface ConsultationRequestInput {
  companyName: string;
  website: string;
  description: string;
  employeeCount: number;
  state: string;
}

export interface ConsultationCitation {
  title: string;
  url: string;
  jurisdiction: "federal" | "state";
  note?: string;
}

export interface ConsultationObligation {
  id: string;
  title: string;
  category: string;
  requirementLevel: "required" | "conditional" | "recommended";
  priority: "high" | "medium" | "low";
  appliesBecause: string;
  details: string[];
  thresholdNotes: string[];
  citations: ConsultationCitation[];
}

export interface ConsultationNextAction {
  title: string;
  description: string;
  priority: "high" | "medium" | "low";
}

export interface ConsultationPrefill {
  companyName: string;
  website: string;
  industryDescription: string;
  state: string;
  employeeCount: number;
}

export interface ConsultationAssessment {
  assessmentId: string;
  generatedAt: string;
  importanceScore: number;
  importanceLevel: string;
  summary: string;
  importanceReason: string;
  ulyssesTake: string;
  profile: ConsultationProfile;
  federalRequirements: ConsultationObligation[];
  stateRequirements: ConsultationObligation[];
  recommendedProcesses: ConsultationObligation[];
  nextActions: ConsultationNextAction[];
  caveats: string[];
  prefill: ConsultationPrefill;
}

export interface ConsultationProfile {
  companyName: string;
  website: string;
  description: string;
  employeeCount: number;
  state: string;
  industryDescription: string;
  oshaTrack: OshaTrack;
  statePlanApplies: boolean;
  statePlanNote: string | null;
  likelyLowHazardPartialExemption: boolean;
  hazardFlags: string[];
  assumptions: string[];
}

export type OshaTrack = "general-industry" | "construction" | "maritime" | "agriculture";

export interface AiConsultationClassification {
  businessSummary: string;
  ulyssesTake: string;
  industryDescription: string;
  oshaTrack: OshaTrack;
  hazardFlags: string[];
  likelyLowHazardPartialExemption: boolean;
  assumptions: string[];
  confidence: "low" | "medium" | "high";
}

interface StatePlanInfo {
  stateName: string;
  coverage: "all" | "public-only";
  note: string;
  citations: ConsultationCitation[];
}

interface DerivedFlags {
  construction: boolean;
  chemicalExposure: boolean;
  poweredIndustrialTrucks: boolean;
  bloodbornePathogens: boolean;
  respiratoryHazards: boolean;
  machineHazards: boolean;
  heights: boolean;
  hotWork: boolean;
  confinedSpaces: boolean;
  electricalWork: boolean;
  excavation: boolean;
}

const OSHA_STATE_PLANS_URL = "https://www.osha.gov/stateplans";
const CALIFORNIA_IIPP_URL = "https://www.dir.ca.gov/title8/3203.html";

const STATE_NAMES: Record<string, string> = {
  AL: "Alabama",
  AK: "Alaska",
  AZ: "Arizona",
  AR: "Arkansas",
  CA: "California",
  CO: "Colorado",
  CT: "Connecticut",
  DE: "Delaware",
  FL: "Florida",
  GA: "Georgia",
  HI: "Hawaii",
  ID: "Idaho",
  IL: "Illinois",
  IN: "Indiana",
  IA: "Iowa",
  KS: "Kansas",
  KY: "Kentucky",
  LA: "Louisiana",
  ME: "Maine",
  MD: "Maryland",
  MA: "Massachusetts",
  MI: "Michigan",
  MN: "Minnesota",
  MS: "Mississippi",
  MO: "Missouri",
  MT: "Montana",
  NE: "Nebraska",
  NV: "Nevada",
  NH: "New Hampshire",
  NJ: "New Jersey",
  NM: "New Mexico",
  NY: "New York",
  NC: "North Carolina",
  ND: "North Dakota",
  OH: "Ohio",
  OK: "Oklahoma",
  OR: "Oregon",
  PA: "Pennsylvania",
  RI: "Rhode Island",
  SC: "South Carolina",
  SD: "South Dakota",
  TN: "Tennessee",
  TX: "Texas",
  UT: "Utah",
  VT: "Vermont",
  VA: "Virginia",
  WA: "Washington",
  WV: "West Virginia",
  WI: "Wisconsin",
  WY: "Wyoming",
  DC: "District of Columbia",
  PR: "Puerto Rico",
  VI: "U.S. Virgin Islands",
};

const STATE_PLAN_INFO: Record<string, StatePlanInfo> = {
  AK: statePlanAll("Alaska"),
  AZ: statePlanAll("Arizona"),
  CA: statePlanAll("California"),
  CT: statePlanPublicOnly("Connecticut"),
  HI: statePlanAll("Hawaii"),
  IL: statePlanPublicOnly("Illinois"),
  IN: statePlanAll("Indiana"),
  IA: statePlanAll("Iowa"),
  KY: statePlanAll("Kentucky"),
  ME: statePlanPublicOnly("Maine"),
  MD: statePlanAll("Maryland"),
  MA: statePlanPublicOnly("Massachusetts"),
  MI: statePlanAll("Michigan"),
  MN: statePlanAll("Minnesota"),
  NV: statePlanAll("Nevada"),
  NJ: statePlanPublicOnly("New Jersey"),
  NM: statePlanAll("New Mexico"),
  NY: statePlanPublicOnly("New York"),
  NC: statePlanAll("North Carolina"),
  OR: statePlanAll("Oregon"),
  PR: statePlanAll("Puerto Rico"),
  SC: statePlanAll("South Carolina"),
  TN: statePlanAll("Tennessee"),
  UT: statePlanAll("Utah"),
  VT: statePlanAll("Vermont"),
  VA: statePlanAll("Virginia"),
  VI: statePlanAll("U.S. Virgin Islands"),
  WA: statePlanAll("Washington"),
  WY: statePlanAll("Wyoming"),
};

const FEDERAL_CITATIONS = {
  poster: citation("Job Safety and Health: It's the Law Poster", "https://www.osha.gov/laws-regs/regulations/standardnumber/1903/1903.2"),
  recordkeeping: citation("29 CFR 1904 Recordkeeping", "https://www.osha.gov/laws-regs/regulations/standardnumber/1904"),
  oshaForms: citation("OSHA Recordkeeping Forms 300, 300A, 301", "https://www.osha.gov/recordkeeping/forms"),
  severeReporting: citation("Severe Injury Reporting", "https://www.osha.gov/report"),
  annualSummary: citation("29 CFR 1904.32 Annual Summary", "https://www.osha.gov/laws-regs/regulations/standardnumber/1904/1904.32"),
  emergencyActionPlan: citation("29 CFR 1910.38 Emergency Action Plans", "https://www.osha.gov/laws-regs/regulations/standardnumber/1910/1910.38"),
  ppe: citation("29 CFR 1910.132 PPE General Requirements", "https://www.osha.gov/laws-regs/regulations/standardnumber/1910/1910.132"),
  hazardCommunication: citation("29 CFR 1910.1200 Hazard Communication", "https://www.osha.gov/laws-regs/regulations/standardnumber/1910/1910.1200"),
  respiratory: citation("29 CFR 1910.134 Respiratory Protection", "https://www.osha.gov/laws-regs/regulations/standardnumber/1910/1910.134"),
  lockoutTagout: citation("29 CFR 1910.147 Lockout/Tagout", "https://www.osha.gov/laws-regs/regulations/standardnumber/1910/1910.147"),
  machineGuarding: citation("29 CFR 1910 Subpart O Machinery and Machine Guarding", "https://www.osha.gov/laws-regs/regulations/standardnumber/1910/1910SubpartO"),
  bloodborne: citation("29 CFR 1910.1030 Bloodborne Pathogens", "https://www.osha.gov/laws-regs/regulations/standardnumber/1910/1910.1030"),
  forklifts: citation("29 CFR 1910.178 Powered Industrial Trucks", "https://www.osha.gov/laws-regs/regulations/standardnumber/1910/1910.178"),
  walkingSurfaces: citation("29 CFR 1910 Subpart D Walking-Working Surfaces", "https://www.osha.gov/laws-regs/regulations/standardnumber/1910/1910SubpartD"),
  constructionFallProtection: citation("29 CFR 1926.501 Fall Protection", "https://www.osha.gov/laws-regs/regulations/standardnumber/1926/1926.501"),
  ladders: citation("29 CFR 1926.1053 Ladders", "https://www.osha.gov/laws-regs/regulations/standardnumber/1926/1926.1053"),
  scaffolds: citation("29 CFR 1926.451 Scaffolds", "https://www.osha.gov/laws-regs/regulations/standardnumber/1926/1926.451"),
  excavation: citation("29 CFR 1926 Subpart P Excavations", "https://www.osha.gov/laws-regs/regulations/standardnumber/1926/1926SubpartP"),
  electricalConstruction: citation("29 CFR 1926 Subpart K Electrical", "https://www.osha.gov/laws-regs/regulations/standardnumber/1926/1926SubpartK"),
};

export function sanitizeConsultationInput(raw: any): ConsultationRequestInput {
  const companyName = String(raw?.companyName || "").trim();
  const website = normalizeWebsite(raw?.website);
  const description = String(raw?.description || "").trim();
  const employeeCount = Number(raw?.employeeCount);
  const state = String(raw?.state || "").trim().toUpperCase();

  if (companyName.length < 2 || companyName.length > 120) {
    throw new Error("Company name must be between 2 and 120 characters.");
  }

  if (description.length < 12 || description.length > 1200) {
    throw new Error("Business description must be between 12 and 1200 characters.");
  }

  if (!Number.isFinite(employeeCount) || employeeCount < 1 || employeeCount > 1000000) {
    throw new Error("Employee count must be between 1 and 1,000,000.");
  }

  if (!STATE_NAMES[state]) {
    throw new Error("A valid U.S. state or territory is required.");
  }

  return {
    companyName,
    website,
    description,
    employeeCount: Math.round(employeeCount),
    state,
  };
}

export function buildFallbackClassification(input: ConsultationRequestInput): AiConsultationClassification {
  const text = `${input.companyName} ${input.description} ${input.website}`.toLowerCase();
  const track = inferTrackFromKeywords(text);
  const hazardFlags = inferHazardFlags(text, track);
  const lowHazard = isLikelyLowHazard(text, track, hazardFlags);
  const industryDescription = inferIndustryDescription(text, track);
  const summary = buildFallbackSummary(input, track, hazardFlags);

  return {
    businessSummary: summary,
    ulyssesTake: buildFallbackUlyssesTake(input, track, hazardFlags),
    industryDescription,
    oshaTrack: track,
    hazardFlags,
    likelyLowHazardPartialExemption: lowHazard,
    assumptions: [
      "This fallback classification was generated from the company description and obvious keywords only.",
    ],
    confidence: hazardFlags.length >= 2 ? "medium" : "low",
  };
}

export function buildConsultationAssessment(
  input: ConsultationRequestInput,
  classification: AiConsultationClassification
): Omit<ConsultationAssessment, "assessmentId" | "generatedAt"> {
  const profile = buildProfile(input, classification);
  const flags = deriveFlags(profile);
  const importanceScore = calculateImportanceScore(profile);
  const federalRequirements = buildFederalRequirements(profile, flags);
  const stateRequirements = buildStateRequirements(profile);
  const recommendedProcesses = buildRecommendedProcesses(profile, flags);
  const nextActions = buildNextActions(federalRequirements, stateRequirements, recommendedProcesses);
  const caveats = buildCaveats(profile);

  return {
    importanceScore,
    importanceLevel: importanceLevel(importanceScore),
    summary: classification.businessSummary || buildFallbackSummary(input, profile.oshaTrack, profile.hazardFlags),
    importanceReason: buildImportanceReason(profile, importanceScore),
    ulyssesTake: classification.ulyssesTake || buildFallbackUlyssesTake(input, profile.oshaTrack, profile.hazardFlags),
    profile,
    federalRequirements,
    stateRequirements,
    recommendedProcesses,
    nextActions,
    caveats,
    prefill: {
      companyName: input.companyName,
      website: input.website,
      industryDescription: profile.industryDescription,
      state: input.state,
      employeeCount: input.employeeCount,
    },
  };
}

function buildProfile(
  input: ConsultationRequestInput,
  classification: AiConsultationClassification
): ConsultationProfile {
  const stateInfo = STATE_PLAN_INFO[input.state];
  const hazardFlags = uniqueStrings([
    ...classification.hazardFlags,
    ...inferHazardFlags(`${input.description} ${input.website}`, classification.oshaTrack),
  ]);
  const likelyLowHazardPartialExemption =
    classification.likelyLowHazardPartialExemption &&
    classification.oshaTrack === "general-industry";

  return {
    companyName: input.companyName,
    website: input.website,
    description: input.description,
    employeeCount: input.employeeCount,
    state: input.state,
    industryDescription: classification.industryDescription || inferIndustryDescription(input.description, classification.oshaTrack),
    oshaTrack: classification.oshaTrack,
    statePlanApplies: !!stateInfo && stateInfo.coverage === "all",
    statePlanNote: stateInfo ? stateInfo.note : null,
    likelyLowHazardPartialExemption,
    hazardFlags,
    assumptions: uniqueStrings(classification.assumptions).slice(0, 5),
  };
}

function buildFederalRequirements(profile: ConsultationProfile, flags: DerivedFlags): ConsultationObligation[] {
  const obligations: ConsultationObligation[] = [];

  obligations.push({
    id: "poster",
    title: "Post the federal OSHA notice where employees can see it",
    category: "posters-and-notices",
    requirementLevel: "required",
    priority: "high",
    appliesBecause: "Almost every private employer covered by OSHA must display the official Job Safety and Health poster.",
    details: [
      "Display the current OSHA poster in a conspicuous location at each workplace.",
      "Make sure new hires and existing workers can readily see it during normal work.",
    ],
    thresholdNotes: profile.statePlanApplies ? [
      `${stateLabel(profile.state)} operates an OSHA-approved State Plan, so you may need the state-plan poster in addition to or instead of the federal poster.`,
    ] : [],
    citations: [FEDERAL_CITATIONS.poster],
  });

  obligations.push({
    id: "severe-injury-reporting",
    title: "Be ready to report severe injuries and fatalities quickly",
    category: "recordkeeping-and-reporting",
    requirementLevel: "required",
    priority: "high",
    appliesBecause: "All covered employers have rapid reporting duties for fatalities, inpatient hospitalizations, amputations, and eye loss events.",
    details: [
      "Report work-related fatalities within 8 hours.",
      "Report inpatient hospitalizations, amputations, and loss of an eye within 24 hours.",
      "Make sure supervisors know who reports, how, and where those reports are documented internally.",
    ],
    thresholdNotes: [],
    citations: [FEDERAL_CITATIONS.severeReporting],
  });

  obligations.push({
    id: "recordkeeping-forms",
    title: "Maintain OSHA recordkeeping forms if you are not partially exempt",
    category: "recordkeeping-and-reporting",
    requirementLevel: profile.employeeCount > 10 && !profile.likelyLowHazardPartialExemption ? "required" : "conditional",
    priority: "high",
    appliesBecause: profile.employeeCount > 10
      ? "Employers with more than 10 employees often need the OSHA 300 Log, 300A Summary, and 301 Incident Report unless they qualify for a low-hazard exemption."
      : "Small employers can still have recordkeeping duties depending on exemption status, ownership structure, and specific operations.",
    details: [
      "Keep an OSHA 300 Log of recordable injuries and illnesses.",
      "Prepare an OSHA 301 Incident Report or equivalent for each recordable case.",
      "Complete and certify the OSHA 300A Annual Summary when the year closes.",
    ],
    thresholdNotes: [
      "Partial exemption depends on both company size and industry classification. This report flags the issue, but you should verify your exact exemption status if you are office-heavy or otherwise low-hazard.",
      "Even if you are partially exempt from routine logs, severe injury reporting still applies.",
    ],
    citations: [FEDERAL_CITATIONS.recordkeeping, FEDERAL_CITATIONS.oshaForms, FEDERAL_CITATIONS.annualSummary],
  });

  obligations.push({
    id: "emergency-action-plan",
    title: "Set up emergency action and evacuation procedures",
    category: "written-programs-and-plans",
    requirementLevel: profile.employeeCount > 10 ? "required" : "conditional",
    priority: "high",
    appliesBecause: "Every employer needs a workable emergency plan. Once you exceed 10 employees, OSHA generally expects a written emergency action plan under 1910.38.",
    details: [
      "Define who sounds the alarm, who accounts for employees, and where people evacuate.",
      "Document reporting procedures for fires, medical emergencies, chemical releases, and other foreseeable events.",
      "Train workers on the plan and make sure supervisors can execute it under pressure.",
    ],
    thresholdNotes: [
      profile.employeeCount > 10
        ? "With more than 10 employees, keep the emergency action plan in writing."
        : "Employers with 10 or fewer employees may communicate the plan orally, but the process still needs to be clear and reliable.",
    ],
    citations: [FEDERAL_CITATIONS.emergencyActionPlan],
  });

  obligations.push({
    id: "ppe-hazard-assessment",
    title: "Perform and document a PPE hazard assessment",
    category: "written-programs-and-plans",
    requirementLevel: flags.construction || profile.hazardFlags.length > 0 ? "required" : "conditional",
    priority: "high",
    appliesBecause: "The work description suggests exposure to hazards that commonly require eye, face, head, hand, foot, or fall protection decisions.",
    details: [
      "Identify the tasks and exposures that require PPE.",
      "Specify the PPE employees must use, maintain, and replace.",
      "Train workers on when PPE is required, how to wear it, and what its limits are.",
    ],
    thresholdNotes: [
      "If the business is strictly office or clerical with no field work, the PPE burden may be narrower. Most operating employers still need a basic documented hazard review.",
    ],
    citations: [FEDERAL_CITATIONS.ppe],
  });

  if (flags.chemicalExposure) {
    obligations.push({
      id: "hazard-communication",
      title: "Run a hazard communication program for chemicals",
      category: "training-and-chemical-safety",
      requirementLevel: "required",
      priority: "high",
      appliesBecause: "The company description points to chemicals, solvents, coatings, cleaners, refrigerants, fuels, or other hazardous substances in normal work.",
      details: [
        "Keep an inventory of hazardous chemicals and make Safety Data Sheets available.",
        "Label containers properly and train workers on chemical hazards and protective measures.",
        "Maintain a written hazard communication program and update it as products change.",
      ],
      thresholdNotes: [],
      citations: [FEDERAL_CITATIONS.hazardCommunication],
    });
  }

  if (flags.respiratoryHazards) {
    obligations.push({
      id: "respiratory-protection",
      title: "Evaluate whether a respiratory protection program is required",
      category: "training-and-chemical-safety",
      requirementLevel: "conditional",
      priority: "high",
      appliesBecause: "The business description suggests dust, fumes, silica, paint, or airborne contaminants that can trigger respiratory protection duties.",
      details: [
        "Determine whether workers need respirators for any task or exposure scenario.",
        "If respirators are required, set up medical evaluations, fit testing, training, and program administration.",
        "Document how engineering controls, work practices, and respirators work together.",
      ],
      thresholdNotes: [
        "Respiratory protection is not automatic for every dusty job, but once respirators are required the program burden becomes specific and documentable.",
      ],
      citations: [FEDERAL_CITATIONS.respiratory],
    });
  }

  if (flags.machineHazards) {
    obligations.push({
      id: "machine-guarding-loto",
      title: "Control machine hazards and energy isolation",
      category: "machine-safety",
      requirementLevel: "required",
      priority: "high",
      appliesBecause: "The work appears to involve production equipment, maintenance, fabrication, or servicing that can expose workers to moving parts and hazardous energy.",
      details: [
        "Guard moving machine parts and points of operation.",
        "Create lockout/tagout procedures for servicing and maintenance where unexpected startup or stored energy is a risk.",
        "Train affected and authorized employees on machine-specific controls.",
      ],
      thresholdNotes: [],
      citations: [FEDERAL_CITATIONS.machineGuarding, FEDERAL_CITATIONS.lockoutTagout],
    });
  }

  if (flags.poweredIndustrialTrucks) {
    obligations.push({
      id: "forklift-training",
      title: "Train and evaluate powered industrial truck operators",
      category: "training-and-equipment",
      requirementLevel: "required",
      priority: "high",
      appliesBecause: "The operation looks warehouse, yard, or distribution oriented, which commonly brings forklifts or similar powered industrial trucks into the picture.",
      details: [
        "Train each operator on truck-specific and site-specific hazards before they operate independently.",
        "Evaluate operator performance and keep records of the training and evaluation.",
        "Refresh training when equipment, conditions, or operator performance indicates the need.",
      ],
      thresholdNotes: [],
      citations: [FEDERAL_CITATIONS.forklifts],
    });
  }

  if (flags.bloodbornePathogens) {
    obligations.push({
      id: "bloodborne-pathogens",
      title: "Implement bloodborne pathogens controls",
      category: "healthcare-and-biohazards",
      requirementLevel: "required",
      priority: "high",
      appliesBecause: "The work description suggests occupational exposure to blood or other potentially infectious materials.",
      details: [
        "Maintain an exposure control plan and review it regularly.",
        "Provide training, appropriate PPE, sharps controls where relevant, and access to hepatitis B vaccination as required.",
        "Document post-exposure evaluation steps and follow-up procedures.",
      ],
      thresholdNotes: [],
      citations: [FEDERAL_CITATIONS.bloodborne],
    });
  }

  if (flags.heights) {
    obligations.push({
      id: "falls-and-ladders",
      title: flags.construction ? "Control falls, ladders, and elevated work in construction" : "Control walking-working surface and fall hazards",
      category: "fall-protection",
      requirementLevel: "required",
      priority: "high",
      appliesBecause: "The work appears to include roofs, ladders, scaffolds, elevated access, mezzanines, or other fall exposures.",
      details: flags.construction ? [
        "Determine where fall protection is required and what systems are allowed for each task.",
        "Train workers on ladders, scaffolds, and fall arrest or restraint equipment they actually use.",
        "Inspect fall protection equipment and elevated access setups before use.",
      ] : [
        "Inspect walking-working surfaces, ladders, floor openings, and elevated work areas.",
        "Provide the appropriate fall protection, guardrails, or access controls for the exposure.",
        "Train workers on safe ladder use and elevated work practices.",
      ],
      thresholdNotes: [],
      citations: flags.construction
        ? [FEDERAL_CITATIONS.constructionFallProtection, FEDERAL_CITATIONS.ladders, FEDERAL_CITATIONS.scaffolds]
        : [FEDERAL_CITATIONS.walkingSurfaces],
    });
  }

  if (flags.excavation) {
    obligations.push({
      id: "excavation-safety",
      title: "Plan excavation and trenching controls",
      category: "construction-safety",
      requirementLevel: "required",
      priority: "high",
      appliesBecause: "Excavation or trench work is indicated, which creates one of OSHA's highest-risk fatality exposures.",
      details: [
        "Use a competent person to inspect excavations and protective systems.",
        "Plan spoil placement, access, utilities, and cave-in protection before digging begins.",
        "Document the protective method and inspection process for each active trench or excavation.",
      ],
      thresholdNotes: [],
      citations: [FEDERAL_CITATIONS.excavation],
    });
  }

  if (flags.electricalWork && flags.construction) {
    obligations.push({
      id: "construction-electrical",
      title: "Control electrical hazards on construction work",
      category: "construction-safety",
      requirementLevel: "required",
      priority: "high",
      appliesBecause: "The business description points to electrical installation, troubleshooting, or energized hazards in construction settings.",
      details: [
        "Address temporary power, equipment grounding, exposed live parts, and work planning for electrical tasks.",
        "Train workers on electrical hazard recognition, PPE, and safe work practices relevant to their duties.",
      ],
      thresholdNotes: [],
      citations: [FEDERAL_CITATIONS.electricalConstruction],
    });
  }

  return obligations;
}

function buildStateRequirements(profile: ConsultationProfile): ConsultationObligation[] {
  const obligations: ConsultationObligation[] = [];
  const stateInfo = STATE_PLAN_INFO[profile.state];

  if (stateInfo?.coverage === "all") {
    obligations.push({
      id: `state-plan-${profile.state.toLowerCase()}`,
      title: `Review ${stateInfo.stateName}'s OSHA-approved State Plan requirements`,
      category: "state-plan-overlays",
      requirementLevel: "required",
      priority: "high",
      appliesBecause: `${stateInfo.stateName} runs its own OSHA-approved State Plan for private employers, so federal baseline duties may not be the whole compliance picture.`,
      details: [
        "Confirm whether the state requires a different or additional labor law poster.",
        "Review whether injury reporting timelines, heat illness, written program, or training rules are stricter than federal OSHA.",
        "Use the state-plan agency's official guidance for final validation before treating the checklist as complete.",
      ],
      thresholdNotes: [stateInfo.note],
      citations: stateInfo.citations,
    });
  }

  if (profile.state === "CA") {
    obligations.push({
      id: "california-iipp",
      title: "Maintain a written Injury and Illness Prevention Program",
      category: "state-plan-overlays",
      requirementLevel: "required",
      priority: "high",
      appliesBecause: "California generally requires employers to maintain a written IIPP, which is a broader management-system requirement than the federal baseline.",
      details: [
        "Document responsibility, hazard assessment, correction, training, communication, and injury investigation procedures.",
        "Keep the program current with the actual way your company operates.",
      ],
      thresholdNotes: [],
      citations: [
        {
          title: "California Code of Regulations, Title 8, Section 3203",
          url: CALIFORNIA_IIPP_URL,
          jurisdiction: "state",
        },
      ],
    });
  }

  return obligations;
}

function buildRecommendedProcesses(profile: ConsultationProfile, flags: DerivedFlags): ConsultationObligation[] {
  const recommendations: ConsultationObligation[] = [
    {
      id: "incident-investigation",
      title: "Use a documented accident and incident investigation workflow",
      category: "management-systems",
      requirementLevel: "recommended",
      priority: "high",
      appliesBecause: "You cannot tell how close you are to compliance unless incidents, root causes, and corrective actions are documented consistently.",
      details: [
        "Capture what happened, contributing factors, immediate actions, and long-term corrective actions for each event.",
        "Use the same workflow for recordable injuries, first-aid events, property damage, and close calls.",
      ],
      thresholdNotes: [],
      citations: [FEDERAL_CITATIONS.oshaForms],
    },
    {
      id: "near-miss-program",
      title: "Track near misses before they turn into recordables",
      category: "management-systems",
      requirementLevel: "recommended",
      priority: "medium",
      appliesBecause: "Near-miss tracking is not a standalone federal form, but it is one of the fastest ways to catch repeat exposures before somebody gets hurt or OSHA asks questions.",
      details: [
        "Make near-miss reporting simple enough that supervisors and employees actually use it.",
        "Tie the report to corrective actions, owners, and due dates.",
      ],
      thresholdNotes: [],
      citations: [],
    },
    {
      id: "training-matrix",
      title: "Maintain an annual training matrix by role",
      category: "training-administration",
      requirementLevel: "recommended",
      priority: "high",
      appliesBecause: "Most compliance failures show up as training gaps first, especially when job duties vary by role, shift, or crew.",
      details: [
        "Map each job title to the training topics and refresh cadence it needs.",
        "Keep completion records and retraining triggers in one place.",
      ],
      thresholdNotes: [],
      citations: [],
    },
    {
      id: "inspection-program",
      title: "Run routine workplace inspections with corrective-action tracking",
      category: "management-systems",
      requirementLevel: "recommended",
      priority: "high",
      appliesBecause: "OSHA expects hazards to be identified and corrected, and that is difficult to show without a recurring inspection process.",
      details: [
        "Inspect facilities, equipment, jobsites, and high-risk tasks on a schedule.",
        "Track open hazards until closure and keep evidence of corrections.",
      ],
      thresholdNotes: [],
      citations: [],
    },
  ];

  if (flags.construction) {
    recommendations.push({
      id: "construction-pretask-planning",
      title: "Document pre-task planning and subcontractor coordination",
      category: "construction-safety",
      requirementLevel: "recommended",
      priority: "high",
      appliesBecause: "Construction work changes by site, crew, and subcontractor. Pre-task planning is how you keep safety controls synchronized with the work actually happening.",
      details: [
        "Use pre-task plans for daily hazards, controls, and equipment checks.",
        "Make sure host employer, GC, and subcontractor responsibilities are clear before work starts.",
      ],
      thresholdNotes: [],
      citations: [],
    });
  }

  if (flags.hotWork || flags.respiratoryHazards || flags.chemicalExposure) {
    recommendations.push({
      id: "sds-permit-control",
      title: "Centralize SDS management and permit-driven high-risk work controls",
      category: "training-and-chemical-safety",
      requirementLevel: "recommended",
      priority: "medium",
      appliesBecause: "The business description suggests hot work, airborne exposures, or chemical tasks that should be managed with tighter documentation than ordinary operations.",
      details: [
        "Keep Safety Data Sheets current and easy to retrieve.",
        "Use permits or equivalent controls for hot work, confined spaces, or other non-routine hazardous tasks when they arise.",
      ],
      thresholdNotes: [],
      citations: [],
    });
  }

  return recommendations;
}

function buildNextActions(
  federalRequirements: ConsultationObligation[],
  stateRequirements: ConsultationObligation[],
  recommendedProcesses: ConsultationObligation[]
): ConsultationNextAction[] {
  const candidates = [...stateRequirements, ...federalRequirements, ...recommendedProcesses]
    .sort(compareObligations)
    .slice(0, 5);

  return candidates.map((obligation) => ({
    title: obligation.title,
    description: obligation.details[0] || obligation.appliesBecause,
    priority: obligation.priority,
  }));
}

function buildCaveats(profile: ConsultationProfile): string[] {
  const caveats = [
    "This assessment assumes a private-sector employer operating in the United States.",
    "Some OSHA duties depend on the exact equipment, chemicals, job tasks, and site conditions you did not provide here.",
    "Use the official citations to verify edge cases before treating any single item as complete.",
  ];

  if (profile.statePlanApplies) {
    caveats.push(`${stateLabel(profile.state)} operates its own OSHA-approved State Plan, so state requirements can be stricter than the federal baseline.`);
  } else if (STATE_PLAN_INFO[profile.state]?.coverage === "public-only") {
    caveats.push(`${stateLabel(profile.state)} has a public-sector-only State Plan. Private employers are usually still covered by federal OSHA there.`);
  }

  if (profile.likelyLowHazardPartialExemption) {
    caveats.push("Recordkeeping exemption status is especially sensitive to exact industry classification. Verify that status before you skip OSHA logs.");
  }

  if (profile.assumptions.length) {
    caveats.push(...profile.assumptions.map((assumption) => `Assumption: ${assumption}`));
  }

  return uniqueStrings(caveats);
}

function calculateImportanceScore(profile: ConsultationProfile): number {
  let score = 35;

  if (profile.employeeCount >= 250) score += 24;
  else if (profile.employeeCount >= 50) score += 18;
  else if (profile.employeeCount >= 11) score += 12;
  else score += 5;

  if (profile.oshaTrack === "construction") score += 18;
  if (profile.oshaTrack === "maritime") score += 16;
  if (profile.oshaTrack === "agriculture") score += 14;
  if (profile.oshaTrack === "general-industry") score += 10;

  score += Math.min(profile.hazardFlags.length * 4, 24);

  if (profile.statePlanApplies) score += 4;
  if (profile.likelyLowHazardPartialExemption) score -= 8;

  return Math.max(25, Math.min(100, score));
}

function importanceLevel(score: number): string {
  if (score >= 85) return "Critical";
  if (score >= 70) return "High";
  if (score >= 55) return "Elevated";
  return "Meaningful";
}

function buildImportanceReason(profile: ConsultationProfile, score: number): string {
  const reasons = [
    `${stateLabel(profile.state)} jurisdiction`,
    `${profile.employeeCount} employees`,
    profile.oshaTrack.replace("-", " "),
    ...profile.hazardFlags.slice(0, 3),
  ].filter(Boolean);

  return `This business scores ${score}/100 because the described operation points to ${reasons.join(", ")}. That combination usually means more documented controls, training records, and inspection-ready processes are needed than a low-hazard office environment.`;
}

function deriveFlags(profile: ConsultationProfile): DerivedFlags {
  const hazards = new Set(profile.hazardFlags);
  return {
    construction: profile.oshaTrack === "construction",
    chemicalExposure: hasAny(hazards, ["chemicals", "paint", "solvents", "hazcom", "fuel"]),
    poweredIndustrialTrucks: hasAny(hazards, ["forklifts", "warehouse", "material-handling"]),
    bloodbornePathogens: hasAny(hazards, ["bloodborne-pathogens", "sharps", "patient-care"]),
    respiratoryHazards: hasAny(hazards, ["respiratory", "silica", "welding-fumes", "dust"]),
    machineHazards: hasAny(hazards, ["machine-guarding", "lockout-tagout", "fabrication", "maintenance"]),
    heights: hasAny(hazards, ["falls", "ladders", "roofs", "scaffolds"]),
    hotWork: hasAny(hazards, ["hot-work", "welding-fumes"]),
    confinedSpaces: hasAny(hazards, ["confined-spaces"]),
    electricalWork: hasAny(hazards, ["electrical"]),
    excavation: hasAny(hazards, ["excavation"]),
  };
}

function compareObligations(a: ConsultationObligation, b: ConsultationObligation): number {
  const priorityWeight = { high: 0, medium: 1, low: 2 } as const;
  const levelWeight = { required: 0, conditional: 1, recommended: 2 } as const;

  return priorityWeight[a.priority] - priorityWeight[b.priority]
    || levelWeight[a.requirementLevel] - levelWeight[b.requirementLevel]
    || a.title.localeCompare(b.title);
}

function normalizeWebsite(value: unknown): string {
  const raw = String(value || "").trim();
  if (!raw) return "";

  const candidate = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(candidate);
    return url.origin.replace(/\/$/, "");
  } catch {
    throw new Error("Website must be a valid domain or URL.");
  }
}

function inferTrackFromKeywords(text: string): OshaTrack {
  if (matches(text, ["roof", "construction", "remodel", "electrician", "framing", "drywall", "concrete", "excavat", "sitework", "plumb"])) {
    return "construction";
  }
  if (matches(text, ["marine", "shipyard", "dock", "port", "vessel"])) {
    return "maritime";
  }
  if (matches(text, ["farm", "agric", "ranch", "crop", "dairy"])) {
    return "agriculture";
  }
  return "general-industry";
}

function inferHazardFlags(text: string, track: OshaTrack): string[] {
  const flags = new Set<string>();

  if (track === "construction") flags.add("falls");
  if (matches(text, ["roof", "ladder", "scaffold", "elevat"])) {
    flags.add("falls");
    flags.add("ladders");
  }
  if (matches(text, ["warehouse", "forklift", "distribution", "pallet", "dock"])) {
    flags.add("forklifts");
    flags.add("material-handling");
  }
  if (matches(text, ["paint", "solvent", "coating", "chemical", "cleaner", "fuel", "refrigerant"])) {
    flags.add("chemicals");
    flags.add("hazcom");
  }
  if (matches(text, ["concrete", "masonry", "stone", "countertop", "silica", "cutting"])) {
    flags.add("silica");
    flags.add("respiratory");
  }
  if (matches(text, ["weld", "torch", "cutting", "fabricat"])) {
    flags.add("welding-fumes");
    flags.add("hot-work");
    flags.add("machine-guarding");
  }
  if (matches(text, ["machine", "press", "lathe", "cnc", "manufactur", "maintenance"])) {
    flags.add("machine-guarding");
    flags.add("lockout-tagout");
  }
  if (matches(text, ["clinic", "medical", "patient", "nursing", "dental", "phlebot", "biohazard"])) {
    flags.add("bloodborne-pathogens");
    flags.add("patient-care");
  }
  if (matches(text, ["dust", "spray", "blast", "powder", "grind", "sanding"])) {
    flags.add("respiratory");
  }
  if (matches(text, ["electric", "panel", "voltage", "energized", "hvac"])) {
    flags.add("electrical");
  }
  if (matches(text, ["trench", "excavat", "utility vault", "manhole"])) {
    flags.add("excavation");
    flags.add("confined-spaces");
  }

  return Array.from(flags);
}

function isLikelyLowHazard(text: string, track: OshaTrack, hazardFlags: string[]): boolean {
  if (track !== "general-industry") return false;
  if (hazardFlags.length > 1) return false;
  return matches(text, ["office", "software", "consult", "accounting", "marketing", "design", "administrative", "insurance", "real estate"]);
}

function inferIndustryDescription(text: string, track: OshaTrack): string {
  if (track === "construction") {
    if (matches(text, ["electric", "panel", "hvac"])) return "Construction trade work involving electrical or mechanical installation and service";
    if (matches(text, ["roof"])) return "Roofing and elevated exterior construction work";
    return "Construction and field work with changing site conditions";
  }
  if (track === "maritime") return "Maritime or waterfront operations with vessel, dock, or port exposure";
  if (track === "agriculture") return "Agricultural work with outdoor operations, equipment, and seasonal hazards";
  if (matches(text, ["warehouse", "distribution"])) return "Warehouse, distribution, and material handling operations";
  if (matches(text, ["medical", "clinic", "patient"])) return "Healthcare or patient-facing operations";
  if (matches(text, ["manufactur", "fabricat", "machine"])) return "Manufacturing or fabrication operations with equipment exposure";
  return "General industry operations based on the tasks described";
}

function buildFallbackSummary(input: ConsultationRequestInput, track: OshaTrack, hazardFlags: string[]): string {
  const riskPhrase = hazardFlags.length
    ? `likely exposures such as ${hazardFlags.slice(0, 3).join(", ")}`
    : "enough operational activity to warrant a documented OSHA review";

  return `${input.companyName} appears to fall under the ${track.replace("-", " ")} OSHA track, with ${riskPhrase}. The report below focuses on the documents, training controls, and reporting duties most likely to matter first.`;
}

function buildFallbackUlyssesTake(input: ConsultationRequestInput, track: OshaTrack, hazardFlags: string[]): string {
  const hazards = hazardFlags.length
    ? `The usual trouble looks like ${hazardFlags.slice(0, 3).join(", ")}.`
    : "There is still enough going on here that paperwork and training cannot be left to wishful thinking.";
  return `I have seen cleaner situations. ${input.companyName} looks like ${track.replace("-", " ")} work, which means OSHA tends to expect a real system, not a binder collecting dust. ${hazards} If this were my outfit, I would get the core documents, reporting habits, and training cadence under control before OSHA gets curious. They do that from time to time.`;
}

function statePlanAll(stateName: string): StatePlanInfo {
  return {
    stateName,
    coverage: "all",
    note: `${stateName} enforces an OSHA-approved State Plan for private employers. Final poster, reporting, and written-program obligations should be checked against the state-plan office as well as federal OSHA.`,
    citations: [
      {
        title: `${stateName} State Plan Overview`,
        url: OSHA_STATE_PLANS_URL,
        jurisdiction: "state",
        note: "Use the OSHA State Plans directory to reach the official state-plan office.",
      },
    ],
  };
}

function statePlanPublicOnly(stateName: string): StatePlanInfo {
  return {
    stateName,
    coverage: "public-only",
    note: `${stateName} has a State Plan that generally covers public-sector employees only. Private employers are usually covered by federal OSHA there.`,
    citations: [
      {
        title: `${stateName} State Plan Overview`,
        url: OSHA_STATE_PLANS_URL,
        jurisdiction: "state",
      },
    ],
  };
}

function stateLabel(code: string): string {
  return STATE_NAMES[code] || code;
}

function citation(title: string, url: string): ConsultationCitation {
  return { title, url, jurisdiction: "federal" };
}

function matches(text: string, fragments: string[]): boolean {
  return fragments.some((fragment) => text.includes(fragment));
}

function hasAny(values: Set<string>, candidates: string[]): boolean {
  return candidates.some((candidate) => values.has(candidate));
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}
