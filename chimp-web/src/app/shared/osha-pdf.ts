import { jsPDF } from "jspdf";
import {
  OshaAnnualSummary,
  OshaCase,
  OshaEstablishmentSnapshot,
  formatAddress,
  toDisplayDate
} from "./osha-recordkeeping";

function addTitle(doc: jsPDF, title: string, subtitle?: string): number {
  let y = 0.75;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text(title, 0.75, y);
  y += 0.25;
  if (subtitle) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(subtitle, 0.75, y);
    y += 0.25;
  }
  doc.setDrawColor(210, 210, 210);
  doc.line(0.75, y, 7.75, y);
  return y + 0.2;
}

function addKeyValue(doc: jsPDF, y: number, label: string, value: string, x = 0.75, width = 3.15): number {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text(label, x, y);
  doc.setFont("helvetica", "normal");
  const lines = doc.splitTextToSize(value || "—", width);
  doc.text(lines, x, y + 0.16);
  return y + 0.16 + (lines.length * 0.16) + 0.08;
}

function addSectionHeading(doc: jsPDF, y: number, title: string): number {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text(title, 0.75, y);
  doc.setDrawColor(230, 230, 230);
  doc.line(0.75, y + 0.06, 7.75, y + 0.06);
  return y + 0.2;
}

export function exportOsha301Pdf(oshaCase: OshaCase): void {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "in",
    format: [8.5, 11]
  });

  let y = addTitle(
    doc,
    "OSHA Form 301 Equivalent Incident Report",
    `Case ${oshaCase.caseNumber} • ${oshaCase.establishment?.name || "Establishment"}`
  );

  y = addSectionHeading(doc, y, "Employee Information");
  y = addKeyValue(doc, y, "Employee name", oshaCase.employeeName || "", 0.75, 3);
  y = addKeyValue(doc, y - 0.86, "Job title", oshaCase.employeeJobTitle || "", 4.25, 3);
  y = addKeyValue(doc, y, "Date of birth", toDisplayDate(oshaCase.employeeDateOfBirth), 0.75, 3);
  y = addKeyValue(doc, y - 0.56, "Date hired", toDisplayDate(oshaCase.employeeDateHired), 4.25, 3);
  y = addKeyValue(doc, y, "Phone", oshaCase.employeePhone || "", 0.75, 3);
  y = addKeyValue(doc, y - 0.36, "Sex", oshaCase.employeeSex || "unknown", 4.25, 3);
  y = addKeyValue(doc, y, "Address", formatAddress(oshaCase.employeeAddress), 0.75, 6.8);

  y = addSectionHeading(doc, y + 0.1, "Incident Information");
  y = addKeyValue(doc, y, "Type", oshaCase.incidentType || "", 0.75, 2.5);
  y = addKeyValue(doc, y - 0.36, "Date", toDisplayDate(oshaCase.incidentDate), 3.1, 2);
  y = addKeyValue(doc, y - 0.36, "Time", oshaCase.incidentTime || "", 5.25, 2);
  y = addKeyValue(doc, y, "Time employee began work", oshaCase.workStartTime || "", 0.75, 3);
  y = addKeyValue(doc, y - 0.36, "Location", oshaCase.incidentLocation || "", 4.25, 3);
  y = addKeyValue(doc, y, "What was the employee doing just before the incident?", oshaCase.whatWasEmployeeDoing || "", 0.75, 6.8);
  y = addKeyValue(doc, y, "How did the incident happen?", oshaCase.howDidIncidentHappen || "", 0.75, 6.8);
  y = addKeyValue(doc, y, "What was the injury or illness?", oshaCase.injuryNature || "", 0.75, 3);
  y = addKeyValue(doc, y - 0.36, "Body part affected", oshaCase.bodyPartAffected || "", 4.25, 3);
  y = addKeyValue(doc, y, "Object or substance that harmed the employee", oshaCase.objectOrSubstance || "", 0.75, 6.8);

  y = addSectionHeading(doc, y + 0.1, "Treatment Information");
  y = addKeyValue(doc, y, "Physician or health care professional", oshaCase.physicianName || "", 0.75, 3);
  y = addKeyValue(doc, y - 0.36, "Facility", oshaCase.treatmentFacilityName || "", 4.25, 3);
  y = addKeyValue(doc, y, "Facility address", formatAddress(oshaCase.treatmentFacilityAddress), 0.75, 6.8);
  y = addKeyValue(doc, y, "Emergency room treatment", oshaCase.treatedInEmergencyRoom ? "Yes" : "No", 0.75, 3);
  y = addKeyValue(doc, y - 0.36, "Hospitalized overnight", oshaCase.hospitalizedOvernight ? "Yes" : "No", 4.25, 3);

  y = addSectionHeading(doc, y + 0.1, "OSHA Review");
  y = addKeyValue(doc, y, "Recordable", oshaCase.isRecordable === null ? "Pending review" : oshaCase.isRecordable ? "Yes" : "No", 0.75, 3);
  y = addKeyValue(doc, y - 0.36, "Classification", oshaCase.classification, 4.25, 3);
  y = addKeyValue(doc, y, "Days away from work", String(oshaCase.daysAwayFromWork || 0), 0.75, 3);
  y = addKeyValue(doc, y - 0.36, "Days restricted / transferred", String(oshaCase.daysJobTransferOrRestriction || 0), 4.25, 3);
  y = addKeyValue(doc, y, "Privacy concern case", oshaCase.privacyConcernCase ? "Yes" : "No", 0.75, 3);
  addKeyValue(doc, y - 0.36, "Outcome", oshaCase.outcomeDescription || "", 4.25, 3);

  const filename = `${oshaCase.caseNumber}-osha-301-equivalent.pdf`;
  doc.save(filename);
}

