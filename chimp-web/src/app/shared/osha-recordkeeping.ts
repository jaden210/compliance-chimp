import { Team, TeamMember } from "../account/account.service";

export type OshaSex = "male" | "female" | "other" | "unknown";
export type OshaCaseClassification =
  | "death"
  | "days-away"
  | "job-transfer-restriction"
  | "other-recordable"
  | "not-recordable"
  | "near-miss"
  | "pending-review";

export interface OshaAddress {
  street?: string;
  street2?: string;
  city?: string;
  state?: string;
  zip?: string;
}

export interface OshaEstablishmentSnapshot extends OshaAddress {
  name?: string;
  phone?: string;
  email?: string;
}

export interface OshaCase {
  schemaVersion: number;
  caseNumber: string;
  reportType?: string;
  calendarYear: number;
  isRecordable: boolean | null;
  classification: OshaCaseClassification;
  privacyConcernCase: boolean;
  employeeName?: string;
  employeeJobTitle?: string;
  employeeDateOfBirth?: string;
  employeeDateHired?: string;
  employeeSex?: OshaSex;
  employeePhone?: string;
  employeeAddress?: OshaAddress;
  establishment?: OshaEstablishmentSnapshot;
  incidentType?: string;
  incidentDate?: string;
  incidentTime?: string;
  workStartTime?: string;
  incidentLocation?: string;
  witnesses?: string;
  whatWasEmployeeDoing?: string;
  howDidIncidentHappen?: string;
  harmCause?: string;
  bodyPartAffected?: string;
  injuryNature?: string;
  objectOrSubstance?: string;
  preventionNotes?: string;
  physicianName?: string;
  treatmentFacilityName?: string;
  treatmentFacilityAddress?: OshaAddress;
  treatedInEmergencyRoom: boolean;
  hospitalizedOvernight: boolean;
  daysAwayFromWork: number;
  jobTransferOrRestriction: boolean;
  daysJobTransferOrRestriction: number;
  outcomeDescription?: string;
  requiresReview: boolean;
  supplementalQuestionIds?: string[];
  sourceReportId?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface OshaAnnualSummary {
  year: number;
  totalDeaths: number;
  totalDaysAwayCases: number;
  totalJobTransferCases: number;
  totalOtherRecordableCases: number;
  totalRecordableCases: number;
  totalDaysAway: number;
  totalDaysRestricted: number;
}

export interface ReportQuestionLike {
  description?: string;
  fieldId?: string;
  value?: any;
  type?: string;
}

export interface IncidentReportLike {
  id?: string;
  type?: string;
  createdAt?: any;
  oshaCase?: Partial<OshaCase> | null;
  questions?: ReportQuestionLike[];
  submittedBy?: string;
}

const QUESTION_FIELD_ID_FALLBACKS: Record<string, string> = {
  "What is your name?": "employee.name",
  "What is your job title?": "employee.jobTitle",
  "What is your date of hire?": "employee.dateHired",
  "What is the name of your supervisor?": "employee.supervisorName",
  "Date of injury/near miss": "incident.date",
  "What time did you begin work that day? (e.g. 7:00 AM)": "incident.workStartTime",
  "What time did the incident occur? (e.g. 10:30 AM)": "incident.time",
  "Were there any witnesses? (List all)": "incident.witnesses",
  "Where exactly did it happen?": "incident.location",
  "What were you doing at the time? How did it happen?": "incident.activity",
  "Describe step by step what led up to the injury/near miss.": "incident.sequence",
  "What object or substance directly harmed you? (e.g. concrete floor, table saw, ammonia)": "incident.objectOrSubstance",
  "What could have been done to prevent this injury/near miss?": "incident.preventionNotes",
  "Describe in detail the injury. What part or parts of your body were injured? If a near miss, how could you have been hurt?": "incident.injuryDetail",
  "Did you see a doctor about this injury/illness?": "treatment.soughtCare",
  "If yes, who did you see?": "treatment.physicianName",
  "Were you treated in an emergency room?": "treatment.er",
  "Were you hospitalized overnight as an in-patient?": "treatment.hospitalized",
  "Date of your doctor visit": "treatment.visitDate",
  "How many days were you away from work due to this incident? (Enter 0 if none)": "osha.daysAway",
  "Were you placed on restricted work duties or job transfer as a result of this incident?": "osha.restricted",
  "If yes, how many days of restricted work or job transfer?": "osha.restrictedDays",
  "What type of incident occurred?": "incident.type",
  "Name of injured person?": "employee.name",
  "Date of injured person's birth?": "employee.dateOfBirth",
  "Phone number of the injured person?": "employee.phone",
  "Street address of the injured person?": "employee.address.street",
  "Suite or apt number of the injured person?": "employee.address.street2",
  "City of the injured person?": "employee.address.city",
  "State of the injured person?": "employee.address.state",
  "Zipcode of the injured person?": "employee.address.zip",
  "Is this employee male or female?": "employee.sex",
  "Date of event": "incident.date",
  "What was the exact location of the event?": "incident.location",
  "What was the employee doing just before the incident? Describe the specific activity, tools, and equipment involved.": "incident.activity",
  "Describe fully how the accident happened. What sequence of events led to the injury or illness?": "incident.sequence",
  "What are the names of all witnesses?": "incident.witnesses",
  "What caused the event?": "incident.harmCause",
  "What part of the body was injured? Describe in detail:": "incident.bodyPartAffected",
  "What was the nature of the injury or illness? Describe in detail:": "incident.injuryNature",
  "Did the employee go to the doctor, hospital, or ER?": "treatment.soughtCare",
  "Was the employee treated in an emergency room?": "treatment.er",
  "Was the employee hospitalized overnight as an in-patient?": "treatment.hospitalized",
  "Hospital or clinic name": "treatment.facilityName",
  "Name of Doctor": "treatment.physicianName",
  "How many days was the employee away from work as a result of this incident? (Enter 0 if none)": "osha.daysAway",
  "Was the employee placed on restricted work duties or job transfer as a result of this incident?": "osha.restricted",
  "What changes do you suggest to prevent this incident from happening again?": "incident.preventionNotes"
};

export function buildQuestionValueMap(questions: ReportQuestionLike[] = []): Record<string, any> {
  return questions.reduce((acc, question) => {
    const key = question.fieldId || QUESTION_FIELD_ID_FALLBACKS[question.description || ""];
    if (key) {
      acc[key] = question.value;
    }
    return acc;
  }, {} as Record<string, any>);
}

export function toOshaDateString(value: any): string | undefined {
  if (!value) return undefined;
  const date = value?.toDate ? value.toDate() : new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString().slice(0, 10);
}

export function toDisplayDate(value?: string): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric"
  });
}

