const pptx = require("pptxgenjs");
const p = new pptx();
p.layout = "LAYOUT_WIDE"; // 13.33 x 7.5
p.author = "Revive";
p.title = "Revive Seed Deck";

// --- palette (matches the site: cool light, cobalt, slate-dark) ---
const WHITE = "FFFFFF", PAPER = "F5F7FA", INSET = "F1F4F7", INK = "151922",
  INKMUT = "5D6878", INKFAINT = "8A94A3", HAIR = "E2E7EE",
  COBALT = "4967F2", COBALT_SOFT = "EEF1FF", COBALT_LT = "9EACFF",
  OK = "148060", OK_SOFT = "E8F6F1", FAIL = "C2413A", FAIL_SOFT = "FCEDEA",
  WARN = "9A6200", DARK = "10131A", DARK2 = "151B26", ICE = "C7D2FE";
const SANS = "Arial", MONO = "Consolas";
const W = 13.33, H = 7.5, M = 0.85;

const softShadow = () => ({ type: "outer", color: "1B2A4A", blur: 12, offset: 5, angle: 90, opacity: 0.12 });

function wordmark(s, x, y, size, dark) {
  s.addText([
    { text: "Revive", options: { color: dark ? WHITE : INK } },
    { text: ".", options: { color: COBALT } },
  ], { x, y, w: 4, h: size * 0.032, fontFace: SANS, fontSize: size, bold: true, charSpacing: -0.5, margin: 0, align: "left", valign: "top" });
}
function kicker(s, text, x, y, color) {
  s.addText(text.toUpperCase(), { x, y, w: 9, h: 0.3, margin: 0, fontFace: SANS, fontSize: 11, bold: true, color: color || COBALT, charSpacing: 2.4, align: "left" });
}
function card(s, x, y, w, h, fill, opts = {}) {
  s.addShape(p.shapes.ROUNDED_RECTANGLE, { x, y, w, h, rectRadius: 0.11, fill: { color: fill || WHITE }, line: { color: opts.line || HAIR, width: opts.lw || 1 }, shadow: opts.shadow ? softShadow() : undefined });
}

// ============================================================ 1 · TITLE (dark)
let s = p.addSlide();
s.background = { color: DARK };
wordmark(s, M, 0.95, 30, true);
s.addText("Credential failures shouldn't kill durable workflows.", {
  x: M, y: 2.35, w: 11.0, h: 2.4, fontFace: SANS, fontSize: 46, bold: true, color: WHITE, charSpacing: -1, lineSpacingMultiple: 1.02, margin: 0,
});
s.addText("A recovery control plane for durable agents.", { x: M, y: 5.0, w: 11, h: 0.5, fontFace: SANS, fontSize: 18, color: INKFAINT, margin: 0 });
s.addText("Seed  ·  2026  ·  founders@revive.dev", { x: M, y: 6.65, w: 11, h: 0.4, fontFace: MONO, fontSize: 12, color: INKFAINT, margin: 0 });
s.addNotes("Revive keeps long-running, durable agent workflows alive when an OAuth credential fails mid-run. We bind the failure to the run it interrupted, get the account reauthorized, and resume the exact action safely.");

// ============================================================ 2 · PROBLEM
s = p.addSlide();
s.background = { color: WHITE };
kicker(s, "The problem", M, 0.65, FAIL);
s.addText("A credential dies mid-run, and the workflow can't recover itself.", { x: M, y: 1.05, w: 11.6, h: 1.4, fontFace: SANS, fontSize: 31, bold: true, color: INK, charSpacing: -0.7, lineSpacingMultiple: 1.05, margin: 0 });
s.addText("A refresh grant gets rejected or revoked partway through a multi-step run. Retrying replays the same dead grant. Blind replay can fire a side effect twice. The run is lost, or worse, duplicated.", { x: M, y: 2.45, w: 11.4, h: 0.8, fontFace: SANS, fontSize: 15, color: INKMUT, lineSpacingMultiple: 1.15, margin: 0 });
const bugs = [
  ["openai / codex", "#14144", "After re-authenticating, the same session still fails with invalid_grant."],
  ["anthropics / claude-code", "#12447", "The grant expires during long tasks; the run halts until a restart."],
  ["github / copilot-cli", "#2779", "Tokens expire mid-job and the agent stalls."],
];
const cw = (11.63 - 0.6) / 3;
bugs.forEach(([repo, num, q], i) => {
  const x = M + i * (cw + 0.3);
  card(s, x, 3.55, cw, 2.55, WHITE, { shadow: true });
  s.addText([{ text: "● ", options: { color: FAIL } }, { text: repo, options: { color: INKMUT } }], { x: x + 0.32, y: 3.85, w: cw - 0.6, h: 0.3, fontFace: MONO, fontSize: 11, margin: 0 });
  s.addText(num, { x: x + 0.32, y: 4.22, w: cw - 0.6, h: 0.5, fontFace: SANS, fontSize: 22, bold: true, color: INK, margin: 0 });
  s.addText(q, { x: x + 0.32, y: 4.85, w: cw - 0.62, h: 1.1, fontFace: SANS, fontSize: 13, color: INKMUT, lineSpacingMultiple: 1.1, margin: 0 });
});
s.addText("Real, open reports across every major agent runtime.", { x: M, y: 6.4, w: 11, h: 0.4, fontFace: MONO, fontSize: 11, color: INKFAINT, margin: 0 });
s.addNotes("Lead with the failure on screen. The nuance that matters: it isn't just that the run dies, it's that naive recovery (retry / blind replay) is unsafe. That's the hard part.");

