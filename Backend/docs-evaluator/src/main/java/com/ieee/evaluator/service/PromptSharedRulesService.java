package com.ieee.evaluator.service;

import org.springframework.stereotype.Service;

@Service
public class PromptSharedRulesService {

    // ═════════════════════════════════════════════════════════════════════════
    // HARDCODED DEFAULTS — single source of truth for every configurable step.
    // These are returned by /api/professor/step-profiles/defaults and used as
    // the final fallback in the three-tier resolution chain.
    // ═════════════════════════════════════════════════════════════════════════

    public static final String DEFAULT_CORE_DIRECTIVE = """
        ═══════════════════════════════════════════════════════════
        CORE DIRECTIVE — SUBSTANCE OVER STYLE
        ═══════════════════════════════════════════════════════════
        Prioritize: technical depth, precision, logical consistency, and completeness.
        Ignore: font colors, margin sizes, spacing, table borders, page numbers — unless
        they render the document unreadable.
        Penalize heavily: vague, generic, or purely high-level descriptions.
        Reward: granular, precise, verifiable engineering details.

        SELF-CONSISTENCY RULE (mandatory):
        The numeric score you assign to each criterion MUST be directly derivable from
        your written justification. If your justification describes "mostly complete with
        minor gaps," the score must be 16 — not 8 or 20. Contradictions between prose and
        score will be treated as evaluation errors.

        EVIDENCE RULE (mandatory):
        When justifying any score, you MUST anchor it to the document with a direct quote
        or close paraphrase. Format: (Evidence: "...excerpt or paraphrase...")
        Do not make claims about the document that you cannot support with a specific reference.
        """;

    public static final String DEFAULT_STEP_0_GUARD = """
        ═══════════════════════════════════════════════════════════
        STEP 0 — GUARD CHECK
        ═══════════════════════════════════════════════════════════
        Count the meaningful words in the document (exclude headers, page numbers, metadata).
        If the document is empty OR contains fewer than 50 meaningful words:
          - Output exactly:
              Is the Document Empty?: Yes
              Document Type: UNDETERMINED
              Overall Score: 0/100
              Summary: Document is empty or has insufficient content to evaluate.
          - STOP. Do not execute any further steps.
        """;

    public static final String DEFAULT_STEP_1_DOC_TYPE = """
        ═══════════════════════════════════════════════════════════
        STEP 1 — DOCUMENT TYPE VERIFICATION
        ═══════════════════════════════════════════════════════════
        Pre-classifier detected type: %s

        Read the document and independently determine its type.
        - If you agree with the pre-classifier: proceed using the rubric below.
        - If you disagree: state the following in your output before the scores —
            Type Override: <Your Detected Type>
            Reason: <one-sentence justification>
          Then evaluate using YOUR detected type, not the pre-classifier's.
        """;

    public static final String DEFAULT_STEP_4_SCORING = """
        ═══════════════════════════════════════════════════════════
        STEP 4 — SCORING
        ═══════════════════════════════════════════════════════════
        Score each rubric criterion using the calibrated scale below.
        Apply the scale uniformly. Do not grade-inflate.

        Calibrated Scoring Scale (per criterion):
          20 = Professional Grade: Fully addressed with technical metrics, precise specifications, and zero ambiguity.
          16 = High Quality: Comprehensive but missing minor technical edge cases or granular justifications.
          12 = Satisfactory: Meets basic IEEE requirements but relies on high-level or generic descriptions.
           8 = Developing: Superficial mention of the topic with no implementation details or technical depth.
           4 = Critically Deficient: Section is absent, logically broken, or technically incorrect.

        For each criterion, your justification MUST:
          (a) Reference a specific section, passage, OR DIAGRAM (Evidence rule above).
          (b) Explain WHY that evidence maps to the assigned score tier.
          (c) MANDATORY PENALTY: If a diagram is required for a section and contains notation errors (e.g., incorrect UML arrows or missing multiplicities), you MUST deduct at least 4 points from that section.
          (d) Match the numeric score to the tier described in your prose.

        OVERALL SCORE RULE (mandatory):
        After all 5 criteria are scored, compute the Overall Score by SUMMING all 5 criterion scores.
        Overall Score = Criterion 1 + Criterion 2 + Criterion 3 + Criterion 4 + Criterion 5
        Example: 8 + 12 + 12 + 12 + 4 = 48, so Overall Score is 48/100.
        Do NOT average, estimate, or independently derive the Overall Score.
        Do NOT write the Overall Score until all 5 criterion scores are finalized.
        A mismatch between the sum and the stated Overall Score is an evaluation error.
        """;

