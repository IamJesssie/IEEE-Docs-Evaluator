package com.ieee.evaluator.service;

import com.ieee.evaluator.model.ProfessorDocProfile;
import com.ieee.evaluator.model.PromptStepProfile;
import com.ieee.evaluator.repository.PromptStepProfileRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Service
@Slf4j
public class PromptStepProfileService {

    private final PromptStepProfileRepository repository;

    public PromptStepProfileService(PromptStepProfileRepository repository) {
        this.repository = repository;
    }

    // ── Reads ─────────────────────────────────────────────────────────────────

    @Transactional(readOnly = true)
    public List<PromptStepProfile> findAll() {
        return repository.findAll();
    }

    /**
     * Returns the global override content for a step key, or null if none is set.
     */
    @Transactional(readOnly = true)
    public String getGlobalOverride(PromptStepKey key) {
        return repository.findById(key.toDbKey())
                .map(PromptStepProfile::getContent)
                .filter(c -> c != null && !c.isBlank())
                .orElse(null);
    }

    /**
     * Resolves a step using the three-tier hierarchy:
     *   1. Per-doc-type override (from the ProfessorDocProfile)
     *   2. Global override       (from prompt_step_profiles)
     *   3. Hardcoded default     (caller-supplied fallback)
     */
    public String resolve(PromptStepKey key, ProfessorDocProfile docProfile, String hardcodedDefault) {
        // Tier 1: per-doc-type
        String perDocType = extractFromDocProfile(key, docProfile);
        if (perDocType != null) return perDocType;

        // Tier 2: global override
        String global = getGlobalOverride(key);
        if (global != null) return global;

        // Tier 3: hardcoded
        return hardcodedDefault;
    }

    // ── Writes ────────────────────────────────────────────────────────────────

    /**
     * Upserts a global step override.
     * Passing null or blank clears the override (reverts to hardcoded default).
     */
    @Transactional
    public PromptStepProfile upsert(String stepKey, String content) {
        validateKey(stepKey);

        PromptStepProfile profile = repository.findById(stepKey)
                .orElseGet(() -> {
                    PromptStepProfile p = new PromptStepProfile();
                    p.setStepKey(stepKey);
                    return p;
                });

        profile.setContent(isBlank(content) ? null : content.trim());
        PromptStepProfile saved = repository.save(profile);
        log.info("Upserted global step override for key={}", stepKey);
        return saved;
    }

    // ── Per-doc-type extraction helper ────────────────────────────────────────

    private String extractFromDocProfile(PromptStepKey key, ProfessorDocProfile p) {
        if (p == null) return null;
        String val = switch (key) {
            case CORE_DIRECTIVE          -> p.getStepCoreDirective();
            case STEP_0_GUARD            -> p.getStep0Guard();
            case STEP_1_DOC_TYPE         -> p.getStep1DocType();
            case STEP_4_SCORING          -> p.getStep4Scoring();
            case STEP_5_REVISION_FIRST   -> p.getStep5RevisionFirst();
            case STEP_5_REVISION_FOLLOWUP -> p.getStep5RevisionFollowup();
            case STEP_6_OUTPUT_FORMAT    -> p.getStep6OutputFormat();
        };
        return (val != null && !val.isBlank()) ? val.trim() : null;
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private void validateKey(String key) {
        try {
            PromptStepKey.valueOf(key.toUpperCase());
        } catch (IllegalArgumentException e) {
            throw new IllegalArgumentException("Unknown step key: " + key);
        }
    }

    private boolean isBlank(String s) {
        return s == null || s.isBlank();
    }
}