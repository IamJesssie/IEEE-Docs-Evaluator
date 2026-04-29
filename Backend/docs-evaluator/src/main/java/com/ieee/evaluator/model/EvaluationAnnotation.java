package com.ieee.evaluator.model;

import jakarta.persistence.*;
import lombok.Data;
import java.time.LocalDateTime;

@Data
@Entity
@Table(name = "evaluation_annotations")
public class EvaluationAnnotation {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "history_id", nullable = false)
    private Long historyId;

    @Column(name = "selected_text", nullable = false, columnDefinition = "TEXT")
    private String selectedText;

    @Column(name = "comment", nullable = false, columnDefinition = "TEXT")
    private String comment;

    // Character offsets into the raw evaluationResult string.
    // Used to re-anchor highlights after a re-render.
    @Column(name = "start_offset")
    private Integer startOffset = 0;

    @Column(name = "end_offset")
    private Integer endOffset = 0;

    @Column(name = "created_at", insertable = false, updatable = false)
    private LocalDateTime createdAt;
}