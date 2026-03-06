// ============================================================
// ComplianceChimp — Shared Firestore Data Models
// ============================================================

export type CandidateStatus =
  | 'new'
  | 'audited'
  | 'contacted'
  | 'clicked'
  | 'signed_up'
  | 'disqualified';

export type Industry =
  | 'auto_repair'
  | 'roofing'
  | 'general_contractor'
  | 'hvac'
  | 'plumbing'
  | 'landscaping'
  | 'manufacturing'
  | 'warehouse_logistics'
  | 'electrical'
  | 'welding_fabrication'
  | 'other';

export interface Candidate {
  id?: string;
  businessName: string;
  address: string;
  city: string;
  state: string;
  industry: Industry;
  googleMapsPlaceId: string;
  websiteUrl?: string;
  reviewCount: number;
  avgRating: number;
  employeeEst?: string;
  fitScore: number;
  status: CandidateStatus;
  contactEmail?: string;
  contactPhone?: string;
  notes?: string;
  dateAdded: FirestoreTimestamp;
  reportId?: string;
  reportToken?: string;
  reportUrl?: string;
  outreachId?: string;
}

export type ViolationSeverity = 'critical' | 'serious' | 'moderate' | 'minor';
export type ViolationStatus = 'likely_missing' | 'uncertain' | 'likely_ok';

export interface OshaViolation {
  cfr: string;
  title: string;
  description: string;
  status: ViolationStatus;
  severity: ViolationSeverity;
  finePerIncident: number;
  fineType: 'serious' | 'willful' | 'other_than_serious';
  evidenceBasis: string;
}

export type ComplianceGrade = 'A' | 'B' | 'C' | 'D' | 'F';

export interface Report {
  id?: string;
  candidateId: string;
  businessName: string;
  city: string;
  state: string;
  industry: Industry;
  grade: ComplianceGrade;
  totalFineExposure: number;
  violations: OshaViolation[];
  industryOshaStandardSet: string[];
  reportToken: string;
  reportUrl: string;
  generatedAt: FirestoreTimestamp;
  auditorNotes?: string;
  industryAvgFine?: number;
  industryFineContext?: string;
}

export type AbVariant = 'A_score_hook' | 'B_gap_count_hook';

export interface Outreach {
  id?: string;
  candidateId: string;
  reportId: string;
  businessName: string;
  emailSentTo: string;
  subjectLine: string;
  abVariant: AbVariant;
  bodyHtml: string;
  sentAt: FirestoreTimestamp;
  firstClickAt?: FirestoreTimestamp;
  clickCount: number;
  signedUp: boolean;
  replyReceived: boolean;
  replyText?: string;
  daysToClick?: number;
  notes?: string;
}

export type EngagementEventType = 'page_view' | 'cta_click' | 'trial_signup';

export interface EngagementEvent {
  id?: string;
  reportToken: string;
  candidateId: string;
  outreachId?: string;
  eventType: EngagementEventType;
  occurredAt: FirestoreTimestamp;
  userAgent?: string;
  ipHash?: string;
}

export type FirestoreTimestamp = { seconds: number; nanoseconds: number } | Date;

export interface OshaStandard {
  cfr: string;
  title: string;
  fineType: 'serious' | 'willful' | 'other_than_serious';
  finePerIncident: number;
}

