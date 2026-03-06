import { jsPDF } from "jspdf";
import {
  OshaAnnualSummary,
  OshaCase,
  OshaEstablishmentSnapshot,
  formatAddress,
  toDisplayDate
} from "./osha-recordkeeping";
import { ConsultationAssessment, US_STATE_OPTIONS } from "./osha-consultation";

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

function ensurePageSpace(doc: jsPDF, y: number, requiredHeight = 0.6): number {
  if (y + requiredHeight <= 10.25) {
    return y;
  }
  doc.addPage();
  return 0.75;
}

function addParagraph(doc: jsPDF, y: number, text: string, x = 0.75, width = 6.8): number {
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  const lines = doc.splitTextToSize(text || "—", width);
  doc.text(lines, x, y);
  return y + (lines.length * 0.18) + 0.08;
}

function addBulletList(doc: jsPDF, y: number, items: string[], indent = 0.95, width = 6.5): number {
  if (!items.length) {
    return addParagraph(doc, y, "—", indent, width);
  }

  items.forEach(item => {
    y = ensurePageSpace(doc, y, 0.4);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    const lines = doc.splitTextToSize(item, width);
    doc.text("•", indent - 0.2, y);
    doc.text(lines, indent, y);
    y += (lines.length * 0.18) + 0.08;
  });

  return y;
}

function addConsultationObligationBlock(
  doc: jsPDF,
  y: number,
  obligation: ConsultationAssessment["federalRequirements"][number]
): number {
  y = ensurePageSpace(doc, y, 1.2);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(obligation.title, 0.75, y);
  y += 0.18;

  doc.setFont("helvetica", "italic");
  doc.setFontSize(9);
  doc.text(`${obligation.requirementLevel.toUpperCase()} • ${obligation.priority.toUpperCase()} PRIORITY`, 0.75, y);
  y += 0.18;

  y = addParagraph(doc, y, obligation.appliesBecause);
  y = addBulletList(doc, y, obligation.details);

  if (obligation.thresholdNotes.length) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text("Threshold notes", 0.75, y);
    y += 0.16;
    y = addBulletList(doc, y, obligation.thresholdNotes, 0.95, 6.4);
  }

  if (obligation.citations.length) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text("Sources", 0.75, y);
    y += 0.16;
    y = addBulletList(
      doc,
      y,
      obligation.citations.map(citation => `${citation.title}: ${citation.url}`),
      0.95,
      6.4
    );
  }

  return y + 0.08;
}

async function getImage(imageUrl: string): Promise<string> {
  const res = await fetch(imageUrl);
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Failed to read image"));
    reader.readAsDataURL(blob);
  });
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