// ============================================================ 3 · BOUNDARY
s = p.addSlide();
s.background = { color: PAPER };
kicker(s, "Why it's unsolved", M, 0.65, COBALT);
s.addText("The missing contract between identity and execution.", { x: M, y: 1.05, w: 11.8, h: 1.0, fontFace: SANS, fontSize: 31, bold: true, color: INK, charSpacing: -0.7, margin: 0 });
s.addText("Credential systems know a grant broke. Durable runtimes know how to pause a run. Neither owns the correlation, recovery, identity handoff, and safe replay between them.", { x: M, y: 1.95, w: 11.6, h: 0.7, fontFace: SANS, fontSize: 14.5, color: INKMUT, lineSpacingMultiple: 1.15, margin: 0 });
// three columns
const c3w = (11.63 - 0.6) / 3;
function boundaryCol(x, label, title, items, dark) {
  card(s, x, 3.05, c3w, 3.5, dark ? DARK2 : WHITE, { line: dark ? COBALT : HAIR, lw: dark ? 1.5 : 1, shadow: dark });
  kicker(s, label, x + 0.32, 3.35, dark ? COBALT_LT : COBALT);
  s.addText(title, { x: x + 0.32, y: 3.7, w: c3w - 0.6, h: 0.7, fontFace: SANS, fontSize: 17, bold: true, color: dark ? WHITE : INK, charSpacing: -0.3, lineSpacingMultiple: 1.0, margin: 0 });
  items.forEach((it, i) => {
    const yy = 4.65 + i * 0.5;
    s.addShape(p.shapes.OVAL, { x: x + 0.34, y: yy + 0.06, w: 0.08, h: 0.08, fill: { color: dark ? COBALT_LT : INKFAINT } });
    s.addText(it, { x: x + 0.55, y: yy, w: c3w - 0.85, h: 0.3, fontFace: SANS, fontSize: 12, color: dark ? "C9D2E4" : INKMUT, margin: 0 });
  });
}
boundaryCol(M, "Credential systems", "Detect connection failure", ["Refresh rejected", "Grant revoked", "Step-up required"], false);
boundaryCol(M + c3w + 0.3, "Revive · control plane", "Recover the logical run", ["Bind credential → run → action", "Route reauthorization", "Rotate lease generation", "Replay with idempotency guard"], true);
boundaryCol(M + 2 * (c3w + 0.3), "Durable runtimes", "Pause and resume execution", ["Checkpoint state", "Wait for event", "Schedule retry"], false);
s.addNotes("This is the core insight. Two mature categories bracket the problem and the contract between them is unowned. Revive is that contract.");