export function toBoolean(value: any): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "yes" || normalized === "true") return true;
    if (normalized === "no" || normalized === "false") return false;
  }
  return null;
}

export function toNumber(value: any): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const numeric = Number.parseInt(String(value ?? "").trim(), 10);
  return Number.isFinite(numeric) ? numeric : 0;
}

export function buildEstablishmentSnapshot(team?: Team | null): OshaEstablishmentSnapshot {
  return {
    name: team?.name || "",
    phone: team?.phone || "",
    email: team?.email || "",
    street: team?.street || "",
    street2: team?.street2 || "",
    city: team?.city || "",
    state: team?.state || "",
    zip: team?.zip || ""
  };
}

export function buildCaseNumber(report: IncidentReportLike): string {
  const existing = report.oshaCase?.caseNumber;
  if (existing) return existing;
  const seed = (report.id || "pending").slice(0, 8).toUpperCase();
  return `CC-${seed}`;
}

function inferIncidentType(report: IncidentReportLike, values: Record<string, any>): string {
  const reportType = String(values["incident.type"] || report.type || "").toLowerCase();
  if (reportType.includes("near")) return "near-miss";
  if (reportType.includes("death")) return "death";
  if (reportType.includes("illness")) return "illness";
  return reportType.includes("injury") ? "injury" : reportType;
}

function inferClassification(
  incidentType: string,
  daysAwayFromWork: number,
  jobTransferOrRestriction: boolean,
  isRecordable: boolean | null,
  hospitalizedOvernight: boolean
): OshaCaseClassification {
  if (incidentType === "near-miss") return "near-miss";
  if (incidentType === "death") return "death";
  if (isRecordable === false) return "not-recordable";
  if (daysAwayFromWork > 0) return "days-away";
  if (jobTransferOrRestriction) return "job-transfer-restriction";
  if (hospitalizedOvernight) return "other-recordable";
  if (isRecordable === true) return "other-recordable";
  return "pending-review";
}

