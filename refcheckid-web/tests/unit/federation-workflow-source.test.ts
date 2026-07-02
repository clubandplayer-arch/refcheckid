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
    expect(source).toContain("selectedReport ? <ReportDetail report={selectedReport} />");
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
  });
});
