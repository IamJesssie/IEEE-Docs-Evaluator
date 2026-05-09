package com.ieee.evaluator.repository;

import com.ieee.evaluator.model.ViewedReport;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface ViewedReportRepository extends JpaRepository<ViewedReport, Long> {

    @Query("SELECT v.reportId FROM ViewedReport v WHERE v.groupCode = :groupCode")
    List<Long> findReportIdsByGroupCode(@Param("groupCode") String groupCode);

    boolean existsByGroupCodeAndReportId(String groupCode, Long reportId);
}