export async function exportConsultationAssessmentPdf(assessment: ConsultationAssessment): Promise<void> {
  const doc = new jsPDF({ orientation: "portrait", unit: "in", format: [8.5, 11] });
  const stateName = US_STATE_OPTIONS.find(option => option.code === assessment.profile.state)?.name || assessment.profile.state;
  const generatedLabel = new Date(assessment.generatedAt).toLocaleDateString();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const topMargin = 1.7;
  const bottomMargin = 0.85;
  const maxContentY = pageHeight - bottomMargin;

  const [logoData, chimpData] = await Promise.all([
    getImage("/assets/ccLogoDark.png").catch(() => null),
    getImage("/assets/chimp.png").catch(() => null),
  ]);

  const drawConsultationHeader = () => {
    doc.setFillColor(245, 249, 255);
    doc.roundedRect(0.55, 0.4, 7.4, 0.92, 0.12, 0.12, "F");

    if (logoData) {
      doc.addImage(logoData, "PNG", 0.72, 0.56, 1.42, 0.34);
    } else {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.setTextColor(5, 77, 138);
      doc.text("Compliance Chimp", 0.72, 0.8);
    }

    if (chimpData) {
      doc.addImage(chimpData, "PNG", 6.98, 0.43, 0.54, 0.76);
    }

    doc.setTextColor(17, 17, 17);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text("Free OSHA Safety Consultation Report", 0.75, 1.05);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(90, 90, 90);
    doc.text(`${assessment.profile.companyName} • Generated ${generatedLabel}`, 0.75, 1.26);
    doc.setDrawColor(225, 233, 243);
    doc.setLineWidth(0.01);
    doc.line(0.75, 1.42, 7.75, 1.42);
  };

  const drawConsultationFooter = (pageNumber: number, pageCount: number) => {
    doc.setDrawColor(225, 233, 243);
    doc.setLineWidth(0.01);
    doc.line(0.75, pageHeight - 0.55, 7.75, pageHeight - 0.55);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(105, 105, 105);
    doc.text("Compliance Chimp", 0.75, pageHeight - 0.32);
    doc.text(`Page ${pageNumber} of ${pageCount}`, 7.75, pageHeight - 0.32, { align: "right" });
  };

  const ensureConsultationSpace = (y: number, requiredHeight = 0.75): number => {
    if (y + requiredHeight <= maxContentY) {
      return y;
    }
    doc.addPage();
    drawConsultationHeader();
    return topMargin;
  };

  const addConsultationSectionHeading = (y: number, title: string): number => {
    y = ensureConsultationSpace(y, 0.45);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(5, 77, 138);
    doc.text(title, 0.75, y);
    doc.setDrawColor(255, 145, 0);
    doc.setLineWidth(0.02);
    doc.line(0.75, y + 0.12, 2.1, y + 0.12);
    doc.setTextColor(17, 17, 17);
    return y + 0.3;
  };

  const addConsultationParagraph = (y: number, text: string, x = 0.75, width = 6.8): number => {
    y = ensureConsultationSpace(y, 0.32);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(40, 40, 40);
    const lines = doc.splitTextToSize(text || "—", width);
    doc.text(lines, x, y);
    doc.setTextColor(17, 17, 17);
    return y + (lines.length * 0.18) + 0.1;
  };

  const addConsultationBulletList = (y: number, items: string[], indent = 0.95, width = 6.45): number => {
    if (!items.length) {
      return addConsultationParagraph(y, "—", indent, width);
    }

    items.forEach(item => {
      y = ensureConsultationSpace(y, 0.36);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(40, 40, 40);
      const lines = doc.splitTextToSize(item, width);
      doc.text("•", indent - 0.18, y);
      doc.text(lines, indent, y);
      y += (lines.length * 0.18) + 0.1;
    });

    doc.setTextColor(17, 17, 17);
    return y;
  };

  const estimateParagraphHeight = (text: string, width: number, fontSize = 10, lineHeight = 0.18): number => {
    doc.setFontSize(fontSize);
    const lines = doc.splitTextToSize(text || "—", width);
    return Math.max(lines.length, 1) * lineHeight;
  };

  const estimateBulletListHeight = (items: string[], width: number, fontSize = 10, lineHeight = 0.18, spacing = 0.1): number => {
    if (!items.length) {
      return estimateParagraphHeight("—", width, fontSize, lineHeight) + spacing;
    }

    return items.reduce((total, item) => {
      const lines = doc.splitTextToSize(item, width);
      return total + (Math.max(lines.length, 1) * lineHeight) + spacing;
    }, 0);
  };

  const addConsultationObligation = (
    y: number,
    obligation: ConsultationAssessment["federalRequirements"][number]
  ): number => {
    const contentX = 1.0;
    const contentWidth = 6.15;
    const titleLines = doc.splitTextToSize(obligation.title, contentWidth).length;
    const titleHeight = Math.max(titleLines, 1) * 0.18;
    const subtitleHeight = 0.18;
    const becauseHeight = estimateParagraphHeight(obligation.appliesBecause, contentWidth, 10, 0.18) + 0.1;
    const detailsHeight = estimateBulletListHeight(obligation.details, 5.95, 10, 0.18, 0.1);
    const thresholdHeight = obligation.thresholdNotes.length
      ? 0.16 + estimateBulletListHeight(obligation.thresholdNotes, 5.95, 10, 0.18, 0.1)
      : 0;
    const citationsHeight = obligation.citations.length
      ? 0.16 + estimateBulletListHeight(
        obligation.citations.map(citation => `${citation.title}: ${citation.url}`),
        5.95,
        10,
        0.18,
        0.1
      )
      : 0;
    const blockHeight = Math.max(
      0.42 + titleHeight + subtitleHeight + becauseHeight + detailsHeight + thresholdHeight + citationsHeight + 0.18,
      1.4
    );
    y = ensureConsultationSpace(y, blockHeight + 0.12);

    const blockTop = y - 0.14;
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(229, 233, 239);
    doc.setLineWidth(0.01);
    doc.roundedRect(0.78, blockTop, 6.82, blockHeight, 0.1, 0.1, "FD");

    if (obligation.requirementLevel === "required") {
      doc.setFillColor(255, 145, 0);
    } else if (obligation.requirementLevel === "conditional") {
      doc.setFillColor(5, 77, 138);
    } else {
      doc.setFillColor(46, 125, 50);
    }
    doc.roundedRect(0.78, blockTop, 0.12, blockHeight, 0.05, 0.05, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text(obligation.title, contentX, y, { maxWidth: contentWidth });
    doc.setFont("helvetica", "italic");
    doc.setFontSize(8.5);
    doc.setTextColor(90, 90, 90);
    let cursor = y + titleHeight + 0.08;
    doc.text(`${obligation.requirementLevel.toUpperCase()} • ${obligation.priority.toUpperCase()} PRIORITY`, contentX, cursor);
    doc.setTextColor(17, 17, 17);
    cursor = addConsultationParagraph(cursor + 0.2, obligation.appliesBecause, contentX, contentWidth);
    cursor = addConsultationBulletList(cursor, obligation.details, contentX + 0.2, 5.95);

    if (obligation.thresholdNotes.length) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.text("Threshold notes", contentX, cursor);
      cursor += 0.16;
      cursor = addConsultationBulletList(cursor, obligation.thresholdNotes, contentX + 0.2, 5.95);
    }

    if (obligation.citations.length) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.text("Sources", contentX, cursor);
      cursor += 0.16;
      cursor = addConsultationBulletList(
        cursor,
        obligation.citations.map(citation => `${citation.title}: ${citation.url}`),
        contentX + 0.2,
        5.95
      );
    }

    return blockTop + blockHeight + 0.14;
  };

  drawConsultationHeader();
  let y = topMargin;

  y = addConsultationSectionHeading(y, "Assessment Snapshot");
  y = addKeyValue(doc, y, "OSHA priority score", `${assessment.importanceScore}/100 (${assessment.importanceLevel})`, 0.75, 3);
  y = addKeyValue(doc, y - 0.36, "OSHA track", assessment.profile.oshaTrack, 4.25, 3);
  y = addKeyValue(doc, y, "Industry profile", assessment.profile.industryDescription, 0.75, 3);
  y = addKeyValue(doc, y - 0.56, "Employees", String(assessment.profile.employeeCount), 4.25, 3);
  y = addKeyValue(doc, y, "State", stateName, 0.75, 3);
  y = addKeyValue(doc, y - 0.36, "Website", assessment.profile.website || "—", 4.25, 3);
  y = addConsultationParagraph(y + 0.12, assessment.summary);
  y = addConsultationParagraph(y, assessment.importanceReason);

  y = addConsultationSectionHeading(y + 0.08, "Ulysses's Take");
  y = addConsultationParagraph(y, assessment.ulyssesTake);
  y = addConsultationParagraph(y, assessment.importanceReason);

  y = addConsultationSectionHeading(y + 0.08, "Required Federal Actions");
  assessment.federalRequirements.forEach(obligation => {
    y = addConsultationObligation(y, obligation);
  });

  y = addConsultationSectionHeading(y + 0.08, "State-Specific Flags");
  if (assessment.stateRequirements.length) {
    assessment.stateRequirements.forEach(obligation => {
      y = addConsultationObligation(y, obligation);
    });
  } else {
    y = addConsultationParagraph(
      y,
      "No extra private-sector state-plan overlay was detected from the selected state. Federal OSHA likely remains the primary baseline."
    );
  }

  y = addConsultationSectionHeading(y + 0.08, "Recommended Processes");
  assessment.recommendedProcesses.forEach(obligation => {
    y = addConsultationObligation(y, obligation);
  });

  y = addConsultationSectionHeading(y + 0.08, "Next Actions");
  y = addConsultationBulletList(
    y,
    assessment.nextActions.map(action => `${action.title}: ${action.description}`)
  );

  y = addConsultationSectionHeading(y + 0.08, "Assumptions And Caveats");
  y = addConsultationBulletList(y, assessment.caveats);

  if (chimpData) {
    y = ensureConsultationSpace(y, 0.9);
    doc.addImage(chimpData, "PNG", (pageWidth - 0.7) / 2, y + 0.08, 0.7, 0.95);
  }

  const pageCount = doc.getNumberOfPages();
  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber++) {
    doc.setPage(pageNumber);
    drawConsultationFooter(pageNumber, pageCount);
  }

  const safeName = assessment.profile.companyName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "osha-consultation";
  doc.save(`${safeName}-osha-consultation-report.pdf`);
}
