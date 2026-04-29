package com.ieee.evaluator.repository;

import com.ieee.evaluator.model.PromptStepProfile;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface PromptStepProfileRepository extends JpaRepository<PromptStepProfile, String> {
}