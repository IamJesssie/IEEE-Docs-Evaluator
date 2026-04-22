package com.ieee.evaluator.model;

import lombok.AllArgsConstructor;
import lombok.Getter;

import java.util.List;

@Getter
@AllArgsConstructor
public class AnalysisResultDTO {
    private final String analysis;
    private final List<String> images;
}