export function exportOsha300LogPdf(
  establishment: OshaEstablishmentSnapshot | undefined,
  year: number,
  cases: OshaCase[]
): void {
  const doc = new jsPDF({ orientation: "landscape", unit: "in", format: [11, 8.5] });
  let y = addTitle(
    doc,
    "OSHA Form 300 Equivalent Log",
    `${establishment?.name || "Establishment"} • ${year}`
  );

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  const columns = [
    ["Case", 0.75],
    ["Employee", 1.55],
    ["Date", 3.3],
    ["Where", 4.15],
    ["Description", 5.8],
    ["Class", 8.2],
    ["Days Away", 9.3],
    ["Restricted", 10.0]
  ] as const;
  columns.forEach(([label, x]) => doc.text(label, x, y));
  y += 0.1;
  doc.line(0.75, y, 10.4, y);
  y += 0.18;

  doc.setFont("helvetica", "normal");
  cases.forEach(oshaCase => {
    if (y > 7.75) {
      doc.addPage();
      y = addTitle(doc, "OSHA Form 300 Equivalent Log", `${establishment?.name || "Establishment"} • ${year}`);
    }
    const employeeName = oshaCase.privacyConcernCase ? "Privacy case" : (oshaCase.employeeName || "—");
    const row = [
      oshaCase.caseNumber,
      employeeName,
      toDisplayDate(oshaCase.incidentDate),
      oshaCase.incidentLocation || "—",
      oshaCase.injuryNature || oshaCase.howDidIncidentHappen || "—",
      oshaCase.classification,
      String(oshaCase.daysAwayFromWork || 0),
      String(oshaCase.daysJobTransferOrRestriction || 0)
    ];
    const wrapped = row.map((value, index) =>
      doc.splitTextToSize(value, [0.7, 1.6, 0.75, 1.5, 2.25, 0.95, 0.55, 0.45][index])
    );
    const rowHeight = Math.max(...wrapped.map(lines => lines.length), 1) * 0.16 + 0.04;
    wrapped.forEach((lines, index) => {
      doc.text(lines, columns[index][1], y);
    });
    y += rowHeight;
    doc.setDrawColor(240, 240, 240);
    doc.line(0.75, y - 0.06, 10.4, y - 0.06);
  });

  doc.save(`${year}-osha-300-equivalent-log.pdf`);
}

export function exportOsha300ASummaryPdf(
  establishment: OshaEstablishmentSnapshot | undefined,
  summary: OshaAnnualSummary,
  certification?: { certifierName?: string; certifierTitle?: string; certifiedAt?: string }
): void {
  const doc = new jsPDF({ orientation: "portrait", unit: "in", format: [8.5, 11] });
  let y = addTitle(
    doc,
    "OSHA Form 300A Equivalent Summary",
    `${establishment?.name || "Establishment"} • ${summary.year}`
  );

  y = addSectionHeading(doc, y, "Establishment");
  y = addKeyValue(doc, y, "Name", establishment?.name || "", 0.75, 3);
  y = addKeyValue(doc, y - 0.36, "Address", formatAddress(establishment), 4.25, 3);

  y = addSectionHeading(doc, y + 0.1, "Annual Totals");
  y = addKeyValue(doc, y, "Deaths", String(summary.totalDeaths), 0.75, 2);
  y = addKeyValue(doc, y - 0.36, "Days away cases", String(summary.totalDaysAwayCases), 2.5, 2);
  y = addKeyValue(doc, y - 0.36, "Restricted / transfer cases", String(summary.totalJobTransferCases), 4.55, 2.2);
  y = addKeyValue(doc, y - 0.36, "Other recordable cases", String(summary.totalOtherRecordableCases), 6.95, 1.3);
  y = addKeyValue(doc, y, "Total recordable cases", String(summary.totalRecordableCases), 0.75, 3);
  y = addKeyValue(doc, y - 0.36, "Total days away", String(summary.totalDaysAway), 4.25, 3);
  y = addKeyValue(doc, y, "Total restricted days", String(summary.totalDaysRestricted), 0.75, 3);

  y = addSectionHeading(doc, y + 0.1, "Certification");
  y = addKeyValue(doc, y, "Certified by", certification?.certifierName || "—", 0.75, 3);
  y = addKeyValue(doc, y - 0.36, "Title", certification?.certifierTitle || "—", 4.25, 3);
  addKeyValue(doc, y, "Certification date", toDisplayDate(certification?.certifiedAt), 0.75, 3);

  doc.save(`${summary.year}-osha-300a-equivalent-summary.pdf`);
}

