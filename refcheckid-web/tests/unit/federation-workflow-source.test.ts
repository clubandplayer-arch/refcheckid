import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  join(process.cwd(), "src/features/federation/federation-workflow.tsx"),
  "utf8",
);

describe("regression: federation history actions", () => {
  it("opens the read-only report detail from history", () => {
    expect(source).toContain("onOpenReport");
    expect(source).toContain("setSelectedReportId(item.reportId)");
    expect(source).toContain(
      "selectedReport ? <ReportDetail report={selectedReport} />",
    );
    expect(source).toContain("Dettaglio referto in sola lettura");
  });

  it("opens a synthetic audit summary with smoke-flow milestones", () => {
    expect(source).toContain("onOpenAudit");
    expect(source).toContain("AuditSummaryPanel");
    expect(source).toContain("Distinta inviata dal dirigente");
    expect(source).toContain("Riconoscimento completato dall’arbitro");
    expect(source).toContain("Referto inviato dall’arbitro");
    expect(source).toContain("Referto ricevuto dalla federazione");
    expect(source).toContain("Timestamp:");
    expect(source).toContain("Attore evento:");
    expect(source).toContain("Categoria:");
  });

  it("localizes federation navigation, statuses and team sides", () => {
    expect(source).toContain('"Cruscotto"');
    expect(source).toContain('"Import dati"');
    expect(source).toContain('scheduled: "Programmata"');
    expect(source).toContain('in_compilation: "In compilazione"');
    expect(source).toContain('submitted: "Inviato"');
    expect(source).toContain('cancelled: "Annullata"');
    expect(source).toContain('overdue: "In ritardo"');
    expect(source).toContain("federationRejectReasonCodes");
    expect(source).toContain("photoEtag");
    expect(source).toContain(
      "formatReportTeamName(event.teamName, homeTeam, awayTeam)",
    );
    expect(source).toContain("statusBadgeClass");
    expect(source).toContain("min-h-10 min-w-[112px]");
    expect(source).toContain("ScoreBadge");
    expect(source).toContain("object-cover");
    expect(source).toContain("src={photoUrl}");
    expect(source).toContain("min-h-12 min-w-[88px]");
    expect(source).toContain("item.auditSummary.join");
    expect(source).toContain("Workflow foto");
    expect(source).toContain("Attore:");
    expect(source).toContain("Azione:");
    expect(source).toContain("item.reportId ?");
    expect(source).toContain("min-w-[120px] rounded-md");
    expect(source).toContain("min-w-[130px] rounded-md bg-slate-700");
  });

  it("exposes PR1 import templates for federation product verification", () => {
    expect(source).toContain("ImportTemplatesPanel");
    expect(source).toContain("PR 1 · Verifica template CSV");
    expect(source).toContain("Anteprima leggibile");
    expect(source).toContain("previewRows");
    expect(source).toContain("Scarica CSV");
    expect(source).toContain("/federation-import-templates/");
    expect(source).toContain("societa.csv");
    expect(source).toContain("tesserati_generale.csv");
    expect(source).toContain("tesserati_societa.csv");
    expect(source).toContain("staff.csv");
    expect(source).toContain("arbitri.csv");
    expect(source).toContain("calendario.csv");
    expect(source).toContain("designazioni.csv");
    expect(source).toContain("Check richiesto prima della PR 2");
  });
});
