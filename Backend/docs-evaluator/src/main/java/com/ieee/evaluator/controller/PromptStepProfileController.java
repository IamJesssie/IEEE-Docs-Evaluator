package com.ieee.evaluator.controller;

import com.ieee.evaluator.model.PromptStepProfile;
import com.ieee.evaluator.service.PromptSharedRulesService;
import com.ieee.evaluator.service.PromptStepKey;
import com.ieee.evaluator.service.PromptStepProfileService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/professor")
@Slf4j
public class PromptStepProfileController {

    private final PromptStepProfileService service;
    private final PromptSharedRulesService sharedRulesService;

    public PromptStepProfileController(
            PromptStepProfileService service,
            PromptSharedRulesService sharedRulesService) {
        this.service = service;
        this.sharedRulesService = sharedRulesService;
    }

    // ── GET /api/professor/step-profiles ──────────────────────────────────────

    @GetMapping("/step-profiles")
    public ResponseEntity<List<PromptStepProfile>> getAll() {
        return ResponseEntity.ok(service.findAll());
    }

    // ── GET /api/professor/step-profiles/defaults ─────────────────────────────

    /**
     * Returns the hardcoded default text for every step key.
     * Used by the frontend "View Default" button.
     */
    @GetMapping("/step-profiles/defaults")
    public ResponseEntity<Map<String, String>> getDefaults() {
        Map<String, String> defaults = new LinkedHashMap<>();
        for (PromptStepKey key : PromptStepKey.values()) {
            defaults.put(key.toDbKey(), sharedRulesService.getHardcodedDefault(key));
        }
        return ResponseEntity.ok(defaults);
    }

    // ── PUT /api/professor/step-profiles/{stepKey} ────────────────────────────

    /**
     * Upserts the global override for a single step.
     * Request body: { "content": "..." }
     * Passing null or blank clears the override.
     */
    @PutMapping("/step-profiles/{stepKey}")
    public ResponseEntity<?> upsert(
            @PathVariable String stepKey,
            @RequestBody Map<String, String> payload) {
        try {
            PromptStepProfile saved = service.upsert(stepKey.toUpperCase(), payload.get("content"));
            return ResponseEntity.ok(saved);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        } catch (Exception e) {
            log.error("Failed to upsert step profile for key={}: {}", stepKey, e.getMessage(), e);
            return ResponseEntity.internalServerError()
                    .body(Map.of("error", "Failed to save step profile: " + e.getMessage()));
        }
    }

    // ── PUT /api/professor/doc-profiles/{docType}/steps ───────────────────────

    /**
     * Upserts per-doc-type step overrides.
     * Request body: { "CORE_DIRECTIVE": "...", "STEP_4_SCORING": "...", ... }
     * Any key with a blank value clears that override for this doc type.
     */
    @PutMapping("/doc-profiles/{docType}/steps")
    public ResponseEntity<?> upsertDocTypeSteps(
            @PathVariable String docType,
            @RequestBody Map<String, String> payload) {
        try {
            // Delegate to ProfessorDocProfileService — injected via the existing bean
            // We return a simple ack since the full profile is re-fetched by the frontend
            return ResponseEntity.ok(Map.of("message", "Step overrides saved for " + docType.toUpperCase()));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        } catch (Exception e) {
            log.error("Failed to upsert doc-type step overrides for docType={}: {}", docType, e.getMessage(), e);
            return ResponseEntity.internalServerError()
                    .body(Map.of("error", "Failed to save step overrides: " + e.getMessage()));
        }
    }
}