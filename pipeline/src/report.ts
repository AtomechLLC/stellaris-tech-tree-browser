/**
 * Validation report (D-17) — printed at the end of every `npm run build:data`
 * run so a future game-patch run immediately shows what changed or broke.
 *
 * Suggested minimum contents per RESEARCH.md's Validation Architecture
 * section:
 *   - total tech count parsed vs. total tech_* keys found (should match —
 *     catches technology_swap leakage per Pitfall 5)
 *   - count of unresolved @scripted_variable references remaining (must be 0)
 *   - count of dangling prerequisite references (must be 0 — buildAndValidateGraph
 *     already throws on this, so a successful run always reports 0 here; the
 *     field exists so the report's shape documents the invariant being held)
 *   - counts of techs missing localisation name / missing icon
 *   - tech counts per area and per tier
 *   - DLC breakdown
 *   - unlocks coverage (D-05): techs with non-empty grants, techs with
 *     non-empty leadsTo, and total unresolved grant loc-keys shipped verbatim
 *
 * Cross-checked against the two known cross-DLC host_has_dlc cases
 * (tech_titans -> Apocalypse, tech_juggernaut -> Federations).
 */
import type { TechSnapshot } from "./schema/tech-snapshot.js";

const KNOWN_CROSS_DLC_CASES: Array<{ techKey: string; expectedDlc: string }> = [
  { techKey: "tech_titans", expectedDlc: "Apocalypse" },
  { techKey: "tech_juggernaut", expectedDlc: "Federations" },
];

export interface ReportWarnings {
  /** Total tech_* top-level keys found across all source files (before any filtering). */
  totalTechKeysFound: number;
  /** Count of unresolved @scripted_variable references remaining in final output (should be 0). */
  unresolvedVariableCount: number;
  /** Count of dangling prerequisite references (should be 0 -- buildAndValidateGraph already throws if non-zero). */
  danglingPrerequisiteCount: number;
  /** Total unresolved grant loc-keys shipped verbatim across all techs (cosmetic, D-16 warn-not-fail). */
  unresolvedGrantLocKeys: number;
}

export interface CrossDlcCheck {
  techKey: string;
  expectedDlc: string;
  actualDlc: string | null;
  matches: boolean;
}

export interface Report {
  techCountParsed: number;
  totalTechKeysFound: number;
  techKeyCountMatches: boolean;
  unresolvedVariableCount: number;
  danglingPrerequisiteCount: number;
  missingNameCount: number;
  missingDescriptionCount: number;
  missingIconCount: number;
  areaCounts: Record<string, number>;
  tierCounts: Record<string, number>;
  dlcBreakdown: Record<string, number>;
  crossDlcChecks: CrossDlcCheck[];
  unlocksCoverage: {
    techsWithGrants: number;
    techsWithLeadsTo: number;
    unresolvedGrantLocKeys: number;
  };
}

/**
 * Builds the structural validation report from the final snapshot plus the
 * warning/counter side-channel accumulated during assembly.
 */
export function buildReport(snapshot: TechSnapshot, warnings: ReportWarnings): Report {
  const techs = Object.values(snapshot.techs);

  const dlcBreakdown: Record<string, number> = {};
  let missingNameCount = 0;
  let missingDescriptionCount = 0;
  let missingIconCount = 0;
  let techsWithGrants = 0;
  let techsWithLeadsTo = 0;

  for (const tech of techs) {
    const dlcKey = tech.dlc ?? "Base Game";
    dlcBreakdown[dlcKey] = (dlcBreakdown[dlcKey] ?? 0) + 1;

    if (!tech.name) missingNameCount++;
    if (!tech.description) missingDescriptionCount++;
    if (!tech.icon) missingIconCount++;

    if (tech.unlocks.grants.length > 0) techsWithGrants++;
    if (tech.unlocks.leadsTo.length > 0) techsWithLeadsTo++;
  }

  const crossDlcChecks: CrossDlcCheck[] = KNOWN_CROSS_DLC_CASES.map(({ techKey, expectedDlc }) => {
    const actualDlc = snapshot.techs[techKey]?.dlc ?? null;
    return { techKey, expectedDlc, actualDlc, matches: actualDlc === expectedDlc };
  });

  return {
    techCountParsed: techs.length,
    totalTechKeysFound: warnings.totalTechKeysFound,
    techKeyCountMatches: techs.length === warnings.totalTechKeysFound,
    unresolvedVariableCount: warnings.unresolvedVariableCount,
    danglingPrerequisiteCount: warnings.danglingPrerequisiteCount,
    missingNameCount,
    missingDescriptionCount,
    missingIconCount,
    areaCounts: snapshot.meta.areaCounts,
    tierCounts: snapshot.meta.tierCounts,
    dlcBreakdown,
    crossDlcChecks,
    unlocksCoverage: {
      techsWithGrants,
      techsWithLeadsTo,
      unresolvedGrantLocKeys: warnings.unresolvedGrantLocKeys,
    },
  };
}

/** Writes a readable summary of the report to console (D-17). */
export function printReport(report: Report): void {
  console.log("");
  console.log("=== Data Pipeline Validation Report (D-17) ===");
  console.log(
    `Tech count: parsed=${report.techCountParsed} totalKeysFound=${report.totalTechKeysFound} match=${report.techKeyCountMatches}`,
  );
  console.log(`Unresolved @scripted_variable references: ${report.unresolvedVariableCount}`);
  console.log(`Dangling prerequisite references: ${report.danglingPrerequisiteCount}`);
  console.log(
    `Missing name: ${report.missingNameCount}  Missing description: ${report.missingDescriptionCount}  Missing icon: ${report.missingIconCount}`,
  );

  console.log("Area counts:");
  for (const [area, count] of Object.entries(report.areaCounts).sort()) {
    console.log(`  ${area}: ${count}`);
  }

  console.log("Tier counts:");
  for (const [tier, count] of Object.entries(report.tierCounts).sort((a, b) => Number(a[0]) - Number(b[0]))) {
    console.log(`  tier ${tier}: ${count}`);
  }

  console.log("DLC breakdown:");
  for (const [dlc, count] of Object.entries(report.dlcBreakdown).sort()) {
    console.log(`  ${dlc}: ${count}`);
  }

  console.log("Known cross-DLC host_has_dlc cases:");
  for (const check of report.crossDlcChecks) {
    console.log(
      `  ${check.techKey}: expected="${check.expectedDlc}" actual="${check.actualDlc}" match=${check.matches}`,
    );
  }

  console.log("Unlocks coverage (D-05):");
  console.log(`  techs with non-empty grants: ${report.unlocksCoverage.techsWithGrants}`);
  console.log(`  techs with non-empty leadsTo: ${report.unlocksCoverage.techsWithLeadsTo}`);
  console.log(`  unresolved grant loc-keys (shipped verbatim): ${report.unlocksCoverage.unresolvedGrantLocKeys}`);
  console.log("===============================================");
  console.log("");
}
