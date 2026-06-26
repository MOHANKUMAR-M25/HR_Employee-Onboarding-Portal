package com.cognizant.adlc;

import static com.cognizant.adlc.Dsl.arr;
import static com.cognizant.adlc.Dsl.obj;

import java.util.List;
import java.util.Map;

/**
 * The "ADLC" onboarding agent. From a single goal ("get this person productive
 * on day one"), instead of running a fixed, identical sequence of steps for
 * every hire it:
 *   1. looks up the hire and forms a mental model (memory),
 *   2. reasons about employment type / region / department / timing,
 *   3. plans and invokes only the tools that apply (dynamic tool use),
 *   4. retrieves the right policy docs via RAG,
 *   5. reflects + retries when a tool fails, and
 *   6. raises compliance flags a human should see.
 *
 * <p>The reasoning here is deterministic rule-based logic dressed as agent
 * "thoughts" — chosen so the live demo is 100% repeatable. The shape of the
 * output (reasoning + tool calls + reflection + flags) is exactly what a real
 * LLM-driven agent would emit, so swapping in a model later is a drop-in.
 */
public final class AdlcAgent {

    private final PolicyStore policies = new PolicyStore();

    public Map<String, Object> run(Map<String, Object> hire) {
        String name = (String) hire.get("name");
        String first = name.split(" ")[0];
        String title = (String) hire.get("title");
        String dept = (String) hire.get("department");
        String employment = (String) hire.get("employmentType");
        String country = (String) hire.get("country");
        String region = (String) hire.get("region");
        boolean contractor = "CONTRACTOR".equals(employment);
        boolean intern = "INTERN".equals(employment);
        boolean eu = "EU".equals(region);
        boolean midQuarter = "mid-quarter".equals(hire.get("startTiming"));
        boolean quarterEnd = "quarter-end".equals(hire.get("startTiming"));

        List<String> reasoning = arr();
        List<Map<String, Object>> toolCalls = arr();
        List<Map<String, Object>> complianceFlags = arr();
        List<String> skipped = arr();

        // --- 1. Perceive: load the profile into working memory ----------------
        reasoning.add("Goal: onboard " + first + " and make day one productive. "
                + "First, load the profile so I know who I'm onboarding.");
        toolCalls.add(tool("hr_lookup", obj("id", hire.get("id")), "done",
                "Loaded: " + name + " · " + title + " · " + employment + " · "
                + country + " · starts " + hire.get("startTiming") + ".", null));

        // --- 2. Reason about the classification -------------------------------
        reasoning.add("Classifying hire — employment=" + employment
                + ", region=" + region + " (" + country + "), dept=" + dept + ".");

        // --- 3. Retrieve the policies that actually apply (RAG) ---------------
        List<Map<String, Object>> docs = policies.retrieve(hire);
        List<String> citations = arr();
        for (Map<String, Object> d : docs) citations.add((String) d.get("source"));
        reasoning.add("Retrieving the governing policy for this exact profile rather "
                + "than assuming the default handbook.");
        toolCalls.add(tool("policy_rag",
                obj("query", employment + " onboarding in " + country),
                "done",
                "Retrieved " + docs.size() + " relevant section(s).",
                obj("docs", docs, "citations", dedupe(citations))));

        // --- 4. Always-on tools: localised welcome email ----------------------
        reasoning.add("Drafting a welcome email localised for " + country
                + " (greeting \"" + hire.get("greeting") + "\") and scoped to a "
                + employment + " " + title + ".");
        Map<String, Object> email = buildEmail(hire, contractor, intern, eu);
        toolCalls.add(tool("email_service",
                obj("to", hire.get("email"), "localised", true),
                "done", "Localised welcome email drafted (rendered in the UI).", null));

        // --- 5. Slack — with a simulated transient failure + reflection -------
        reasoning.add("Inviting to Slack. (Tool reported a transient error — "
                + "reflecting and retrying with backoff instead of failing the run.)");
        toolCalls.add(tool("slack_api", obj("invite", hire.get("email")),
                "retry", "Rate limited (HTTP 429).",
                obj("reflection", "Transient failure → wait 2s, retry once.")));
        toolCalls.add(tool("slack_api", obj("invite", hire.get("email")),
                "done", "Workspace invite sent on retry.", null));

        // --- 6. Branch on employment type -------------------------------------
        if (contractor) {
            reasoning.add("Contractor → the FTE buddy program and payroll/benefits "
                    + "do NOT apply. Skipping both and assigning a contractor liaison.");
            skipped.add("FTE payroll & benefits enrolment (not applicable to a contractor).");
            skipped.add("FTE buddy program — replaced with a contractor liaison.");
            toolCalls.add(tool("hris", obj("action", "assign_contractor_liaison"),
                    "done", "Assigned a contractor liaison instead of an FTE buddy.", null));
            toolCalls.add(tool("itsm", obj("provision", "BYOD + scoped VPN"),
                    "done", "Issued BYOD/MDM + scoped VPN access (no asset PO).", null));
        } else {
            // FTE and interns share the buddy + managed-laptop setup; only FTEs
            // are enrolled in payroll & benefits.
            reasoning.add((intern ? "Intern" : "Full-time hire")
                    + " → buddy and a managed laptop"
                    + (intern
                        ? ". Interns are paid by stipend, so company payroll & benefits enrolment does NOT apply — skipping it."
                        : ", plus payroll & benefits enrolment."));
            toolCalls.add(tool("hris", obj("action", "assign_buddy"),
                    "done", "Paired with an in-time-zone buddy for 30 days.", null));
            toolCalls.add(tool("itsm", obj("provision", "managed laptop"),
                    "done", "Raised a managed-laptop provisioning order for " + country + ".", null));
            if (intern) {
                skipped.add("Payroll & benefits enrolment (interns are paid by stipend, not FTE payroll).");
            } else {
                toolCalls.add(tool("workday", obj("action", "enrol_payroll_benefits"),
                        "done", "Enrolled in regional payroll & benefits.", null));
            }
        }

        // --- 7. Region / compliance reasoning ---------------------------------
        if (eu) {
            reasoning.add("EU/Germany → GDPR applies. Gating system access on a "
                    + "data-processing notice and notifying the works council.");
            complianceFlags.add(flag("warning",
                    "GDPR Art. 13 data-processing notice must be acknowledged before "
                    + "system access is granted.", "DE-Contractor-Policy.pdf §4"));
            complianceFlags.add(flag("info",
                    "Works council (Betriebsrat) notification queued for this engagement.",
                    "DE-Contractor-Policy.pdf §4"));
            toolCalls.add(tool("calendar", obj("event", "GDPR notice + compliance review"),
                    "done", "Scheduled compliance acknowledgement + review.", null));
        }

        // --- 8. Timing reasoning ----------------------------------------------
        if (quarterEnd) {
            reasoning.add("Quarter-end start → this quarter's cohort has already run. "
                    + "Booking self-paced orientation now and reserving a seat in next "
                    + "quarter's new-hire cohort.");
            toolCalls.add(tool("calendar", obj("event", "self-paced orientation + next-quarter cohort"),
                    "done", "Booked self-paced orientation and reserved a next-quarter cohort seat.", null));
        } else if (midQuarter) {
            reasoning.add("Mid-quarter start → the quarterly cohort orientation has "
                    + "passed. Scheduling self-paced orientation + a manager 1:1 instead.");
            toolCalls.add(tool("calendar", obj("event", "self-paced orientation + 1:1"),
                    "done", "Booked self-paced orientation and a day-1 manager 1:1.", null));
        } else {
            reasoning.add("Quarter-start joiner → enrolling in the live new-hire cohort.");
            toolCalls.add(tool("calendar", obj("event", "new-hire cohort orientation"),
                    "done", "Enrolled in the live new-hire cohort session.", null));
        }

        reasoning.add("Plan complete. " + toolDoneCount(toolCalls) + " tool calls executed, "
                + complianceFlags.size() + " compliance flag(s) raised, "
                + skipped.size() + " inapplicable step(s) skipped — no new code required.");

        return obj(
                "mode", "ADLC",
                "persona", hire,
                "reasoning", reasoning,
                "toolCalls", toolCalls,
                "complianceFlags", complianceFlags,
                "skipped", skipped,
                "citations", dedupe(citations),
                "email", email,
                "summary", "Agent adapted the plan to a " + employment + " in " + country
                        + " — different tools, different policy, different compliance — "
                        + "all from the same goal, with zero new branches.");
    }