// ============================================================ 4 · ARCHITECTURE
s = p.addSlide();
s.background = { color: WHITE };
kicker(s, "How it works", M, 0.65, COBALT);
s.addText("Six explicit state transitions. No magic token injection.", { x: M, y: 1.05, w: 11.8, h: 1.0, fontFace: SANS, fontSize: 31, bold: true, color: INK, charSpacing: -0.7, margin: 0 });
s.addText("The worker can restart between every stage. The unit of continuity is the logical run and its checkpoint, not a process in memory.", { x: M, y: 1.95, w: 11.4, h: 0.6, fontFace: SANS, fontSize: 14.5, color: INKMUT, lineSpacingMultiple: 1.15, margin: 0 });
const steps = [
  ["Detect", "Normalize the provider signal.", FAIL],
  ["Bind", "Correlate lease, run and action.", COBALT],
  ["Checkpoint", "Persist the exact execution point.", COBALT],
  ["Reauthorize", "Route the correct account securely.", COBALT],
  ["Rotate", "Fence stale credential generations.", COBALT],
  ["Replay once", "Reconcile before side effects repeat.", OK],
];
const n6 = 6, gap6 = 0.28, sw6 = (11.63 - (n6 - 1) * gap6) / n6;
const rowY = 3.35;
// connecting line through node centers
s.addShape(p.shapes.LINE, { x: M + sw6 / 2, y: rowY + 0.34, w: 11.63 - sw6, h: 0, line: { color: HAIR, width: 1.5 } });
steps.forEach(([t, d, col], i) => {
  const x = M + i * (sw6 + gap6);
  s.addShape(p.shapes.OVAL, { x: x + sw6 / 2 - 0.3, y: rowY, w: 0.6, h: 0.6, fill: { color: WHITE }, line: { color: col, width: 2 } });
  s.addText(String(i + 1), { x: x + sw6 / 2 - 0.3, y: rowY, w: 0.6, h: 0.6, fontFace: MONO, fontSize: 15, bold: true, color: col, align: "center", valign: "middle", margin: 0 });
  s.addText(t, { x: x - 0.05, y: rowY + 0.85, w: sw6 + 0.1, h: 0.4, fontFace: SANS, fontSize: 13.5, bold: true, color: INK, align: "center", margin: 0 });
  s.addText(d, { x: x - 0.05, y: rowY + 1.32, w: sw6 + 0.1, h: 0.9, fontFace: SANS, fontSize: 10.5, color: INKMUT, align: "center", lineSpacingMultiple: 1.08, margin: 0 });
});
s.addNotes("Walk the six steps left to right. Hammer 'no magic token injection' — recovery is a sequence of durable, restart-safe transitions, not a process holding a token in memory.");

// ============================================================ 5 · INVARIANTS
s = p.addSlide();
s.background = { color: PAPER };
kicker(s, "Why it's hard to copy", M, 0.65, COBALT);
s.addText("Depth comes from invariants, not feature count.", { x: M, y: 1.05, w: 11.8, h: 1.0, fontFace: SANS, fontSize: 31, bold: true, color: INK, charSpacing: -0.7, margin: 0 });
const inv = [
  ["01", "correlation", "Run–credential binding", "Map a credential lease to every active run and the exact action it interrupted."],
  ["02", "continuity", "Durable recovery case", "Persist the checkpoint and recovery state so the original worker can disappear safely."],
  ["03", "identity", "Fenced credential rotation", "Advance the lease generation so stale workers cannot reuse invalid credentials."],
  ["04", "safety", "Idempotent replay", "Resume with the original action key and stop when the upstream result is ambiguous."],
];
const ivw = (11.63 - 0.4) / 2, ivh = 1.92;
inv.forEach(([n, tag, t, d], i) => {
  const x = M + (i % 2) * (ivw + 0.4);
  const y = 2.2 + Math.floor(i / 2) * (ivh + 0.32);
  card(s, x, y, ivw, ivh, WHITE, { shadow: true });
  s.addText(n, { x: x + 0.36, y: y + 0.34, w: 1, h: 0.3, fontFace: MONO, fontSize: 12, bold: true, color: COBALT, margin: 0 });
  s.addText(tag.toUpperCase(), { x: x + ivw - 2.0, y: y + 0.36, w: 1.65, h: 0.28, fontFace: SANS, fontSize: 8.5, bold: true, color: INKFAINT, charSpacing: 1.2, align: "right", margin: 0 });
  s.addText(t, { x: x + 0.36, y: y + 0.78, w: ivw - 0.7, h: 0.4, fontFace: SANS, fontSize: 18, bold: true, color: INK, charSpacing: -0.3, margin: 0 });
  s.addText(d, { x: x + 0.36, y: y + 1.22, w: ivw - 0.72, h: 0.6, fontFace: SANS, fontSize: 12.5, color: INKMUT, lineSpacingMultiple: 1.1, margin: 0 });
});
s.addNotes("These four invariants are the moat. They're distributed-systems guarantees (correlation, durability, fencing, exactly-once) that are hard to retrofit and easy to get subtly wrong.");

