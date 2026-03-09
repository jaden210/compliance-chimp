export interface StateOption {
  code: string;
  name: string;
}

export type ConsultationRequirementLevel = 'required' | 'conditional' | 'recommended';
export type ConsultationPriority = 'high' | 'medium' | 'low';

export interface ConsultationCitation {
  title: string;
  url: string;
  jurisdiction: 'federal' | 'state';
  note?: string;
}

export interface ConsultationObligation {
  id: string;
  title: string;
  category: string;
  requirementLevel: ConsultationRequirementLevel;
  priority: ConsultationPriority;
  appliesBecause: string;
  details: string[];
  thresholdNotes: string[];
  citations: ConsultationCitation[];
}

export interface ConsultationNextAction {
  title: string;
  description: string;
  priority: ConsultationPriority;
}

export interface ConsultationPrefill {
  companyName: string;
  website: string;
  industryDescription: string;
  state: string;
  employeeCount: number;
  assessmentId?: string;
  importanceScore?: number;
}

export interface ConsultationProfile {
  companyName: string;
  website: string;
  description: string;
  employeeCount: number;
  state: string;
  industryDescription: string;
  oshaTrack: 'general-industry' | 'construction' | 'maritime' | 'agriculture';
  statePlanApplies: boolean;
  statePlanNote: string | null;
  likelyLowHazardPartialExemption: boolean;
  hazardFlags: string[];
  assumptions: string[];
}

export interface ConsultationAssessment {
  assessmentId: string;
  generatedAt: string;
  publicConsultationId?: string;
  publicPath?: string;
  publicUrl?: string;
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

export type ConsultationLeadSourceType = 'api' | 'self-serve';
export type ConsultationLeadDeliveryStatus = 'generated' | 'sent' | 'send_failed';

export interface ConsultationLeadSourceMetadata {
  source?: string;
  campaign?: string;
  externalLeadId?: string;
}

export interface ConsultationLeadRecord {
  id: string;
  assessmentId: string;
  publicConsultationId: string;
  publicPath: string;
  publicUrl: string;
  sourceType: ConsultationLeadSourceType;
  deliveryStatus: ConsultationLeadDeliveryStatus;
  email: string;
  emailHash: string;
  companyName: string;
  website: string;
  state: string;
  employeeCount: number;
  description: string;
  generatedAt: string;
  emailSentAt?: string | null;
  emailError?: string | null;
  sourceMetadata?: ConsultationLeadSourceMetadata;
  assessment: ConsultationAssessment;
  createdAt?: unknown;
  updatedAt?: unknown;
  version: number;
}

export interface LeadJourneyEvent {
  type: 'report_viewed' | 'page_view' | 'cta_clicked' | 'signup_started' | 'step_completed' | 'account_created';
  path?: string;
  timestamp: string;
  detail?: string;
}

export interface LeadJourney {
  leadId?: string;
  ref?: string;
  firstVisitAt?: string;
  lastActivityAt?: string;
  reportViewed?: boolean;
  ctaClicked?: boolean;
  signupStarted?: boolean;
  accountCreated?: boolean;
  teamId?: string;
  events?: LeadJourneyEvent[];
}

export interface PublicConsultationRecord {
  id: string;
  assessmentId: string;
  publicPath: string;
  publicUrl: string;
  companyName: string;
  sourceType: ConsultationLeadSourceType;
  generatedAt: string;
  assessment: ConsultationAssessment;
  leadId?: string | null;
  viewCount?: number;
  lastViewedAt?: unknown;
  journey?: LeadJourney;
  createdAt?: unknown;
  updatedAt?: unknown;
  version: number;
}

export const US_STATE_OPTIONS: StateOption[] = [
  { code: 'AL', name: 'Alabama' },
  { code: 'AK', name: 'Alaska' },
  { code: 'AZ', name: 'Arizona' },
  { code: 'AR', name: 'Arkansas' },
  { code: 'CA', name: 'California' },
  { code: 'CO', name: 'Colorado' },
  { code: 'CT', name: 'Connecticut' },
  { code: 'DE', name: 'Delaware' },
  { code: 'FL', name: 'Florida' },
  { code: 'GA', name: 'Georgia' },
  { code: 'HI', name: 'Hawaii' },
  { code: 'ID', name: 'Idaho' },
  { code: 'IL', name: 'Illinois' },
  { code: 'IN', name: 'Indiana' },
  { code: 'IA', name: 'Iowa' },
  { code: 'KS', name: 'Kansas' },
  { code: 'KY', name: 'Kentucky' },
  { code: 'LA', name: 'Louisiana' },
  { code: 'ME', name: 'Maine' },
  { code: 'MD', name: 'Maryland' },
  { code: 'MA', name: 'Massachusetts' },
  { code: 'MI', name: 'Michigan' },
  { code: 'MN', name: 'Minnesota' },
  { code: 'MS', name: 'Mississippi' },
  { code: 'MO', name: 'Missouri' },
  { code: 'MT', name: 'Montana' },
  { code: 'NE', name: 'Nebraska' },
  { code: 'NV', name: 'Nevada' },
  { code: 'NH', name: 'New Hampshire' },
  { code: 'NJ', name: 'New Jersey' },
  { code: 'NM', name: 'New Mexico' },
  { code: 'NY', name: 'New York' },
  { code: 'NC', name: 'North Carolina' },
  { code: 'ND', name: 'North Dakota' },
  { code: 'OH', name: 'Ohio' },
  { code: 'OK', name: 'Oklahoma' },
  { code: 'OR', name: 'Oregon' },
  { code: 'PA', name: 'Pennsylvania' },
  { code: 'RI', name: 'Rhode Island' },
  { code: 'SC', name: 'South Carolina' },
  { code: 'SD', name: 'South Dakota' },
  { code: 'TN', name: 'Tennessee' },
  { code: 'TX', name: 'Texas' },
  { code: 'UT', name: 'Utah' },
  { code: 'VT', name: 'Vermont' },
  { code: 'VA', name: 'Virginia' },
  { code: 'WA', name: 'Washington' },
  { code: 'WV', name: 'West Virginia' },
  { code: 'WI', name: 'Wisconsin' },
  { code: 'WY', name: 'Wyoming' },
  { code: 'DC', name: 'District of Columbia' },
  { code: 'PR', name: 'Puerto Rico' },
  { code: 'VI', name: 'U.S. Virgin Islands' }
];
