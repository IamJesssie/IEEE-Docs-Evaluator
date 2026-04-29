package com.ieee.evaluator.model;

import jakarta.persistence.*;
import lombok.Data;
import java.time.LocalDateTime;

@Data
@Entity
@Table(name = "professor_doc_profiles")
public class ProfessorDocProfile {

    // ── Primary key — one row per document type ───────────────────────────────
    @Id
    @Column(name = "doc_type", length = 10)
    private String docType; // "SRS", "SDD", "SPMP", "STD"

    // ── Existing overrideable sections ────────────────────────────────────────
    @Column(name = "rubric_section", columnDefinition = "TEXT")
    private String rubricSection;

    @Column(name = "diagram_section", columnDefinition = "TEXT")
    private String diagramSection;

    // ── Per-doc-type step overrides ───────────────────────────────────────────
    // null = fall through to global override, then hardcoded default

    @Column(name = "step_core_directive", columnDefinition = "TEXT")
    private String stepCoreDirective;

    @Column(name = "step_0_guard", columnDefinition = "TEXT")
    private String step0Guard;

    @Column(name = "step_1_doc_type", columnDefinition = "TEXT")
    private String step1DocType;

    @Column(name = "step_4_scoring", columnDefinition = "TEXT")
    private String step4Scoring;

    @Column(name = "step_5_revision_first", columnDefinition = "TEXT")
    private String step5RevisionFirst;

    @Column(name = "step_5_revision_followup", columnDefinition = "TEXT")
    private String step5RevisionFollowup;

    @Column(name = "step_6_output_format", columnDefinition = "TEXT")
    private String step6OutputFormat;

    // ── Audit ─────────────────────────────────────────────────────────────────
    @Column(name = "updated_at", insertable = false, updatable = false)
    private LocalDateTime updatedAt;
}