// ============================================================ 6 · PROOF (dark)
s = p.addSlide();
s.background = { color: DARK };
kicker(s, "Proof", M, 0.65, COBALT_LT);
s.addText("It runs on a real durable agent.", { x: M, y: 1.05, w: 11.5, h: 0.9, fontFace: SANS, fontSize: 34, bold: true, color: WHITE, charSpacing: -0.8, margin: 0 });
s.addText("A real LangGraph agent loses its Microsoft grant mid-run. Revive checkpoints, fences the credential generation, reauthorizes, and resumes the exact action, exactly once.", { x: M, y: 2.0, w: 11.3, h: 0.8, fontFace: SANS, fontSize: 15, color: "AAB4C6", lineSpacingMultiple: 1.15, margin: 0 });
const stats = [["8 / 8", "steps recovered"], ["0", "worker restarts"], ["exactly once", "action replay"], ["256-bit", "one-time links"]];
const stw = (11.63 - 0.9) / 4;
stats.forEach(([v, l], i) => {
  const x = M + i * (stw + 0.3);
  s.addText(v, { x, y: 3.5, w: stw, h: 0.95, fontFace: SANS, fontSize: i >= 2 ? 30 : 46, bold: true, color: i === 0 ? COBALT_LT : WHITE, charSpacing: -1, valign: "bottom", margin: 0 });
  s.addText(l, { x, y: 4.55, w: stw, h: 0.4, fontFace: MONO, fontSize: 12, color: INKFAINT, margin: 0 });
});
card(s, M, 5.5, 11.63, 1.15, DARK2, { line: "26303F" });
s.addText([
  { text: "$ python -m examples.langgraph_agent", options: { color: COBALT_LT, breakLine: true } },
  { text: "  recovered the run on the same thread · 0 restarts · replayed once", options: { color: INKFAINT } },
], { x: M + 0.4, y: 5.72, w: 11, h: 0.75, fontFace: MONO, fontSize: 13, lineSpacingMultiple: 1.35, margin: 0, valign: "middle" });
s.addNotes("This is the demo slide. Run the recovery lab live: kill a credential, watch the durable run survive a worker restart and resume exactly once.");

// ============================================================ 7 · INTEGRATIONS
s = p.addSlide();
s.background = { color: WHITE };
kicker(s, "Integrations", M, 0.65, COBALT);
s.addText("It plugs into the stack teams already run.", { x: M, y: 1.05, w: 11.8, h: 1.0, fontFace: SANS, fontSize: 31, bold: true, color: INK, charSpacing: -0.7, margin: 0 });
s.addText("Revive sits between the credential layer and the durable runtime, as a thin adapter on each side.", { x: M, y: 1.95, w: 11.4, h: 0.5, fontFace: SANS, fontSize: 14.5, color: INKMUT, margin: 0 });
const integ = [
  ["LangGraph", "native interrupt + checkpoint adapter", "runtime"],
  ["Microsoft Entra", "Authorization Code + PKCE adapter", "identity"],
  ["Nango", "connect-session and proxy adapter", "identity"],
  ["Temporal", "signal-based resume adapter", "runtime"],
];
const igw = (11.63 - 0.6) / 2, igh = 1.6;
integ.forEach(([name, detail, kind], i) => {
  const x = M + (i % 2) * (igw + 0.6);
  const y = 2.75 + Math.floor(i / 2) * (igh + 0.3);
  card(s, x, y, igw, igh, WHITE, { shadow: true });
  s.addShape(p.shapes.OVAL, { x: x + 0.4, y: y + 0.62, w: 0.12, h: 0.12, fill: { color: OK } });
  s.addText(name, { x: x + 0.72, y: y + 0.4, w: igw - 2.0, h: 0.4, fontFace: SANS, fontSize: 19, bold: true, color: INK, charSpacing: -0.3, margin: 0 });
  s.addText(detail, { x: x + 0.72, y: y + 0.9, w: igw - 1.4, h: 0.4, fontFace: MONO, fontSize: 12, color: INKMUT, margin: 0 });
  s.addText(kind.toUpperCase(), { x: x + igw - 1.6, y: y + 0.42, w: 1.25, h: 0.3, fontFace: SANS, fontSize: 8.5, bold: true, color: INKFAINT, charSpacing: 1.2, align: "right", margin: 0 });
});
s.addNotes("Neutral position: not locked to one vault or one runtime. The adapter surface is how we stay the layer everyone calls into.");

