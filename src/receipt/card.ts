import type { Receipt, RiskLevel } from "../schema/types.js";

const COLORS: Record<RiskLevel, string> = {
  critical: "#ff5f57",
  high: "#ff8a5b",
  medium: "#e8c44d",
  low: "#56d4d0",
  safe: "#5a6b61",
};
const STATUS_COLOR: Record<Receipt["status"], string> = {
  success: "#3ee07a",
  partial: "#e8c44d",
  failed: "#ff5f57",
  interrupted: "#c98bff",
};

function esc(s: string): string {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}
function clip(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
function fmtDuration(ms: number): string {
  if (ms <= 0) return "0s";
  const sec = Math.round(ms / 1000);
  const m = Math.floor(sec / 60);
  return m > 0 ? `${m}m ${sec % 60}s` : `${sec}s`;
}
const STATUS_LABEL: Record<Receipt["status"], string> = {
  success: "success",
  partial: "success with warnings",
  failed: "failed",
  interrupted: "interrupted",
};

/**
 * Render a receipt as a self-contained, shareable SVG card. No dependencies; renders on
 * GitHub, in docs, and exports cleanly to PNG. Pure.
 */
export function renderReceiptCard(r: Receipt): string {
  const W = 760;
  const flags = r.riskyActions.slice(0, 3);
  const pad = 30;
  const flagsTop = 196;
  const H = flagsTop + Math.max(flags.length, 1) * 34 + 82;

  const adapter = r.source === "shell" ? "shell" : r.source;
  const sColor = STATUS_COLOR[r.status];
  const rColor = COLORS[r.riskMax];

  const flagRows = flags.length
    ? flags
        .map((f, i) => {
          const y = flagsTop + i * 34;
          const irr = f.reversibility === "irreversible" ? `<tspan fill="${COLORS.critical}"> · irreversible</tspan>` : "";
          return `
    <text x="${pad}" y="${y}" font-size="14" font-weight="700" fill="${COLORS[f.level]}">${f.level.toUpperCase()}</text>
    <text x="${pad + 84}" y="${y}" font-size="14" fill="#cdd6d0">${esc(clip(f.message, 64))}${irr}</text>`;
        })
        .join("")
    : `<text x="${pad}" y="${flagsTop}" font-size="14" fill="#6b7a70">No medium-or-higher risk flags.</text>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="ui-monospace, 'JetBrains Mono', Menlo, Consolas, monospace">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#14181a"/><stop offset="1" stop-color="#0c0e10"/>
    </linearGradient>
  </defs>
  <rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="16" fill="url(#bg)" stroke="#1f3326" stroke-width="1.5"/>

  <text x="${pad}" y="44" font-size="17" font-weight="800" fill="#8df7a8">AGENT<tspan fill="#3ee07a">TRACE</tspan></text>
  <text x="${W - pad}" y="44" font-size="12" fill="#6b7a70" text-anchor="end">RECEIPT · ${esc(adapter)}</text>
  <line x1="${pad}" y1="60" x2="${W - pad}" y2="60" stroke="#1d2528"/>

  <text x="${pad}" y="100" font-size="20" font-weight="700" fill="#eafff0">${esc(clip(r.goal, 56))}</text>

  <text x="${pad}" y="150" font-size="14" fill="#6b7a70">status <tspan fill="${sColor}" font-weight="700">${esc(STATUS_LABEL[r.status])}</tspan></text>
  <text x="${pad}" y="174" font-size="14" fill="#6b7a70">risk <tspan fill="${rColor}" font-weight="700">${r.riskMax.toUpperCase()}</tspan>   ·   ${fmtDuration(r.durationMs)}   ·   ${r.filesChanged.length} files · ${r.commandsRun.length} cmds</text>

  ${flagRows}

  <line x1="${pad}" y1="${H - 64}" x2="${W - pad}" y2="${H - 64}" stroke="#1d2528"/>
  <text x="${pad}" y="${H - 34}" font-size="14" fill="${r.riskMax === "critical" ? COLORS.critical : "#8df7a8"}">→ ${esc(clip(r.nextRecommendedAction, 78))}</text>
</svg>`;
}