export const INDUSTRY_OSHA_STANDARDS: Record<Industry, OshaStandard[]> = {
  auto_repair: [
    { cfr: '29 CFR 1910.1200', title: 'Hazard Communication (chemicals/fluids)', fineType: 'serious', finePerIncident: 16550 },
    { cfr: '29 CFR 1910.147', title: 'Lockout/Tagout (vehicle lifts & equipment)', fineType: 'serious', finePerIncident: 16550 },
    { cfr: '29 CFR 1910.134', title: 'Respiratory Protection (paint fumes, exhaust)', fineType: 'serious', finePerIncident: 16550 },
    { cfr: '29 CFR 1910.132', title: 'Personal Protective Equipment', fineType: 'serious', finePerIncident: 16550 },
    { cfr: '29 CFR 1910.303', title: 'Electrical Safety', fineType: 'serious', finePerIncident: 16550 },
    { cfr: '29 CFR 1910.178', title: 'Powered Industrial Trucks (lifts)', fineType: 'serious', finePerIncident: 16550 },
    { cfr: '29 CFR 1904', title: 'Injury & Illness Recordkeeping', fineType: 'other_than_serious', finePerIncident: 16550 },
  ],
  roofing: [
    { cfr: '29 CFR 1926.501', title: 'Fall Protection — General Requirements', fineType: 'willful', finePerIncident: 165514 },
    { cfr: '29 CFR 1926.503', title: 'Fall Protection — Training', fineType: 'serious', finePerIncident: 16550 },
    { cfr: '29 CFR 1926.1053', title: 'Ladders', fineType: 'serious', finePerIncident: 16550 },
    { cfr: '29 CFR 1926.451', title: 'Scaffolding', fineType: 'serious', finePerIncident: 16550 },
    { cfr: '29 CFR 1910.1200', title: 'Hazard Communication', fineType: 'serious', finePerIncident: 16550 },
    { cfr: '29 CFR 1926.102', title: 'Eye & Face Protection', fineType: 'serious', finePerIncident: 16550 },
    { cfr: '29 CFR 1904', title: 'Injury & Illness Recordkeeping', fineType: 'other_than_serious', finePerIncident: 16550 },
  ],
  general_contractor: [
    { cfr: '29 CFR 1926.501', title: 'Fall Protection — General Requirements', fineType: 'willful', finePerIncident: 165514 },
    { cfr: '29 CFR 1926.503', title: 'Fall Protection — Training', fineType: 'serious', finePerIncident: 16550 },
    { cfr: '29 CFR 1926.1053', title: 'Ladders', fineType: 'serious', finePerIncident: 16550 },
    { cfr: '29 CFR 1910.1200', title: 'Hazard Communication', fineType: 'serious', finePerIncident: 16550 },
    { cfr: '29 CFR 1926.451', title: 'Scaffolding', fineType: 'serious', finePerIncident: 16550 },
    { cfr: '29 CFR 1926.102', title: 'Eye & Face Protection', fineType: 'serious', finePerIncident: 16550 },
    { cfr: '29 CFR 1910.147', title: 'Lockout/Tagout', fineType: 'serious', finePerIncident: 16550 },
    { cfr: '29 CFR 1904', title: 'Injury & Illness Recordkeeping', fineType: 'other_than_serious', finePerIncident: 16550 },
  ],
  hvac: [
    { cfr: '29 CFR 1910.147', title: 'Lockout/Tagout', fineType: 'serious', finePerIncident: 16550 },
    { cfr: '29 CFR 1910.1200', title: 'Hazard Communication (refrigerants)', fineType: 'serious', finePerIncident: 16550 },
    { cfr: '29 CFR 1926.501', title: 'Fall Protection (rooftop units)', fineType: 'willful', finePerIncident: 165514 },
    { cfr: '29 CFR 1910.134', title: 'Respiratory Protection', fineType: 'serious', finePerIncident: 16550 },
    { cfr: '29 CFR 1910.303', title: 'Electrical Safety', fineType: 'serious', finePerIncident: 16550 },
    { cfr: '29 CFR 1910.132', title: 'Personal Protective Equipment', fineType: 'serious', finePerIncident: 16550 },
    { cfr: '29 CFR 1904', title: 'Injury & Illness Recordkeeping', fineType: 'other_than_serious', finePerIncident: 16550 },
  ],
  plumbing: [
    { cfr: '29 CFR 1926.651', title: 'Excavation & Trenching', fineType: 'willful', finePerIncident: 165514 },
    { cfr: '29 CFR 1910.146', title: 'Confined Space Entry', fineType: 'serious', finePerIncident: 16550 },
    { cfr: '29 CFR 1910.147', title: 'Lockout/Tagout', fineType: 'serious', finePerIncident: 16550 },
    { cfr: '29 CFR 1910.1200', title: 'Hazard Communication', fineType: 'serious', finePerIncident: 16550 },
    { cfr: '29 CFR 1910.132', title: 'Personal Protective Equipment', fineType: 'serious', finePerIncident: 16550 },
    { cfr: '29 CFR 1904', title: 'Injury & Illness Recordkeeping', fineType: 'other_than_serious', finePerIncident: 16550 },
  ],
  landscaping: [
    { cfr: '29 CFR 1928.57', title: 'Machinery & Equipment Safety', fineType: 'serious', finePerIncident: 16550 },
    { cfr: '29 CFR 1910.1200', title: 'Hazard Communication (pesticides/herbicides)', fineType: 'serious', finePerIncident: 16550 },
    { cfr: '29 CFR 1910.132', title: 'Personal Protective Equipment', fineType: 'serious', finePerIncident: 16550 },
    { cfr: '29 CFR 1910.212', title: 'Machine Guarding (mowers/chippers)', fineType: 'serious', finePerIncident: 16550 },
    { cfr: '29 CFR 1904', title: 'Injury & Illness Recordkeeping', fineType: 'other_than_serious', finePerIncident: 16550 },
  ],
  manufacturing: [
    { cfr: '29 CFR 1910.212', title: 'Machine Guarding', fineType: 'serious', finePerIncident: 16550 },
    { cfr: '29 CFR 1910.147', title: 'Lockout/Tagout', fineType: 'serious', finePerIncident: 16550 },
    { cfr: '29 CFR 1910.1200', title: 'Hazard Communication', fineType: 'serious', finePerIncident: 16550 },
    { cfr: '29 CFR 1910.134', title: 'Respiratory Protection', fineType: 'serious', finePerIncident: 16550 },
    { cfr: '29 CFR 1910.178', title: 'Powered Industrial Trucks (forklifts)', fineType: 'serious', finePerIncident: 16550 },
    { cfr: '29 CFR 1910.303', title: 'Electrical Safety', fineType: 'serious', finePerIncident: 16550 },
    { cfr: '29 CFR 1910.132', title: 'Personal Protective Equipment', fineType: 'serious', finePerIncident: 16550 },
    { cfr: '29 CFR 1904', title: 'Injury & Illness Recordkeeping', fineType: 'other_than_serious', finePerIncident: 16550 },
  ],
  warehouse_logistics: [
    { cfr: '29 CFR 1910.178', title: 'Powered Industrial Trucks (forklifts)', fineType: 'serious', finePerIncident: 16550 },
    { cfr: '29 CFR 1910.147', title: 'Lockout/Tagout', fineType: 'serious', finePerIncident: 16550 },
    { cfr: '29 CFR 1910.1200', title: 'Hazard Communication', fineType: 'serious', finePerIncident: 16550 },
    { cfr: '29 CFR 1910.176', title: 'Materials Handling & Storage', fineType: 'serious', finePerIncident: 16550 },
    { cfr: '29 CFR 1910.132', title: 'Personal Protective Equipment', fineType: 'serious', finePerIncident: 16550 },
    { cfr: '29 CFR 1910.36', title: 'Exit Routes', fineType: 'serious', finePerIncident: 16550 },
    { cfr: '29 CFR 1904', title: 'Injury & Illness Recordkeeping', fineType: 'other_than_serious', finePerIncident: 16550 },
  ],
  electrical: [
    { cfr: '29 CFR 1910.303', title: 'Electrical — General Requirements', fineType: 'serious', finePerIncident: 16550 },
    { cfr: '29 CFR 1910.333', title: 'Electrical Safety Work Practices', fineType: 'serious', finePerIncident: 16550 },
    { cfr: '29 CFR 1910.147', title: 'Lockout/Tagout', fineType: 'willful', finePerIncident: 165514 },
    { cfr: '29 CFR 1926.501', title: 'Fall Protection', fineType: 'willful', finePerIncident: 165514 },
    { cfr: '29 CFR 1910.1200', title: 'Hazard Communication', fineType: 'serious', finePerIncident: 16550 },
    { cfr: '29 CFR 1910.132', title: 'Personal Protective Equipment', fineType: 'serious', finePerIncident: 16550 },
    { cfr: '29 CFR 1904', title: 'Injury & Illness Recordkeeping', fineType: 'other_than_serious', finePerIncident: 16550 },
  ],
  welding_fabrication: [
    { cfr: '29 CFR 1910.252', title: 'Welding, Cutting & Brazing', fineType: 'serious', finePerIncident: 16550 },
    { cfr: '29 CFR 1910.134', title: 'Respiratory Protection (fumes)', fineType: 'serious', finePerIncident: 16550 },
    { cfr: '29 CFR 1910.1200', title: 'Hazard Communication', fineType: 'serious', finePerIncident: 16550 },
    { cfr: '29 CFR 1910.132', title: 'Personal Protective Equipment (face shields, gloves)', fineType: 'serious', finePerIncident: 16550 },
    { cfr: '29 CFR 1910.147', title: 'Lockout/Tagout', fineType: 'serious', finePerIncident: 16550 },
    { cfr: '29 CFR 1910.212', title: 'Machine Guarding', fineType: 'serious', finePerIncident: 16550 },
    { cfr: '29 CFR 1904', title: 'Injury & Illness Recordkeeping', fineType: 'other_than_serious', finePerIncident: 16550 },
  ],
  other: [
    { cfr: '29 CFR 1910.1200', title: 'Hazard Communication', fineType: 'serious', finePerIncident: 16550 },
    { cfr: '29 CFR 1910.132', title: 'Personal Protective Equipment', fineType: 'serious', finePerIncident: 16550 },
    { cfr: '29 CFR 1904', title: 'Injury & Illness Recordkeeping', fineType: 'other_than_serious', finePerIncident: 16550 },
  ],
};