// ============================================================ 8 · WHY NOW
s = p.addSlide();
s.background = { color: PAPER };
kicker(s, "Why now", M, 0.65, COBALT);
s.addText("The pieces only just lined up.", { x: M, y: 1.05, w: 11.8, h: 1.0, fontFace: SANS, fontSize: 31, bold: true, color: INK, charSpacing: -0.7, margin: 0 });
const now = [
  ["Runs got long", "Agent workflows now run for hours or days and outlive the credential grants they started with."],
  ["Durable execution went mainstream", "Temporal, Trigger.dev and LangGraph made pause-and-resume normal, so there's finally a run to recover."],
  ["Reauthorization got a standard", "Out-of-band re-approval is now a standard flow, which is the secure identity handoff recovery needs."],
];
const nw = (11.63 - 0.8) / 3;
now.forEach(([t, d], i) => {
  const x = M + i * (nw + 0.4);
  s.addShape(p.shapes.OVAL, { x, y: 2.35, w: 0.5, h: 0.5, fill: { color: COBALT_SOFT }, line: { color: COBALT, width: 1 } });
  s.addText(String(i + 1), { x, y: 2.35, w: 0.5, h: 0.5, fontFace: MONO, fontSize: 14, bold: true, color: COBALT, align: "center", valign: "middle", margin: 0 });
  s.addText(t, { x, y: 3.05, w: nw, h: 0.55, fontFace: SANS, fontSize: 18, bold: true, color: INK, charSpacing: -0.3, lineSpacingMultiple: 1.0, margin: 0 });
  s.addText(d, { x, y: 3.7, w: nw - 0.1, h: 1.3, fontFace: SANS, fontSize: 13, color: INKMUT, lineSpacingMultiple: 1.18, margin: 0 });
});
s.addNotes("Three shifts converged: runs got long enough to outlive grants, durable execution made resume normal, and out-of-band reauthorization gave us a secure handoff. The problem is new and now acute.");

// ============================================================ 9 · DISTINCTIONS / MARKET
s = p.addSlide();
s.background = { color: WHITE };
kicker(s, "Where we fit", M, 0.65, COBALT);
s.addText("Adjacent to vaults and runtimes. Not either of them.", { x: M, y: 1.05, w: 11.8, h: 1.0, fontFace: SANS, fontSize: 31, bold: true, color: INK, charSpacing: -0.7, margin: 0 });
// left: distinctions
const dist = [
  ["Not a token vault", "We integrate with Nango and Auth0. We own the run–credential correlation and recovery around them."],
  ["Not workflow retry", "Retry replays a dead grant. We change the credential generation and preserve the action key."],
  ["Not an observability tool", "Trace data can come later. The wedge is recovery, and we won't dilute it."],
];
s.addText("WHAT WE ARE NOT", { x: M, y: 2.2, w: 5.5, h: 0.3, fontFace: SANS, fontSize: 9, bold: true, color: INKFAINT, charSpacing: 1.6, margin: 0 });
dist.forEach(([t, d], i) => {
  const y = 2.65 + i * 1.25;
  s.addText([{ text: "✕  ", options: { color: FAIL, bold: true } }, { text: t, options: { color: INK } }], { x: M, y, w: 5.6, h: 0.4, fontFace: SANS, fontSize: 16, bold: true, charSpacing: -0.3, margin: 0 });
  s.addText(d, { x: M + 0.38, y: y + 0.42, w: 5.3, h: 0.7, fontFace: SANS, fontSize: 12.5, color: INKMUT, lineSpacingMultiple: 1.12, margin: 0 });
});
// right: funded thesis
card(s, 7.15, 2.2, 5.35, 4.35, PAPER, { line: HAIR });
s.addText("THE CATEGORY AROUND US IS FUNDED", { x: 7.5, y: 2.55, w: 4.8, h: 0.3, fontFace: SANS, fontSize: 9, bold: true, color: COBALT, charSpacing: 1.4, margin: 0 });
const raises = [["Arcade.dev", "$60M Series A"], ["Composio", "$25M Series A"], ["Nango", "$7.5M (YC)"], ["Scalekit", "$5.5M seed"], ["Stytch", "acq. by Twilio"]];
raises.forEach(([c, r], i) => {
  const y = 3.2 + i * 0.6;
  s.addText(c, { x: 7.5, y, w: 3, h: 0.4, fontFace: SANS, fontSize: 16, bold: true, color: INK, charSpacing: -0.3, margin: 0 });
  s.addText(r, { x: 9.7, y: y + 0.04, w: 2.5, h: 0.4, fontFace: MONO, fontSize: 12.5, color: INKMUT, align: "right", margin: 0 });
  if (i < raises.length - 1) s.addShape(p.shapes.LINE, { x: 7.5, y: y + 0.48, w: 4.65, h: 0, line: { color: HAIR, width: 1 } });
});
s.addText("Money went to the vaults and the runtimes. The recovery layer between them is open.", { x: 7.5, y: 6.0, w: 4.7, h: 0.45, fontFace: SANS, fontSize: 11.5, italic: true, color: INKMUT, lineSpacingMultiple: 1.1, margin: 0 });
s.addNotes("Two framings at once: what we are NOT (kills the obvious objections), and the funded adjacency (the thesis is hot, the exact seam is unclaimed).");

