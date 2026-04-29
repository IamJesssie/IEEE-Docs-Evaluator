package com.ieee.evaluator.model;

import jakarta.persistence.*;
import lombok.Data;
import java.time.LocalDateTime;

@Data
@Entity
@Table(name = "prompt_step_profiles")
public class PromptStepProfile {

    @Id
    @Column(name = "step_key", length = 64)
    private String stepKey;   // matches PromptStepKey.toDbKey()

    @Column(name = "content", columnDefinition = "TEXT")
    private String content;   // null = use hardcoded default

    @Column(name = "updated_at", insertable = false, updatable = false)
    private LocalDateTime updatedAt;
}