function inferRecordable(
  incidentType: string,
  daysAwayFromWork: number,
  jobTransferOrRestriction: boolean,
  hospitalizedOvernight: boolean,
  explicitValue: boolean | null
): boolean | null {
  if (explicitValue !== null) return explicitValue;
  if (incidentType === "near-miss") return false;
  if (incidentType === "death") return true;
  if (daysAwayFromWork > 0 || jobTransferOrRestriction || hospitalizedOvernight) return true;
  return null;
}

function normalizeSex(value: any): OshaSex {
  const normalized = String(value || "").toLowerCase();
  if (normalized === "male") return "male";
  if (normalized === "female") return "female";
  if (normalized === "other") return "other";
  return "unknown";
}

export function normalizeOshaCase(
  report: IncidentReportLike,
  team?: Team | null,
  teamMember?: TeamMember | null
): OshaCase {
  const values = buildQuestionValueMap(report.questions);
  const incidentDate = report.oshaCase?.incidentDate || toOshaDateString(values["incident.date"]) || toOshaDateString(report.createdAt);
  const daysAwayFromWork = report.oshaCase?.daysAwayFromWork ?? toNumber(values["osha.daysAway"]);
  const jobTransferOrRestriction =
    report.oshaCase?.jobTransferOrRestriction ??
    (toBoolean(values["osha.restricted"]) ?? toNumber(values["osha.restrictedDays"]) > 0);
  const daysJobTransferOrRestriction =
    report.oshaCase?.daysJobTransferOrRestriction ?? toNumber(values["osha.restrictedDays"]);
  const hospitalizedOvernight =
    report.oshaCase?.hospitalizedOvernight ?? Boolean(toBoolean(values["treatment.hospitalized"]));
  const incidentType = report.oshaCase?.incidentType || inferIncidentType(report, values);
  const isRecordable = inferRecordable(
    incidentType,
    daysAwayFromWork,
    jobTransferOrRestriction,
    hospitalizedOvernight,
    report.oshaCase?.isRecordable ?? toBoolean(values["osha.isRecordable"])
  );
  const classification =
    report.oshaCase?.classification ||
    inferClassification(
      incidentType,
      daysAwayFromWork,
      jobTransferOrRestriction,
      isRecordable,
      hospitalizedOvernight
    );

  const createdAt = report.createdAt?.toDate ? report.createdAt.toDate() : new Date(report.createdAt || Date.now());
  const calendarYear = report.oshaCase?.calendarYear || new Date(incidentDate || createdAt).getFullYear();
  const treatmentFacilityAddress = report.oshaCase?.treatmentFacilityAddress || {
    street: values["treatment.facilityAddress.street"] || "",
    street2: values["treatment.facilityAddress.street2"] || "",
    city: values["treatment.facilityAddress.city"] || "",
    state: values["treatment.facilityAddress.state"] || "",
    zip: values["treatment.facilityAddress.zip"] || ""
  };

  return {
    schemaVersion: 1,
    caseNumber: buildCaseNumber(report),
    reportType: report.type || "",
    calendarYear,
    isRecordable,
    classification,
    privacyConcernCase:
      report.oshaCase?.privacyConcernCase ??
      Boolean(toBoolean(values["osha.privacyConcernCase"])),
    employeeName:
      report.oshaCase?.employeeName ||
      values["employee.name"] ||
      teamMember?.name ||
      "",
    employeeJobTitle:
      report.oshaCase?.employeeJobTitle ||
      values["employee.jobTitle"] ||
      teamMember?.jobTitle ||
      "",
    employeeDateOfBirth:
      report.oshaCase?.employeeDateOfBirth ||
      toOshaDateString(values["employee.dateOfBirth"]),
    employeeDateHired:
      report.oshaCase?.employeeDateHired ||
      toOshaDateString(values["employee.dateHired"]),
    employeeSex: report.oshaCase?.employeeSex || normalizeSex(values["employee.sex"]),
    employeePhone:
      report.oshaCase?.employeePhone ||
      values["employee.phone"] ||
      "",
    employeeAddress: report.oshaCase?.employeeAddress || {
      street: values["employee.address.street"] || "",
      street2: values["employee.address.street2"] || "",
      city: values["employee.address.city"] || "",
      state: values["employee.address.state"] || "",
      zip: values["employee.address.zip"] || ""
    },
    establishment: report.oshaCase?.establishment || buildEstablishmentSnapshot(team),
    incidentType,
    incidentDate,
    incidentTime: report.oshaCase?.incidentTime || values["incident.time"] || "",
    workStartTime: report.oshaCase?.workStartTime || values["incident.workStartTime"] || "",
    incidentLocation: report.oshaCase?.incidentLocation || values["incident.location"] || "",
    witnesses: report.oshaCase?.witnesses || values["incident.witnesses"] || "",
    whatWasEmployeeDoing:
      report.oshaCase?.whatWasEmployeeDoing ||
      values["incident.activity"] ||
      "",
    howDidIncidentHappen:
      report.oshaCase?.howDidIncidentHappen ||
      values["incident.sequence"] ||
      "",
    harmCause:
      report.oshaCase?.harmCause ||
      values["incident.harmCause"] ||
      "",
    bodyPartAffected:
      report.oshaCase?.bodyPartAffected ||
      values["incident.bodyPartAffected"] ||
      values["incident.injuryDetail"] ||
      "",
    injuryNature:
      report.oshaCase?.injuryNature ||
      values["incident.injuryNature"] ||
      "",
    objectOrSubstance:
      report.oshaCase?.objectOrSubstance ||
      values["incident.objectOrSubstance"] ||
      "",
    preventionNotes:
      report.oshaCase?.preventionNotes ||
      values["incident.preventionNotes"] ||
      "",
    physicianName:
      report.oshaCase?.physicianName ||
      values["treatment.physicianName"] ||
      "",
    treatmentFacilityName:
      report.oshaCase?.treatmentFacilityName ||
      values["treatment.facilityName"] ||
      "",
    treatmentFacilityAddress,
    treatedInEmergencyRoom:
      report.oshaCase?.treatedInEmergencyRoom ??
      Boolean(toBoolean(values["treatment.er"])),
    hospitalizedOvernight,
    daysAwayFromWork,
    jobTransferOrRestriction,
    daysJobTransferOrRestriction,
    outcomeDescription:
      report.oshaCase?.outcomeDescription ||
      buildOutcomeDescription(classification, daysAwayFromWork, daysJobTransferOrRestriction),
    requiresReview:
      (report.oshaCase?.requiresReview ?? false) ||
      isRecordable === null ||
      classification === "pending-review",
    supplementalQuestionIds: [],
    sourceReportId: report.id || "",
    createdAt: createdAt.toISOString(),
    updatedAt: new Date().toISOString()
  };
}