// ============================================================ 10 · DIRECTION (dark)
s = p.addSlide();
s.background = { color: DARK };
kicker(s, "Direction", M, 0.65, COBALT_LT);
s.addText("Recovery is the wedge. Run reliability is the platform.", { x: M, y: 1.05, w: 11.6, h: 1.2, fontFace: SANS, fontSize: 32, bold: true, color: WHITE, charSpacing: -0.8, lineSpacingMultiple: 1.03, margin: 0 });
s.addText("We earn the platform only when customers pull us there. Recovery first, expansion later.", { x: M, y: 2.35, w: 11, h: 0.5, fontFace: SANS, fontSize: 14.5, color: "AAB4C6", margin: 0 });
const dir = [
  ["Now", "Credential failure recovery", "implemented foundation", OK],
  ["Next", "Vault and runtime integration matrix", "design-partner work", COBALT_LT],
  ["Later", "Run health, cost and policy intelligence", "earned expansion", INKFAINT],
];
dir.forEach(([label, title, status, col], i) => {
  const y = 3.35 + i * 1.05;
  card(s, M, y, 11.63, 0.85, DARK2, { line: "26303F" });
  s.addText(label.toUpperCase(), { x: M + 0.35, y: y + 0.27, w: 1.2, h: 0.3, fontFace: SANS, fontSize: 10, bold: true, color: col, charSpacing: 1.4, margin: 0 });
  s.addText(title, { x: M + 1.9, y: y + 0.24, w: 7.0, h: 0.4, fontFace: SANS, fontSize: 16, bold: true, color: WHITE, charSpacing: -0.3, margin: 0 });
  s.addText(status, { x: M + 8.7, y: y + 0.28, w: 2.6, h: 0.3, fontFace: MONO, fontSize: 11, color: INKFAINT, align: "right", margin: 0 });
});
s.addNotes("This kills 'feature, not a company' without overpromising. The recovery wedge is real and shipped; reliability/cost/policy is the earned platform, not a second product promise on day one.");

// ============================================================ 11 · ASK (dark)
s = p.addSlide();
s.background = { color: DARK };
kicker(s, "The ask", M, 0.7, COBALT_LT);
s.addText("What we're raising.", { x: M, y: 1.15, w: 11, h: 0.9, fontFace: SANS, fontSize: 36, bold: true, color: WHITE, charSpacing: -0.8, margin: 0 });
const asks = [
  "Two infrastructure engineers",
  "Microsoft Entra + Nango GA, the Temporal adapter",
  "Hosted checkpoint + recovery control plane",
  "Ten design partners running durable agents",
];
asks.forEach((a, i) => {
  const y = 2.5 + i * 0.7;
  s.addText([{ text: "→  ", options: { color: COBALT_LT, bold: true } }, { text: a, options: { color: "E4E8F0" } }], { x: M, y, w: 9.5, h: 0.45, fontFace: SANS, fontSize: 18, margin: 0 });
});
wordmark(s, M, 6.25, 26, true);
s.addText("founders@revive.dev   ·   github.com/revive-labs/revive", { x: 6.5, y: 6.5, w: 6.0, h: 0.4, fontFace: MONO, fontSize: 12, color: INKFAINT, align: "right", margin: 0 });
s.addNotes("Close on the ask and the 18-month shape. One-liner to leave them with: credential failures shouldn't kill durable workflows.");

p.writeFile({ fileName: "/Users/srikanthsamy1/Revive/deck/Revive-Seed-Deck.pptx" }).then((f) => console.log("wrote", f));
