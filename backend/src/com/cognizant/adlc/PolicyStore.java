package com.cognizant.adlc;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Stands in for a RAG pipeline over onboarding policy PDFs. The ADLC agent
 * calls {@code policy_rag} with a hire's attributes and gets back the relevant
 * document chunks + citations — so it retrieves the policy that governs each
 * specific hire instead of assuming one default handbook.
 */
public final class PolicyStore {

    /** A retrieved policy snippet with its source citation. */
    public static Map<String, Object> doc(String source, String section, String snippet) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("source", source);
        m.put("section", section);
        m.put("snippet", snippet);
        return m;
    }

    /**
     * Retrieve the policy docs relevant to a hire. Deterministic "retrieval"
     * driven by employment type + region so the demo is repeatable on stage.
     */
    public List<Map<String, Object>> retrieve(Map<String, Object> hire) {
        String employment = (String) hire.get("employmentType");
        String region = (String) hire.get("region");
        boolean contractor = "CONTRACTOR".equals(employment);
        boolean eu = "EU".equals(region);

        List<Map<String, Object>> hits = new java.util.ArrayList<>();

        if (contractor && eu) {
            hits.add(doc("DE-Contractor-Policy.pdf", "§2 Engagement",
                    "Contractors are engaged via a statement of work; no FTE benefits, "
                    + "payroll, or stock are provisioned."));
            hits.add(doc("DE-Contractor-Policy.pdf", "§4 Data & Compliance",
                    "Per GDPR Art. 13, a data-processing notice must be acknowledged "
                    + "before any system access is granted. Works council (Betriebsrat) "
                    + "must be notified of the engagement."));
            hits.add(doc("IT-Access-Guide.pdf", "§1 Contractor access",
                    "Contractors use BYOD with MDM enrolment + scoped VPN; no asset "
                    + "purchase order is raised."));
        } else if (contractor) {
            hits.add(doc("Contractor-Policy.pdf", "§2 Engagement",
                    "Contractors are engaged via a statement of work; benefits and "
                    + "payroll enrolment do not apply."));
            hits.add(doc("IT-Access-Guide.pdf", "§1 Contractor access",
                    "Contractors use BYOD with MDM enrolment + scoped VPN."));
        } else {
            hits.add(doc("FTE-Onboarding-Handbook.pdf", "§3 First week",
                    "FTEs are enrolled in payroll & benefits, assigned a buddy and "
                    + "issued a managed laptop per regional IT standards."));
            hits.add(doc("Buddy-Program-Guide.pdf", "§1 Pairing",
                    "Every full-time hire is paired with a buddy in the same time zone "
                    + "for their first 30 days."));
            if (eu) {
                hits.add(doc("EU-Data-Notice.pdf", "§1 GDPR",
                        "EU-based hires acknowledge a GDPR data-processing notice during "
                        + "account setup."));
            }
        }
        return hits;
    }
}