export const INDUSTRY_FINE_CONTEXT: Record<Industry, { avgFine: number; context: string }> = {
  auto_repair: { avgFine: 18200, context: 'Auto repair shops averaged $18,200 in OSHA fines in 2024.' },
  roofing: { avgFine: 41500, context: 'Roofing contractors averaged $41,500 in OSHA fines in 2024 - the highest of any trade.' },
  general_contractor: { avgFine: 28400, context: 'General contractors averaged $28,400 in OSHA fines in 2024.' },
  hvac: { avgFine: 21000, context: 'HVAC companies averaged $21,000 in OSHA fines in 2024.' },
  plumbing: { avgFine: 19500, context: 'Plumbing contractors averaged $19,500 in OSHA fines in 2024.' },
  landscaping: { avgFine: 14800, context: 'Landscaping businesses averaged $14,800 in OSHA fines in 2024.' },
  manufacturing: { avgFine: 32600, context: 'Manufacturing facilities averaged $32,600 in OSHA fines in 2024.' },
  warehouse_logistics: { avgFine: 24300, context: 'Warehouse and logistics operations averaged $24,300 in OSHA fines in 2024.' },
  electrical: { avgFine: 35100, context: 'Electrical contractors averaged $35,100 in OSHA fines in 2024.' },
  welding_fabrication: { avgFine: 27800, context: 'Welding and fabrication shops averaged $27,800 in OSHA fines in 2024.' },
  other: { avgFine: 16500, context: 'Businesses in your industry averaged $16,500 in OSHA fines in 2024.' },
};

export const INDUSTRY_SEARCH_TERMS: Record<Industry, string[]> = {
  auto_repair: ['auto repair shop', 'car mechanic', 'auto body shop', 'transmission repair'],
  roofing: ['roofing contractor', 'roof repair', 'roofing company'],
  general_contractor: ['general contractor', 'construction company', 'remodeling contractor'],
  hvac: ['HVAC contractor', 'air conditioning repair', 'heating cooling company'],
  plumbing: ['plumber', 'plumbing contractor', 'plumbing company'],
  landscaping: ['landscaping company', 'lawn care service', 'landscape contractor'],
  manufacturing: ['manufacturing company', 'fabrication shop', 'production facility'],
  warehouse_logistics: ['warehouse', 'logistics company', 'distribution center', 'storage facility'],
  electrical: ['electrician', 'electrical contractor', 'electrical company'],
  welding_fabrication: ['welding shop', 'metal fabrication', 'welding company'],
  other: ['small business'],
};
