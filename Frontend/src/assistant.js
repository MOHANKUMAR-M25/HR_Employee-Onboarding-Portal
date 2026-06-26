// Offline onboarding assistant — a deterministic, no-API "agent".
//
// It turns a plain-English instruction into a PLAN (a list of tool calls),
// runs those tools against the live portal, then narrates what it did. There
// is no LLM and no network call: intent + entities are extracted with regex,
// so the same demo works on any machine, offline, behind any proxy.
//
//   interpret(text)        -> { understood, steps:[{tool,args,label}], reply?, lines? }
//   runAssistant(text,tools)-> executes the plan and returns a renderable turn
//   matchHire(hire,criteria)-> shared candidate predicate (also used by App tools)

// ---- vocabulary --------------------------------------------------------
const TYPE_ONE = { INTERN: "intern", CONTRACTOR: "contractor", FTE: "full-time employee" };
const TYPE_MANY = { INTERN: "interns", CONTRACTOR: "contractors", FTE: "full-time employees" };
const REGION_WORD = { NA: "North America", EU: "Europe", APAC: "APAC", ASIA: "Asia", LATAM: "LATAM" };

const EMAIL_RE = /[^\s,;<>"]+@[^\s,;<>"]+\.[^\s,;<>"]+/;

// Words that look like a name after a verb but are really keywords.
const RESERVED = /^(all|every|everyone|everybody|each|any|some|the|a|an|new|hire|hires|candidate|candidates|people|person|intern|interns|trainee|contractor|contractors|consultant|fte|full|permanent|staff|employee|employees|selected|selection|none|dashboard|sample|samples|data|file|asia|asian|apac|pacific|europe|european|eu|emea|na|usa?|latam|north|south|america|americas|quarter|them|us)$/i;

// ---- entity extractors -------------------------------------------------
function typeIn(s) {
  if (/\bintern(s|ship)?\b|\btrainee\b|\bapprentice\b/.test(s)) return "INTERN";
  if (/\bcontractors?\b|\bcontract\b|\bconsultants?\b|\bvendor\b|\bfreelancer?\b|\btemp\b/.test(s)) return "CONTRACTOR";
  if (/\bfull[- ]?time\b|\bfte\b|\bpermanent\b|\bfull[- ]?timers?\b/.test(s)) return "FTE";
  return null;
}

function regionIn(s) {
  if (/\bapac\b|asia[- ]?pacific|\bpacific\b/.test(s)) return "APAC";
  if (/\basian?\b/.test(s)) return "ASIA"; // Asia, kept distinct from APAC
  if (/\beu\b|\beurope(an)?\b|\bemea\b/.test(s)) return "EU";
  if (/\blatam\b|latin america|south america/.test(s)) return "LATAM";
  if (/\bna\b|north america|americas|\busa?\b|united states/.test(s)) return "NA";
  return null;
}

function timingIn(s) {
  if (/mid[- ]?quarter/.test(s)) return "mid-quarter";
  if (/quarter[- ]?end|end of (the )?quarter/.test(s)) return "quarter-end";
  if (/quarter[- ]?start|start of (the )?quarter/.test(s)) return "quarter-start";
  return null;
}

function departmentIn(s) {
  let m = s.match(/\bin (?:the )?([a-z][a-z &/.+-]*?) (?:department|dept|team|org|function)\b/);
  if (m) return tidy(m[1]);
  m = s.match(/\b(?:department|dept|team|function)\s*(?:[:=]|is|of)?\s+([a-z][a-z &/.+-]*?)(?=,|$|\s+(?:intern|contractor|fte|region|in)\b)/);
  if (m) return tidy(m[1]);
  return null;
}

function tidy(v) {
  return String(v || "").replace(/\s+/g, " ").trim().replace(/[.,;]+$/, "");
}

// A capitalised (or quoted) person name following an action verb. The verb is
// matched case-insensitively, but the name must be Capitalised so keywords
// ("all", "everyone", …) and lowercase nouns aren't mistaken for a person.
function personIn(original) {
  const q = original.match(/["“'']([^"”'']{2,})["”'']/);
  if (q) return q[1].trim();
  const v = original.match(/\b(?:onboard|remove|delete|drop|exclude|select|choose|pick|find|show)\b\s+(?:the\s+)?(.+)/i);
  if (!v) return null;
  const m = v[1].match(/^((?:[A-Z][\p{L}'.-]+)(?:\s+[A-Z][\p{L}'.-]+){0,3})/u);
  if (!m) return null;
  if (RESERVED.test(m[1].split(/\s+/)[0])) return null;
  return m[1].trim();
}

// Fallback name for the remove verb: take whatever follows it (any case), so
// casual phrasing like "remove priya nair" works without a capitalised name.
function removalName(original) {
  const m = original.match(/\b(?:remove|delete|drop|exclude)\s+(?:the\s+)?(.+?)\s*$/i);
  if (!m) return null;
  const who = tidy(m[1].replace(/\b(candidate|hire|joiner|employee|from (the )?list|please)\b/gi, ""));
  return who || null;
}

function gatherCriteria(s) {
  const c = {};
  const t = typeIn(s); if (t) c.type = t;
  const r = regionIn(s); if (r) c.region = r;
  const d = departmentIn(s); if (d) c.department = d;
  return c;
}

// ---- add-a-hire parsing ------------------------------------------------
function labelVal(original, keys) {
  const re = new RegExp(
    `\\b(?:${keys})\\b\\s*(?:[:=]|is|as|of)?\\s*([A-Za-z][A-Za-z0-9 &/.+-]*?)` +
      `(?=,|$|\\s+(?:title|role|position|department|dept|team|in|as|email|intern|contractor|fte|region|asia|apac|europe|eu|na|latam|quarter|@))`,
    "i"
  );
  const m = original.match(re);
  return m ? tidy(m[1]) : "";
}

function parseHire(original) {
  const s = original.toLowerCase();
  const email = (original.match(EMAIL_RE) || [])[0] || "";

  let name = "";
  let m = original.match(/\b(?:named?|called)\s+(?:is\s+)?([A-Z][\p{L}'.-]+(?:\s+[A-Z][\p{L}'.-]+){0,3})/u);
  if (m) name = m[1].trim();
  if (!name) {
    // capitalised run after the add verb, before the email or first comma
    const after = original.replace(
      /^[^A-Za-z]*\b(?:please\s+)?(?:add|create|register|enroll|onboard)\b\s*(?:a\s+)?(?:new\s+)?(?:hire|candidate|joiner|employee)?\s*/i,
      ""
    );
    const beforeEmail = email ? after.split(email)[0] : after;
    const seg = beforeEmail.split(",")[0];
    const nm = seg.match(/([A-Z][\p{L}'.-]+(?:\s+[A-Z][\p{L}'.-]+){0,3})/u);
    if (nm) name = nm[1].trim();
  }

  const data = { name, email };
  const title = labelVal(original, "title|role|position|designation") || asTitle(original);
  if (title) data.title = title;
  const dept = labelVal(original, "department|dept|team|function") || departmentIn(s);
  if (dept) data.department = dept;
  const t = typeIn(s); if (t) data.employmentType = t;
  const r = regionIn(s); if (r) data.region = r;
  const tm = timingIn(s); if (tm) data.startTiming = tm;
  return data;
}