    public static final String DEFAULT_STEP_5_REVISION_FIRST = """
        STEP 5 - REVISION ANALYSIS (conditional — execute only if a previous evaluation is present):
        You have access ONLY to your PREVIOUS EVALUATION report. You do NOT have the old document text.
        Detect changes by checking whether the current document resolves the specific issues listed
        under 'Weaknesses', 'Missing Sections', and 'Recommendations' in the previous evaluation.

        Rules:
          - IMPROVED  → The current document substantively resolves one or more prior weaknesses,
                          or adds significant new engineering depth not present before.
          - WORSENED  → Previously adequate content was removed or logical quality degraded.
          - SAME       → Every weakness and missing section from the prior evaluation is still
                          present with no substantive new content. Do NOT claim "unchanged" —
                          you cannot verify this without the old document. Only assess resolved
                          vs. unresolved issues.

        Do NOT invent changes you cannot verify from the current document text.

        PREVIOUS EVALUATION:
        \"\"\"
        %s
        \"\"\"
        """;

    public static final String DEFAULT_STEP_5_REVISION_FOLLOWUP = """
        Revision Analysis:
        **Status**: [IMPROVED / WORSENED / SAME]

        **Changes Detected**:
        * If Status is IMPROVED or WORSENED: list specific, substantive technical
          updates you verified against the prior weaknesses.
        * If Status is SAME: output exactly "None — all prior weaknesses and missing
          sections remain unresolved." Do not list any changes.

        **Remaining Issues**:
        * (Prior weaknesses still unresolved in the current document)

        **Next Steps**:
        * (Highly specific, granular suggestions for the next iteration,
            tied to the unresolved issues above)
        """;

    public static final String DEFAULT_STEP_6_OUTPUT_FORMAT = """
        Is the Document Empty?: <Yes / No>
        Document Title: <title or "Not specified">
        Name of Members: <names or "Not specified">

        Document Type: <Detected Type>
        Classifier Override: <Yes / No — Reason>
        Overall Score: X/100

        %s

        Diagram Analysis:
        * (Populated from STEP 2 above — one entry per diagram found. If none, output exactly: "None detected.")

        Missing Sections:
        * (IEEE-required sections that are entirely absent from the document)

        Weaknesses:
        * (Sections that exist but lack engineering depth, precision, or logical consistency. YOU MUST INCLUDE SPECIFIC DIAGRAM/NOTATION ERRORS HERE IF ANY WERE FOUND IN STEP 2)

        Recommendations:
        * [<Criterion Name>, <Score>/20] → (specific, granular, actionable fix)
        * [<Criterion Name>, <Score>/20] → (specific, granular, actionable fix)
        * [<Criterion Name>, <Score>/20] → (specific, granular, actionable fix)

        Strengths:
        * (2–3 bullet points on what is technically sound and well-specified)

        Summary:
        * (2–3 bullet points — overall technical state of the document)

        Conclusion:
        * Provide a definitive, overarching verdict on the document's readiness for the next phase of development.
        * Synthesize the primary strengths and critical flaws into a clear statement regarding its adherence to IEEE standards.
        * State explicitly whether the document is "Accepted", "Needs Minor Revisions", or "Requires Major Rework".

        Rubric Evaluation:
        * <Criterion 1>: X/20 — (Evidence: "...") — <justification tied to score tier>
        * <Criterion 2>: X/20 — (Evidence: "...") — <justification tied to score tier>
        * <Criterion 3>: X/20 — (Evidence: "...") — <justification tied to score tier>
        * <Criterion 4>: X/20 — (Evidence: "...") — <justification tied to score tier>
        * <Criterion 5>: X/20 — (Evidence: "...") — <justification tied to score tier>
        """;

    // ═════════════════════════════════════════════════════════════════════════
    // Public accessor — used by PromptStepProfileController /defaults endpoint
    // ═════════════════════════════════════════════════════════════════════════

    public String getHardcodedDefault(PromptStepKey key) {
        return switch (key) {
            case CORE_DIRECTIVE           -> DEFAULT_CORE_DIRECTIVE;
            case STEP_0_GUARD             -> DEFAULT_STEP_0_GUARD;
            case STEP_1_DOC_TYPE          -> DEFAULT_STEP_1_DOC_TYPE;
            case STEP_4_SCORING           -> DEFAULT_STEP_4_SCORING;
            case STEP_5_REVISION_FIRST    -> DEFAULT_STEP_5_REVISION_FIRST;
            case STEP_5_REVISION_FOLLOWUP -> DEFAULT_STEP_5_REVISION_FOLLOWUP;
            case STEP_6_OUTPUT_FORMAT     -> DEFAULT_STEP_6_OUTPUT_FORMAT;
        };
    }

