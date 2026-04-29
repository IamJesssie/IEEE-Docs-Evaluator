package com.ieee.evaluator.repository;

import com.ieee.evaluator.model.EvaluationAnnotation;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface EvaluationAnnotationRepository extends JpaRepository<EvaluationAnnotation, Long> {

    List<EvaluationAnnotation> findByHistoryIdOrderByStartOffsetAsc(Long historyId);

    void deleteByHistoryId(Long historyId);
}