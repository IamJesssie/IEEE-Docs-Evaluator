package com.ieee.evaluator.service;

/**
 * Canonical keys for every configurable prompt step.
 *
 * Resolution order for each step:
 *   1. Per-doc-type override  (professor_doc_profiles column)
 *   2. Global override        (prompt_step_profiles table)
 *   3. Hardcoded default      (PromptSharedRulesService constants)
 *
 * Steps 2 (diagram) and 3 (rubric) are intentionally absent —
 * they remain managed exclusively by the per-doc-type profile system.
 */
public enum PromptStepKey {
    CORE_DIRECTIVE,
    STEP_0_GUARD,
    STEP_1_DOC_TYPE,
    STEP_4_SCORING,
    STEP_5_REVISION_FIRST,      // text used when a previous evaluation EXISTS
    STEP_5_REVISION_FOLLOWUP,   // the output format block for the revision section
    STEP_6_OUTPUT_FORMAT;

    /** Converts to the snake_case string used as the DB primary key. */
    public String toDbKey() {
        return this.name().toLowerCase();
    }
}