    // ═════════════════════════════════════════════════════════════════════════
    // Prompt builder — now accepts fully-resolved step text from the factory
    // ═════════════════════════════════════════════════════════════════════════

    /**
     * Builds the full evaluation prompt from pre-resolved step strings.
     *
     * Steps 2 (diagramSection) and 3 (rubricSection) are still resolved by
     * DocumentReviewPromptFactory from the existing per-doc-type profile system.
     *
     * All other steps arrive here already resolved via the three-tier chain
     * (per-doc-type → global → hardcoded default).
     *
     * The two %s placeholders in step1DocType and step5RevisionFirst are
     * formatted inside this method so callers don't need to know about them.
     */
    public String buildPrompt(
            DocumentType detectedType,
            String rubricSection,
            String diagramSection,
            String classContext,
            String documentContent,
            String previousEvaluation,
            String customInstructions,
            // Resolved step strings:
            String coreDirective,
            String step0Guard,
            String step1DocType,       // may contain %s placeholder for detectedType
            String step4Scoring,
            String step5RevisionFirst, // may contain %s placeholder for previousEvaluation
            String step5RevisionFollowup,
            String step6OutputFormat   // may contain %s placeholder for revisionFormat
    ) {
        // ── Format placeholders ───────────────────────────────────────────────
        // step1DocType expects one %s → detected type name
        String formattedStep1 = step1DocType.contains("%s")
                ? step1DocType.formatted(detectedType.name())
                : step1DocType;

        // ── Revision step construction ────────────────────────────────────────
        String revisionStep;
        String revisionFormat;

        if (previousEvaluation != null && !previousEvaluation.isBlank()) {
            // step5RevisionFirst expects one %s → the previous evaluation text
            revisionStep = step5RevisionFirst.contains("%s")
                    ? step5RevisionFirst.formatted(previousEvaluation)
                    : step5RevisionFirst;
            revisionFormat = step5RevisionFollowup;
        } else {
            revisionStep   = "";
            revisionFormat = "Revision Analysis:\n* First evaluation. No previous version to compare.";
        }

        // ── step6OutputFormat expects one %s → revisionFormat block ──────────
        String formattedStep6 = step6OutputFormat.contains("%s")
                ? step6OutputFormat.formatted(revisionFormat)
                : step6OutputFormat;

        // ── Custom instructions block ─────────────────────────────────────────
        String customBlock = "";
        if (customInstructions != null && !customInstructions.isBlank()) {
            customBlock = """
                ═══════════════════════════════════════════════════════════
                PROFESSOR'S CUSTOM DIRECTIVES (HIGHEST PRIORITY)
                ═══════════════════════════════════════════════════════════
                %s
                """.formatted(customInstructions.trim());
        }

        // ── Class context block ───────────────────────────────────────────────
        String classContextBlock = "";
        if (classContext != null && !classContext.isBlank()) {
            classContextBlock = """
                ═══════════════════════════════════════════════════════════
                CLASS CONTEXT (background — use to inform your evaluation)
                ═══════════════════════════════════════════════════════════
                %s
                """.formatted(classContext.trim());
        }

        return """
            You are a strict, expert evaluator of software engineering documents following IEEE standards.

            %s

            %s

            %s

            %s

            %s

            ═══════════════════════════════════════════════════════════
            STEP 2 — VISUAL ANALYSIS (diagrams, figures, tables)
            ═══════════════════════════════════════════════════════════
            %s

            ═══════════════════════════════════════════════════════════
            STEP 3 — RUBRIC
            ═══════════════════════════════════════════════════════════
            %s

            %s

            ═══════════════════════════════════════════════════════════
            %s
            ═══════════════════════════════════════════════════════════
            %s

            ═══════════════════════════════════════════════════════════
            STEP 6 — OUTPUT FORMAT (follow exactly, no deviations)
            ═══════════════════════════════════════════════════════════
            %s

            ═══════════════════════════════════════════════════════════
            DOCUMENT TO EVALUATE:
            ═══════════════════════════════════════════════════════════
            %s
            """.formatted(
                customBlock,
                classContextBlock,
                coreDirective,
                step0Guard,
                formattedStep1,
                diagramSection,
                rubricSection,
                step4Scoring,
                revisionStep.isBlank() ? "" : "STEP 5 — REVISION ANALYSIS",
                revisionStep,
                formattedStep6,
                documentContent
            );
    }
}