export function exportInspectionPacketPdf(
  establishment: OshaEstablishmentSnapshot | undefined,
  summary: OshaAnnualSummary,
  cases: OshaCase[]
): void {
  const doc = new jsPDF({ orientation: "portrait", unit: "in", format: [8.5, 11] });
  let y = addTitle(
    doc,
    "OSHA Inspection Packet",
    `${establishment?.name || "Establishment"} • ${summary.year}`
  );

  y = addSectionHeading(doc, y, "Included Documents");
  [
    "OSHA 300A equivalent annual summary",
    "OSHA 300 equivalent log",
    `${cases.length} linked OSHA 301 equivalent case summaries`
  ].forEach(item => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.text(`• ${item}`, 0.95, y);
    y += 0.2;
  });

  y = addSectionHeading(doc, y + 0.1, "300A Snapshot");
  y = addKeyValue(doc, y, "Total recordable cases", String(summary.totalRecordableCases), 0.75, 2.5);
  y = addKeyValue(doc, y - 0.36, "Deaths", String(summary.totalDeaths), 3.5, 2);
  y = addKeyValue(doc, y - 0.36, "Days away cases", String(summary.totalDaysAwayCases), 5.35, 2.2);

  doc.addPage();
  y = addTitle(doc, "OSHA 300 Equivalent Log", `${establishment?.name || "Establishment"} • ${summary.year}`);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("Case", 0.75, y);
  doc.text("Employee", 1.65, y);
  doc.text("Classification", 4.2, y);
  doc.text("Date", 6.1, y);
  y += 0.18;
  doc.line(0.75, y, 7.75, y);
  y += 0.18;
  doc.setFont("helvetica", "normal");

  cases.forEach(oshaCase => {
    if (y > 10.0) {
      doc.addPage();
      y = addTitle(doc, "OSHA 300 Equivalent Log", `${establishment?.name || "Establishment"} • ${summary.year}`);
    }
    doc.text(oshaCase.caseNumber, 0.75, y);
    doc.text(oshaCase.privacyConcernCase ? "Privacy case" : (oshaCase.employeeName || "—"), 1.65, y);
    doc.text(oshaCase.classification, 4.2, y);
    doc.text(toDisplayDate(oshaCase.incidentDate), 6.1, y);
    y += 0.22;
  });

  cases.forEach(oshaCase => {
    doc.addPage();
    y = addTitle(doc, "OSHA 301 Equivalent Case Summary", `${oshaCase.caseNumber} • ${oshaCase.employeeName || "Employee"}`);
    y = addKeyValue(doc, y, "Incident date", toDisplayDate(oshaCase.incidentDate), 0.75, 3);
    y = addKeyValue(doc, y - 0.36, "Incident type", oshaCase.incidentType || "—", 4.25, 3);
    y = addKeyValue(doc, y, "Location", oshaCase.incidentLocation || "—", 0.75, 6.8);
    y = addKeyValue(doc, y, "How it happened", oshaCase.howDidIncidentHappen || "—", 0.75, 6.8);
    y = addKeyValue(doc, y, "Injury / illness", oshaCase.injuryNature || "—", 0.75, 3);
    y = addKeyValue(doc, y - 0.36, "Body part", oshaCase.bodyPartAffected || "—", 4.25, 3);
    y = addKeyValue(doc, y, "Treatment facility", oshaCase.treatmentFacilityName || "—", 0.75, 3);
    y = addKeyValue(doc, y - 0.36, "Physician", oshaCase.physicianName || "—", 4.25, 3);
    y = addKeyValue(doc, y, "Classification", oshaCase.classification, 0.75, 3);
    addKeyValue(doc, y - 0.36, "Outcome", oshaCase.outcomeDescription || "—", 4.25, 3);
  });

  doc.save(`${summary.year}-osha-inspection-packet.pdf`);
}