export function buildOutcomeDescription(
  classification: OshaCaseClassification,
  daysAwayFromWork: number,
  daysRestricted: number
): string {
  if (classification === "death") return "Death";
  if (classification === "near-miss") return "Near miss only";
  if (classification === "days-away") {
    return `${daysAwayFromWork || 0} day(s) away from work`;
  }
  if (classification === "job-transfer-restriction") {
    return `${daysRestricted || 0} restricted or transferred day(s)`;
  }
  if (classification === "other-recordable") return "Other OSHA-recordable case";
  if (classification === "not-recordable") return "Not OSHA recordable";
  return "Pending manager review";
}

export function summarizeAnnualCases(cases: OshaCase[]): OshaAnnualSummary {
  return cases.reduce(
    (summary, current) => {
      if (current.classification === "death") summary.totalDeaths += 1;
      if (current.classification === "days-away") summary.totalDaysAwayCases += 1;
      if (current.classification === "job-transfer-restriction") summary.totalJobTransferCases += 1;
      if (current.classification === "other-recordable") summary.totalOtherRecordableCases += 1;
      if (current.isRecordable) summary.totalRecordableCases += 1;
      summary.totalDaysAway += current.daysAwayFromWork || 0;
      summary.totalDaysRestricted += current.daysJobTransferOrRestriction || 0;
      return summary;
    },
    {
      year: cases[0]?.calendarYear || new Date().getFullYear(),
      totalDeaths: 0,
      totalDaysAwayCases: 0,
      totalJobTransferCases: 0,
      totalOtherRecordableCases: 0,
      totalRecordableCases: 0,
      totalDaysAway: 0,
      totalDaysRestricted: 0
    } satisfies OshaAnnualSummary
  );
}

export function formatAddress(address?: OshaAddress | null): string {
  if (!address) return "—";
  const parts = [
    address.street,
    address.street2,
    [address.city, address.state].filter(Boolean).join(", "),
    address.zip
  ].filter(Boolean);
  return parts.length ? parts.join(", ") : "—";
}