function asTitle(original) {
  const m = original.match(/\bas an?\s+([A-Za-z][A-Za-z0-9 &/.+-]*?)(?=,|$|\s+in\b|\s+(?:intern|contractor|fte|region))/i);
  return m ? tidy(m[1]) : "";
}

// ---- intent -> plan ----------------------------------------------------
export function interpret(text) {
  const original = (text || "").trim();
  const s = original.toLowerCase();
  if (!s) return { understood: "", steps: [], reply: "Type a command and I'll run it — e.g. “onboard all interns in Asia”." };

  if (/^(help|menu|\?|commands?)$/.test(s) || /what can you do|how do (i|you)|show.*commands|examples?/.test(s)) {
    return helpTurn();
  }

  const steps = [];

  // --- modifiers (can co-occur with a primary action) ---
  let theme = null;
  if (/dark (mode|theme)|night mode/.test(s)) theme = "dark";
  else if (/light (mode|theme)|day mode/.test(s)) theme = "light";
  else if (/system (mode|theme)|auto theme|match (the )?(os|system)/.test(s)) theme = "system";
  if (theme) steps.push({ tool: "setTheme", args: { pref: theme }, label: `Switch to ${theme} theme` });

  if (/\bdashboard\b|analytics view/.test(s)) steps.push({ tool: "setView", args: { view: "dashboard" }, label: "Open the dashboard" });
  else if (/(onboarding|onboard|home|main)\s+(view|screen|page|tab)|go back|back to onboarding/.test(s)) steps.push({ tool: "setView", args: { view: "onboard" }, label: "Open the onboarding view" });

  if (/\bimport\b/.test(s) || /\bload\b.*\b(sample|candidate|hire|data|file)/.test(s) || /(bring|pull) in.*\b(sample|candidate|hire)/.test(s)) {
    steps.push({ tool: "importSample", args: {}, label: "Import sample candidates" });
  }

  // --- criteria shared by select / onboard / list / count / remove ---
  const criteria = gatherCriteria(s);
  const person = personIn(original);
  if (person) criteria.name = person;
  const hasCriteria = Object.keys(criteria).length > 0;

  // --- one primary action ---
  const isAdd = /\b(add|create|register|enroll)\b/.test(s) ||
    (/\bnew (hire|candidate|joiner|employee)\b/.test(s) && EMAIL_RE.test(original) && !/\bonboard\b/.test(s));

  if (isAdd) {
    const data = parseHire(original);
    if (!data.name || !data.email) {
      return {
        understood: "Add a new hire",
        steps: [],
        reply: "I can add a hire — I just need at least a name and a work email.",
        lines: ["Try: add a new hire named Asha Rao, asha.rao@cognizant.com, Software Engineer, Engineering, intern, Asia, quarter-end"],
      };
    }
    steps.push({ tool: "addHire", args: data, label: `Add ${data.name}` });
  } else if (/\bonboard\b|send (the )?(welcome|invite|invitation)|\binvite\b|kick off/.test(s)) {
    if (/\bselected\b|current selection|the selection/.test(s)) {
      steps.push({ tool: "onboardSelected", args: {}, label: "Onboard the selected candidates" });
    } else if (hasCriteria) {
      steps.push({ tool: "onboardCriteria", args: criteria, label: `Onboard ${criteriaPhrase(criteria)}` });
    } else if (/\ball\b|everyone|everybody|each\b|every (candidate|hire|new hire)/.test(s)) {
      steps.push({ tool: "onboardCriteria", args: {}, label: "Onboard all candidates" });
    } else {
      steps.push({ tool: "onboardSelected", args: {}, label: "Onboard the selected candidates" });
    }
  } else if (/\b(deselect|unselect|uncheck|untick)\b/.test(s)) {
    if (!hasCriteria) steps.push({ tool: "clearSelection", args: {}, label: "Clear the selection" });
    else steps.push({ tool: "deselect", args: criteria, label: `Deselect ${criteriaPhrase(criteria)}` });
  } else if (/clear (the )?selection|select none|deselect all/.test(s)) {
    steps.push({ tool: "clearSelection", args: {}, label: "Clear the selection" });
  } else if (/\b(select|choose|pick|tick|check|mark)\b/.test(s)) {
    if (hasCriteria) steps.push({ tool: "select", args: criteria, label: `Select ${criteriaPhrase(criteria)}` });
    else steps.push({ tool: "selectAll", args: {}, label: "Select all candidates" });
  } else if (/\b(remove|delete|drop|exclude)\b|take out/.test(s)) {
    if (person) steps.push({ tool: "remove", args: person, label: `Remove ${person}` });
    else if (hasCriteria) steps.push({ tool: "removeMatching", args: criteria, label: `Remove ${criteriaPhrase(criteria)}` });
    else {
      const who = removalName(original);
      if (who) steps.push({ tool: "remove", args: who, label: `Remove ${who}` });
      else return ask("Who should I remove? e.g. “remove Priya Nair”.");
    }
  } else if (/how many|\bcount\b|number of|how much/.test(s)) {
    steps.push({ tool: "count", args: criteria, label: `Count ${criteriaPhrase(criteria)}` });
  } else if (/\b(stats|statistics|summary|summarize|summarise|analytics|breakdown|overview|report|insights?)\b/.test(s)) {
    steps.push({ tool: "stats", args: {}, label: "Summarise the pipeline" });
  } else if (/\b(list|show|display|find|search|who'?s?|who is|who are|which)\b/.test(s) && !/\bdashboard\b/.test(s)) {
    steps.push({ tool: "list", args: criteria, label: `List ${criteriaPhrase(criteria)}` });
  }

  if (!steps.length) {
    return {
      understood: "",
      steps: [],
      reply: "I didn't catch a command there. Type “help” to see what I can do, or try “import the sample candidates”.",
    };
  }
  return { understood: steps.map((st) => st.label).join("  →  "), steps };
}

// ---- run the plan ------------------------------------------------------
export async function runAssistant(text, tools) {
  const plan = interpret(text);
  if (!plan.steps || !plan.steps.length) {
    return { understood: plan.understood || "", actions: [], reply: plan.reply, lines: plan.lines || [] };
  }
  const actions = [];
  const results = [];
  for (const step of plan.steps) {
    try {
      const res = (await tools[step.tool]?.(step.args)) || {};
      results.push({ step, res });
      const failed = res && res.error;
      actions.push({ label: step.label, ok: !failed, note: failed ? res.error : noteFor(step, res) });
    } catch (e) {
      results.push({ step, res: { error: e.message } });
      actions.push({ label: step.label, ok: false, note: e.message });
    }
  }
  const { reply, lines } = summarize(results);
  return { understood: plan.understood, actions, reply, lines };
}

// Shared candidate predicate — also imported by App's tool layer.
export function matchHire(h, c) {
  if (!c) return true;
  if (c.type && h.employmentType !== c.type) return false;
  if (c.region && h.region !== c.region) return false;
  if (c.department && !String(h.department).toLowerCase().includes(c.department.toLowerCase())) return false;
  if (c.title && !String(h.title).toLowerCase().includes(c.title.toLowerCase())) return false;
  if (c.name && !`${h.name} ${h.email}`.toLowerCase().includes(c.name.toLowerCase())) return false;
  return true;
}

export function tally(arr) {
  const m = {};
  for (const v of arr) m[v] = (m[v] || 0) + 1;
  return m;
}

// ---- narration ---------------------------------------------------------
function criteriaPhrase(c) {
  const parts = [];
  parts.push(c.type ? TYPE_MANY[c.type] : "candidates");
  if (c.department) parts.push(`in ${c.department}`);
  if (c.region) parts.push(`in ${REGION_WORD[c.region]}`);
  if (c.name) parts.push(`matching “${c.name}”`);
  return parts.join(" ");
}

function labelCriteria(c) {
  return c && Object.keys(c).length ? criteriaPhrase(c) : "in total";
}

function plural(n, one, many) {
  return n === 1 ? one : many;
}

function fmtTally(obj, dict) {
  const keys = Object.keys(obj);
  if (!keys.length) return "—";
  return keys.map((k) => `${dict[k] || k}: ${obj[k]}`).join(", ");
}

function noteFor(step, res) {
  switch (step.tool) {
    case "importSample": return `${res.count} loaded`;
    case "addHire": return res.hire?.name || "";
    case "select":
    case "selectAll":
    case "deselect": return `${res.matched} matched`;
    case "onboardCriteria":
    case "onboardSelected": return res.matched ? `${res.sent}/${res.matched} sent` : "none";
    case "count": return `${res.count}`;
    case "list": return `${res.candidates.length} found`;
    case "remove": return res.removed;
    case "removeMatching": return `${res.removed.length} removed`;
    default: return "";
  }
}

function summarize(results) {
  const sentences = [];
  let lines = [];
  for (const { step, res } of results) {
    if (res && res.error) { sentences.push(res.error); continue; }
    const c = step.args;
    switch (step.tool) {
      case "importSample":
        sentences.push(`Imported ${res.count} candidates from the sample file and selected them all.`);
        break;
      case "addHire": {
        const h = res.hire;
        sentences.push(
          `Added ${h.name} — ${h.title}, ${TYPE_ONE[h.employmentType] || h.employmentType}, ${REGION_WORD[h.region] || h.region}, ${h.startTiming}. They're selected and ready to onboard.`
        );
        break;
      }
      case "selectAll":
        sentences.push(res.matched ? `Selected all ${res.matched} candidates.` : `There are no candidates to select yet — import or add some first.`);
        break;
      case "select":
        if (!res.matched) sentences.push(`No candidates matched (${criteriaPhrase(c)}).`);
        else { sentences.push(`Selected ${res.matched} ${plural(res.matched, "candidate", "candidates")} — ${labelCriteria(c)}.`); lines = res.names; }
        break;
      case "deselect":
        sentences.push(`Deselected ${res.matched} ${plural(res.matched, "candidate", "candidates")}.`);
        break;
      case "clearSelection":
        sentences.push("Cleared the selection.");
        break;
      case "onboardCriteria":
      case "onboardSelected":
        if (!res.matched) sentences.push("There were no candidates to onboard — select some or import first.");
        else {
          sentences.push(
            `Onboarded ${res.matched} ${plural(res.matched, "candidate", "candidates")}: generated their plans and ${res.sent} welcome ${plural(res.sent, "email", "emails")} sent${res.failed ? `, ${res.failed} failed` : ""}.`
          );
          lines = res.names;
        }
        break;
      case "remove":
        sentences.push(`Removed ${res.removed} from the candidate list.`);
        break;
      case "removeMatching":
        sentences.push(res.removed.length ? `Removed ${res.removed.length} ${plural(res.removed.length, "candidate", "candidates")}: ${res.removed.join(", ")}.` : "No candidates matched to remove.");
        break;
      case "count":
        sentences.push(`${res.count} ${plural(res.count, "candidate", "candidates")} ${labelCriteria(c)} (out of ${res.total} total).`);
        break;
      case "list":
        if (!res.candidates.length) sentences.push(`No candidates found${Object.keys(c).length ? ` for ${criteriaPhrase(c)}` : ""} yet.`);
        else {
          sentences.push(`Found ${res.candidates.length} ${labelCriteria(c)}:`);
          lines = res.candidates.map((x) => `${x.name} — ${x.title} · ${TYPE_ONE[x.type] || x.type} · ${REGION_WORD[x.region] || x.region} · ${x.email}`);
        }
        break;
      case "stats":
        sentences.push(`Pipeline: ${res.total} ${plural(res.total, "candidate", "candidates")}, ${res.selected} selected, ${res.sent} ${plural(res.sent, "invitation", "invitations")} sent.`);
        lines = [`By type — ${fmtTally(res.byType, TYPE_ONE)}`, `By region — ${fmtTally(res.byRegion, REGION_WORD)}`];
        break;
      case "setView":
        sentences.push(`Opened the ${res.view === "dashboard" ? "dashboard" : "onboarding"} view.`);
        break;
      case "setTheme":
        sentences.push(`Switched to ${res.pref} theme.`);
        break;
      default:
        break;
    }
  }
  return { reply: sentences.join(" "), lines };
}

function ask(reply) {
  return { understood: "", steps: [], reply };
}

function helpTurn() {
  return {
    understood: "Here's what I can do",
    steps: [],
    reply: "I'm an offline assistant — I drive the portal for you from plain text (no API, nothing leaves this machine). Try any of these:",
    lines: [
      "Import the sample candidates",
      "Add a new hire named Asha Rao, asha.rao@cognizant.com, Software Engineer, Engineering, intern, Asia, quarter-end",
      "Select all interns in Asia   ·   Deselect contractors",
      "Onboard the selected candidates   ·   Onboard everyone in APAC",
      "How many contractors are there?   ·   List candidates in Europe",
      "Remove Priya Nair",
      "Give me a pipeline summary",
      "Open the dashboard   ·   Switch to dark mode",
    ],
  };
}
