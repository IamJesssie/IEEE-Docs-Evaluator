package com.ieee.evaluator.controller;

import com.ieee.evaluator.model.ProfessorDocProfile;
import com.ieee.evaluator.service.ProfessorDocProfileService;
import com.ieee.evaluator.service.SrsPromptService;
import com.ieee.evaluator.service.SddPromptService;
import com.ieee.evaluator.service.SpmpPromptService;
import com.ieee.evaluator.service.StdPromptService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/professor")
@Slf4j
public class ProfessorDocProfileController {

    private final ProfessorDocProfileService service;
    private final SrsPromptService  srsPromptService;
    private final SddPromptService  sddPromptService;
    private final SpmpPromptService spmpPromptService;
    private final StdPromptService  stdPromptService;

    public ProfessorDocProfileController(
            ProfessorDocProfileService service,
            SrsPromptService  srsPromptService,
            SddPromptService  sddPromptService,
            SpmpPromptService spmpPromptService,
            StdPromptService  stdPromptService) {
        this.service          = service;
        this.srsPromptService  = srsPromptService;
        this.sddPromptService  = sddPromptService;
        this.spmpPromptService = spmpPromptService;
        this.stdPromptService  = stdPromptService;
    }

    // ── GET /api/professor/doc-profiles ───────────────────────────────────────

    @GetMapping("/doc-profiles")
    public ResponseEntity<List<ProfessorDocProfile>> getAllProfiles() {
        return ResponseEntity.ok(service.findAll());
    }

    // ── GET /api/professor/doc-profiles/defaults ──────────────────────────────

    @GetMapping("/doc-profiles/defaults")
    public ResponseEntity<Map<String, Map<String, String>>> getDefaults() {
        Map<String, Map<String, String>> defaults = new HashMap<>();
        defaults.put("SRS",  Map.of("rubricSection", srsPromptService.rubricSection(),  "diagramSection", srsPromptService.diagramAnalysisSection()));
        defaults.put("SDD",  Map.of("rubricSection", sddPromptService.rubricSection(),  "diagramSection", sddPromptService.diagramAnalysisSection()));
        defaults.put("SPMP", Map.of("rubricSection", spmpPromptService.rubricSection(), "diagramSection", spmpPromptService.diagramAnalysisSection()));
        defaults.put("STD",  Map.of("rubricSection", stdPromptService.rubricSection(),  "diagramSection", stdPromptService.diagramAnalysisSection()));
        return ResponseEntity.ok(defaults);
    }

    // ── PUT /api/professor/doc-profiles/{docType} ─────────────────────────────

    /**
     * Upserts both rubric/diagram overrides AND per-doc-type step overrides.
     *
     * Request body (all fields optional — null/blank clears the override):
     * {
     *   "rubricSection":            "...",
     *   "diagramSection":           "...",
     *   "stepCoreDirective":        "...",
     *   "step0Guard":               "...",
     *   "step1DocType":             "...",
     *   "step4Scoring":             "...",
     *   "step5RevisionFirst":       "...",
     *   "step5RevisionFollowup":    "...",
     *   "step6OutputFormat":        "..."
     * }
     */
    @PutMapping("/doc-profiles/{docType}")
    public ResponseEntity<?> upsertProfile(
            @PathVariable String docType,
            @RequestBody Map<String, String> payload) {
        try {
            // ── Rubric & diagram (existing) ───────────────────────────────────
            String rubricSection  = payload.get("rubricSection");
            String diagramSection = payload.get("diagramSection");
            ProfessorDocProfile saved = service.upsert(docType, rubricSection, diagramSection);

            // ── Step overrides (new) ──────────────────────────────────────────
            Map<String, String> stepPayload = new HashMap<>();
            addIfPresent(stepPayload, payload, "stepCoreDirective",     "CORE_DIRECTIVE");
            addIfPresent(stepPayload, payload, "step0Guard",            "STEP_0_GUARD");
            addIfPresent(stepPayload, payload, "step1DocType",          "STEP_1_DOC_TYPE");
            addIfPresent(stepPayload, payload, "step4Scoring",          "STEP_4_SCORING");
            addIfPresent(stepPayload, payload, "step5RevisionFirst",    "STEP_5_REVISION_FIRST");
            addIfPresent(stepPayload, payload, "step5RevisionFollowup", "STEP_5_REVISION_FOLLOWUP");
            addIfPresent(stepPayload, payload, "step6OutputFormat",     "STEP_6_OUTPUT_FORMAT");

            if (!stepPayload.isEmpty()) {
                saved = service.upsertStepOverrides(docType, stepPayload);
            }

            return ResponseEntity.ok(saved);

        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        } catch (Exception e) {
            log.error("Failed to upsert doc profile for docType={}: {}", docType, e.getMessage(), e);
            return ResponseEntity.internalServerError()
                    .body(Map.of("error", "Failed to save profile: " + e.getMessage()));
        }
    }

    // ── Helper ────────────────────────────────────────────────────────────────

    private void addIfPresent(Map<String, String> target, Map<String, String> source,
                              String sourceKey, String targetKey) {
        if (source.containsKey(sourceKey)) {
            target.put(targetKey, source.get(sourceKey));
        }
    }
}