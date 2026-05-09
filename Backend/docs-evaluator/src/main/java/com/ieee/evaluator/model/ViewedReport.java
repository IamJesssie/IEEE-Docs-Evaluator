package com.ieee.evaluator.model;

import jakarta.persistence.*;
import lombok.Data;
import java.time.LocalDateTime;

@Data
@Entity
@Table(
    name = "viewed_reports",
    uniqueConstraints = @UniqueConstraint(columnNames = {"group_code", "report_id"})
)
public class ViewedReport {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "group_code", nullable = false)
    private String groupCode;

    @Column(name = "report_id", nullable = false)
    private Long reportId;

    @Column(name = "viewed_at", insertable = false, updatable = false)
    private LocalDateTime viewedAt;
}