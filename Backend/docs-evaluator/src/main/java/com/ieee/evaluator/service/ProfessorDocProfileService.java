package com.ieee.evaluator.service;

import com.ieee.evaluator.model.ProfessorDocProfile;
import com.ieee.evaluator.repository.ProfessorDocProfileRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;

@Service
@Slf4j
public class ProfessorDocProfileService {

    private final ProfessorDocProfileRepository repository;

    public ProfessorDocProfileService(ProfessorDocProfileRepository repository) {
        this.repository = repository;
    }

    // ── Reads ─────────────────────────────────────────────────────────────────

    @Transactional(readOnly = true)
    public List<ProfessorDocProfile> findAll() {
        return repository.findAll();
    }

    @Transactional(readOnly = true)
    public ProfessorDocProfile findByDocType(String docType) {
        return repository.findById(normalizeDocType(docType)).orElse(null);
    }

    @Transactional(readOnly = true)
    public String getRubricOverride(String docType) {
        return repository.findById(normalizeDocType(docType))
                .map(ProfessorDocProfile::getRubricSection)
                .filter(s -> s != null && !s.isBlank())
                .orElse(null);
    }

    @Transactional(readOnly = true)
    public String getDiagramOverride(String docType) {
        return repository.findById(normalizeDocType(docType))
                .map(ProfessorDocProfile::getDiagramSection)
                .filter(s -> s != null && !s.isBlank())
                .orElse(null);
    }

    // ── Writes — rubric/diagram (existing) ───────────────────────────────────

    @Transactional
    public ProfessorDocProfile upsert(String docType, String rubricSection, String diagramSection) {
        String key = normalizeDocType(docType);
        ProfessorDocProfile profile = findOrCreate(key);
        profile.setRubricSection(isBlank(rubricSection) ? null : rubricSection.trim());
        profile.setDiagramSection(isBlank(diagramSection) ? null : diagramSection.trim());
        ProfessorDocProfile saved = repository.save(profile);
        log.info("Upserted doc profile (rubric/diagram) for docType={}", key);
        return saved;
    }

    // ── Writes — per-doc-type step overrides (new) ───────────────────────────

    /**
     * Upserts per-doc-type step overrides from a map of { STEP_KEY -> content }.
     * Blank or null values clear the override for that step (fall through to global/hardcoded).
     */
    @Transactional
    public ProfessorDocProfile upsertStepOverrides(String docType, Map<String, String> stepOverrides) {
        String key = normalizeDocType(docType);
        ProfessorDocProfile profile = findOrCreate(key);

        stepOverrides.forEach((stepKey, content) -> {
            String val = isBlank(content) ? null : content.trim();
            try {
                switch (PromptStepKey.valueOf(stepKey.toUpperCase())) {
                    case CORE_DIRECTIVE           -> profile.setStepCoreDirective(val);
                    case STEP_0_GUARD             -> profile.setStep0Guard(val);
                    case STEP_1_DOC_TYPE          -> profile.setStep1DocType(val);
                    case STEP_4_SCORING           -> profile.setStep4Scoring(val);
                    case STEP_5_REVISION_FIRST    -> profile.setStep5RevisionFirst(val);
                    case STEP_5_REVISION_FOLLOWUP -> profile.setStep5RevisionFollowup(val);
                    case STEP_6_OUTPUT_FORMAT     -> profile.setStep6OutputFormat(val);
                }
            } catch (IllegalArgumentException ignored) {
                log.warn("Unknown step key '{}' ignored in upsertStepOverrides", stepKey);
            }
        });

        ProfessorDocProfile saved = repository.save(profile);
        log.info("Upserted step overrides for docType={} keys={}", key, stepOverrides.keySet());
        return saved;
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private ProfessorDocProfile findOrCreate(String key) {
        return repository.findById(key).orElseGet(() -> {
            ProfessorDocProfile p = new ProfessorDocProfile();
            p.setDocType(key);
            return p;
        });
    }

    private String normalizeDocType(String docType) {
        if (docType == null || docType.isBlank()) {
            throw new IllegalArgumentException("docType must not be blank");
        }
        return docType.trim().toUpperCase();
    }

    private boolean isBlank(String s) {
        return s == null || s.isBlank();
    }
}