    /** ADLC email is localised + role/region aware. */
    private Map<String, Object> buildEmail(Map<String, Object> hire, boolean contractor, boolean intern, boolean eu) {
        String first = ((String) hire.get("name")).split(" ")[0];
        String greeting = (String) hire.get("greeting");
        String title = (String) hire.get("title");
        StringBuilder body = new StringBuilder();
        body.append(greeting).append(" ").append(first).append(",\n\n");
        body.append("Welcome aboard as ").append(article(title)).append(" ")
            .append(title).append("! ");
        if (contractor) {
            body.append("As a contractor, your setup is BYOD with scoped VPN access — "
                    + "no FTE payroll, benefits or buddy program apply. ");
        } else if (intern) {
            body.append("Your managed laptop is on its way and you've been paired with a "
                    + "buddy. As an intern you're paid by stipend, so company payroll & "
                    + "benefits enrolment doesn't apply. ");
        } else {
            body.append("Your managed laptop is on its way, you've been paired with a "
                    + "buddy, and payroll & benefits are set up. ");
        }
        if (eu) {
            body.append("\n\nBefore your first login, please acknowledge the GDPR "
                    + "data-processing notice we've shared (required in the EU). ");
        }
        body.append("\n\nSee you soon,\nThe Onboarding Team");
        return obj(
                "to", hire.get("email"),
                "greeting", greeting,
                "subject", greeting + " " + first + " — welcome to Cognizant ("
                        + hire.get("country") + ")",
                "body", body.toString(),
                "personalised", true);
    }

    private static String article(String word) {
        char c = Character.toLowerCase(word.charAt(0));
        return "aeiou".indexOf(c) >= 0 ? "an" : "a";
    }

    private static Map<String, Object> tool(
            String name, Map<String, Object> args, String status, String result, Map<String, Object> extra) {
        Map<String, Object> m = obj("tool", name, "args", args, "status", status, "result", result);
        if (extra != null) m.putAll(extra);
        return m;
    }

    private static Map<String, Object> flag(String level, String text, String source) {
        return obj("level", level, "text", text, "source", source);
    }

    private static int toolDoneCount(List<Map<String, Object>> calls) {
        int n = 0;
        for (Map<String, Object> c : calls) if (!"retry".equals(c.get("status"))) n++;
        return n;
    }

    private static List<String> dedupe(List<String> in) {
        List<String> out = arr();
        for (String s : in) if (!out.contains(s)) out.add(s);
        return out;
    }
}
