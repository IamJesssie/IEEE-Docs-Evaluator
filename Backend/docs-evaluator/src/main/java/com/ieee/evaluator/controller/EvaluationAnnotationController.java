package com.ieee.evaluator.controller;

import com.ieee.evaluator.model.EvaluationAnnotation;
import com.ieee.evaluator.repository.EvaluationAnnotationRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/ai")
@Slf4j
public class EvaluationAnnotationController {

    private final EvaluationAnnotationRepository repository;

    public EvaluationAnnotationController(EvaluationAnnotationRepository repository) {
        this.repository = repository;
    }

    // ── GET /api/ai/history/{id}/annotations ──────────────────────────────────

    @GetMapping("/history/{id}/annotations")
    public ResponseEntity<?> getAnnotations(@PathVariable Long id) {
        try {
            return ResponseEntity.ok(repository.findByHistoryIdOrderByStartOffsetAsc(id));
        } catch (Exception e) {
            log.error("Failed to fetch annotations for historyId={}: {}", id, e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("error", "Failed to fetch annotations."));
        }
    }

    // ── POST /api/ai/history/{id}/annotations ─────────────────────────────────

    /**
     * Request body:
     * {
     *   "selectedText": "...",
     *   "comment":      "...",
     *   "startOffset":  42,
     *   "endOffset":    98
     * }
     */
    @PostMapping("/history/{id}/annotations")
    public ResponseEntity<?> createAnnotation(
            @PathVariable Long id,
            @RequestBody Map<String, Object> payload) {
        try {
            String selectedText = (String) payload.get("selectedText");
            String comment      = (String) payload.get("comment");

            if (selectedText == null || selectedText.isBlank()) {
                return ResponseEntity.badRequest().body(Map.of("error", "selectedText is required."));
            }
            if (comment == null || comment.isBlank()) {
                return ResponseEntity.badRequest().body(Map.of("error", "comment is required."));
            }

            EvaluationAnnotation annotation = new EvaluationAnnotation();
            annotation.setHistoryId(id);
            annotation.setSelectedText(selectedText.trim());
            annotation.setComment(comment.trim());
            annotation.setStartOffset(toInt(payload.get("startOffset")));
            annotation.setEndOffset(toInt(payload.get("endOffset")));

            EvaluationAnnotation saved = repository.save(annotation);
            return ResponseEntity.status(HttpStatus.CREATED).body(saved);

        } catch (Exception e) {
            log.error("Failed to create annotation for historyId={}: {}", id, e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("error", "Failed to save annotation."));
        }
    }

    // ── DELETE /api/ai/annotations/{annotationId} ─────────────────────────────

    @DeleteMapping("/annotations/{annotationId}")
    public ResponseEntity<?> deleteAnnotation(@PathVariable Long annotationId) {
        try {
            if (!repository.existsById(annotationId)) {
                return ResponseEntity.status(HttpStatus.NOT_FOUND)
                        .body(Map.of("error", "Annotation not found."));
            }
            repository.deleteById(annotationId);
            return ResponseEntity.ok(Map.of("message", "Annotation deleted."));
        } catch (Exception e) {
            log.error("Failed to delete annotationId={}: {}", annotationId, e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("error", "Failed to delete annotation."));
        }
    }

    // ── Helper ────────────────────────────────────────────────────────────────

    private int toInt(Object val) {
        if (val == null) return 0;
        if (val instanceof Integer i) return i;
        if (val instanceof Number n) return n.intValue();
        try { return Integer.parseInt(val.toString()); }
        catch (NumberFormatException e) { return 0; }
    }
}