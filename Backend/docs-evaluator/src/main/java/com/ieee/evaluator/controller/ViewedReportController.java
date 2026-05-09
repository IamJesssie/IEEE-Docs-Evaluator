package com.ieee.evaluator.controller;

import com.ieee.evaluator.model.ViewedReport;
import com.ieee.evaluator.repository.ViewedReportRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/student")
@Slf4j
public class ViewedReportController {

    private final ViewedReportRepository repository;

    public ViewedReportController(ViewedReportRepository repository) {
        this.repository = repository;
    }

    // ── GET /api/student/viewed-reports?groupCode=xxx ─────────────────────────
    // Returns all viewed report IDs for a group code

    @GetMapping("/viewed-reports")
    public ResponseEntity<?> getViewedReportIds(@RequestParam String groupCode) {
        try {
            List<Long> ids = repository.findReportIdsByGroupCode(groupCode);
            return ResponseEntity.ok(ids);
        } catch (Exception e) {
            log.error("Failed to fetch viewed reports for groupCode={}: {}", groupCode, e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("error", "Failed to fetch viewed reports."));
        }
    }

    // ── POST /api/student/viewed-reports ──────────────────────────────────────
    // Marks a report as viewed for a group code
    // Request body: { "groupCode": "...", "reportId": 123 }

    @PostMapping("/viewed-reports")
    public ResponseEntity<?> markAsViewed(@RequestBody Map<String, Object> payload) {
        try {
            String groupCode = (String) payload.get("groupCode");
            Long reportId    = toLong(payload.get("reportId"));

            if (groupCode == null || groupCode.isBlank() || reportId == null) {
                return ResponseEntity.badRequest()
                        .body(Map.of("error", "groupCode and reportId are required."));
            }

            // Upsert — ignore if already exists
            if (!repository.existsByGroupCodeAndReportId(groupCode, reportId)) {
                ViewedReport viewed = new ViewedReport();
                viewed.setGroupCode(groupCode.trim());
                viewed.setReportId(reportId);
                repository.save(viewed);
            }

            return ResponseEntity.ok(Map.of("message", "Report marked as viewed."));
        } catch (Exception e) {
            log.error("Failed to mark report as viewed: {}", e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("error", "Failed to mark report as viewed."));
        }
    }

    // ── Helper ────────────────────────────────────────────────────────────────

    private Long toLong(Object val) {
        if (val == null) return null;
        if (val instanceof Long l) return l;
        if (val instanceof Integer i) return i.longValue();
        if (val instanceof Number n) return n.longValue();
        try { return Long.parseLong(val.toString()); }
        catch (NumberFormatException e) { return null; }
    }
}