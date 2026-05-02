package com.ieee.evaluator.service;

import com.ieee.evaluator.model.AnalysisResultDTO;
import com.ieee.evaluator.model.EvaluationHistory;
import com.ieee.evaluator.repository.EvaluationHistoryRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ThreadLocalRandom;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
@Slf4j
public class AiService {

    private static final String KEY_ACTIVE_PROVIDER                = "ACTIVE_AI_PROVIDER";
    private static final String DEFAULT_PROVIDER                   = "openai";
    private static final int    MAX_PAGES_TO_RENDER                = 999;
    private static final int    DEFAULT_ANALYZE_MAX_ATTEMPTS       = 8;
    private static final long   DEFAULT_RETRY_INITIAL_DELAY_MIN_MS = 2_000;
    private static final long   DEFAULT_RETRY_INITIAL_DELAY_MAX_MS = 5_000;
    private static final long   DEFAULT_RETRY_BACKOFF_MAX_DELAY_MS = 30_000;
    private static final long   DEFAULT_RETRY_TIME_LIMIT_MS        = 180_000;

    private final GoogleDocsService           docsService;
    private final EvaluationHistoryRepository historyRepository;
    private final SystemSettingService        settingsService;
    private final ProgressEmitter             progressEmitter;
    private final Map<String, AiProvider>     providers;
    private final Set<String>                 inFlightAnalyses = ConcurrentHashMap.newKeySet();

    public AiService(
            GoogleDocsService docsService,
            EvaluationHistoryRepository historyRepository,
            SystemSettingService settingsService,
            ProgressEmitter progressEmitter,
            List<AiProvider> providerList) {

        this.docsService       = docsService;
        this.historyRepository = historyRepository;
        this.settingsService   = settingsService;
        this.progressEmitter   = progressEmitter;
        this.providers         = providerList.stream()
                .collect(Collectors.toMap(
                    p -> p.getProviderName().toLowerCase(),
                    Function.identity()
                ));

        log.info("AiService initialised with providers: {}", this.providers.keySet());
    }

    @Transactional(readOnly = true)
    public EvaluationHistory getFullHistoryItem(Long id) {
        EvaluationHistory history = historyRepository.findById(id)
            .orElseThrow(() -> new RuntimeException("Evaluation record not found"));
        if (history.getExtractedImages() != null) {
            history.getExtractedImages().size();
        }
        return history;
    }

    // ── Public API ────────────────────────────────────────────────────────────

    public AnalysisResultDTO analyzeDocument(
            String fileId, String fileName, String aiModel,
            String customInstructions, String sessionId) throws Exception {

        AiProvider provider = resolveProvider(aiModel);
        String runKey = buildRunKey(fileId, provider.getProviderName());

        if (!inFlightAnalyses.add(runKey)) {
            throw new IllegalStateException(
                "An evaluation is already in progress for this file and provider. Please wait for it to finish.");
        }

        // ── Step: RECEIVED ────────────────────────────────────────────────────
        emit(sessionId, "RECEIVED", "Request accepted — starting evaluation", 5);

        try {
            AnalysisResultDTO result = analyzeWithRetry(fileId, fileName, provider, customInstructions, sessionId);

            // ── Step: SAVING ──────────────────────────────────────────────────
            emit(sessionId, "SAVING", "Saving evaluation to database", 92);
            persistHistory(fileId, fileName, provider.getProviderName(), result.getAnalysis(), result.getImages());

            // ── Step: COMPLETE ────────────────────────────────────────────────
            emit(sessionId, "COMPLETE", "Evaluation complete", 100);
            progressEmitter.complete(sessionId);

            return result;
        } catch (Exception e) {
            progressEmitter.error(sessionId, e.getMessage());
            throw e;
        } finally {
            inFlightAnalyses.remove(runKey);
        }
    }

    // ── Retry loop ────────────────────────────────────────────────────────────

    private AnalysisResultDTO analyzeWithRetry(
            String fileId, String fileName, AiProvider provider,
            String customInstructions, String sessionId) throws Exception {

        int  maxAttempts  = readInt("ANALYZE_MAX_ATTEMPTS",       DEFAULT_ANALYZE_MAX_ATTEMPTS);
        long delayMinMs   = readLong("RETRY_INITIAL_DELAY_MIN_MS", DEFAULT_RETRY_INITIAL_DELAY_MIN_MS);
        long delayMaxMs   = readLong("RETRY_INITIAL_DELAY_MAX_MS", DEFAULT_RETRY_INITIAL_DELAY_MAX_MS);
        long backoffMaxMs = readLong("RETRY_BACKOFF_MAX_DELAY_MS", DEFAULT_RETRY_BACKOFF_MAX_DELAY_MS);
        long timeLimitMs  = readLong("RETRY_TIME_LIMIT_MS",        DEFAULT_RETRY_TIME_LIMIT_MS);

        Exception lastError = null;
        long startedAt = System.currentTimeMillis();

        for (int attempt = 1; attempt <= maxAttempts; attempt++) {
            if (attempt > 1) {
                long delayMs = computeRetryDelayWithJitterMs(attempt, delayMinMs, delayMaxMs, backoffMaxMs);
                long elapsed = System.currentTimeMillis() - startedAt;
                if (elapsed + delayMs > timeLimitMs) {
                    throw new IllegalStateException(
                        "EVALUATION ERROR: Retry time limit exceeded. Please try again.", lastError);
                }
                emit(sessionId, "RETRYING",
                    "Attempt " + attempt + " of " + maxAttempts + " — retrying after transient error", 20);
                sleepBeforeRetry(delayMs);
            }

            try {
                return analyzeOnce(fileId, fileName, provider, customInstructions, sessionId);
            } catch (Exception e) {
                lastError = e;
                long elapsed = System.currentTimeMillis() - startedAt;

                log.warn("Document evaluation failed for fileId={} provider={} on attempt {}/{}: {}",
                    fileId, provider.getProviderName(), attempt, maxAttempts, e.getMessage());

                if (elapsed >= timeLimitMs) {
                    throw new IllegalStateException(
                        "EVALUATION ERROR: Retry time limit exceeded. Please try again.", e);
                }
                if (attempt == maxAttempts) throw e;
            }
        }

        throw lastError != null ? lastError
            : new IllegalStateException("EVALUATION ERROR: All retry attempts exhausted.");
    }

    // ── Single attempt ────────────────────────────────────────────────────────

    private AnalysisResultDTO analyzeOnce(
            String fileId, String fileName, AiProvider provider,
            String customInstructions, String sessionId) throws Exception {

        if (provider instanceof DriveAwareAiProvider driveAware) {
            emit(sessionId, "SENDING_TO_AI", "Sending document to AI via Drive-aware provider", 40);
            String result = driveAware.analyzeFromDrive(fileId, fileName);
            return new AnalysisResultDTO(result, List.of());
        }

        // ── Step: EXTRACTING ──────────────────────────────────────────────────
        emit(sessionId, "EXTRACTING", "Downloading and extracting document text from Google Drive", 12);
        GoogleDocsService.DocumentData docData =
            docsService.extractDocumentContent(fileId, MAX_PAGES_TO_RENDER, sessionId, progressEmitter);

        if (docData.text() == null || docData.text().isBlank()) {
            return new AnalysisResultDTO(
                "EVALUATION ERROR: No readable text found in this document. " +
                "Please ensure the document contains text content.",
                List.of()
            );
        }

        // ── Step: DETECTING ───────────────────────────────────────────────────
        emit(sessionId, "DETECTING", "Detecting document type (SRS / SDD / SPMP / STD)", 55);

        // ── Step: BUILDING_PROMPT ─────────────────────────────────────────────
        emit(sessionId, "BUILDING_PROMPT", "Assembling evaluation prompt with rubric and class context", 62);

        String previousFindings = historyRepository
                .findTopByFileIdOrderByEvaluatedAtDesc(fileId)
                .map(prev -> extractFindingsSummary(prev.getEvaluationResult()))
                .orElse(null);

        // ── Step: SENDING_TO_AI ───────────────────────────────────────────────
        emit(sessionId, "SENDING_TO_AI",
            "Sending " + docData.images().size() + " page image(s) + text to AI model", 70);

        // Use fileName-aware path if the provider is OpenAI
        String analysis;
        if (provider instanceof OpenAiProvider openAiProvider) {
            analysis = openAiProvider.analyzeWithFileName(
                fileName,
                docData.text(),
                docData.images(),
                previousFindings,
                customInstructions
            );
        } else {
            analysis = provider.analyze(
                docData.text(), docData.images(), previousFindings, customInstructions);
        }

        // ── Step: PROCESSING ──────────────────────────────────────────────────
        emit(sessionId, "PROCESSING", "AI response received — preparing result", 88);

        return new AnalysisResultDTO(analysis, docData.images());
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private void emit(String sessionId, String step, String message, int percent) {
        if (sessionId == null || sessionId.isBlank()) return;
        progressEmitter.emit(sessionId, step, message, percent);
    }

    private long computeRetryDelayWithJitterMs(int attempt, long delayMinMs, long delayMaxMs, long backoffMaxMs) {
        int retryNumber            = attempt - 1;
        int growthPower            = Math.min(Math.max(0, retryNumber - 1), 20);
        long exponentialUpperBound = delayMaxMs * (1L << growthPower);
        long jitterUpperBound      = Math.min(exponentialUpperBound, backoffMaxMs);
        long jitterLowerBound      = Math.min(delayMinMs, jitterUpperBound);
        return ThreadLocalRandom.current().nextLong(jitterLowerBound, jitterUpperBound + 1);
    }

    private void sleepBeforeRetry(long delayMs) {
        try {
            Thread.sleep(delayMs);
        } catch (InterruptedException ie) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("EVALUATION ERROR: Retry interrupted.", ie);
        }
    }

    private String extractFindingsSummary(String fullEvaluation) {
        if (fullEvaluation == null || fullEvaluation.isBlank()) return null;
        StringBuilder summary = new StringBuilder();
        summary.append("=== PREVIOUS EVALUATION FINDINGS SUMMARY ===\n\n");
        appendSection(summary, fullEvaluation, "Overall Score");
        appendSection(summary, fullEvaluation, "Missing Sections");
        appendSection(summary, fullEvaluation, "Weaknesses");
        appendSection(summary, fullEvaluation, "Recommendations");
        String result = summary.toString().trim();
        return result.isBlank() ? fullEvaluation : result;
    }

    private void appendSection(StringBuilder out, String text, String sectionName) {
        int start = findSectionStart(text, sectionName);
        if (start == -1) return;
        int end = findNextSectionStart(text, start + sectionName.length());
        String content = end == -1 ? text.substring(start).trim() : text.substring(start, end).trim();
        if (!content.isBlank()) out.append(content).append("\n\n");
    }

    private int findSectionStart(String text, String sectionName) {
        String lower  = text.toLowerCase();
        String target = sectionName.toLowerCase();
        int idx = lower.indexOf(target);
        if (idx == -1) return -1;
        while (idx > 0 && text.charAt(idx - 1) != '\n') idx--;
        return idx;
    }

    private int findNextSectionStart(String text, int fromIndex) {
        String[] headers = {
            "Diagram Analysis", "Missing Sections", "Weaknesses",
            "Recommendations", "Strengths", "Summary", "Conclusion",
            "Rubric Evaluation", "Revision Analysis"
        };
        int earliest = -1;
        String lower = text.toLowerCase();
        for (String header : headers) {
            int idx = lower.indexOf(header.toLowerCase(), fromIndex);
            if (idx != -1 && (earliest == -1 || idx < earliest)) earliest = idx;
        }
        return earliest;
    }

    private AiProvider resolveProvider(String aiModel) {
        String key = (aiModel == null || aiModel.isBlank() || "auto".equalsIgnoreCase(aiModel))
                     ? activeProviderFromDb()
                     : aiModel.toLowerCase();
        if ("gpt".equals(key)) key = DEFAULT_PROVIDER;
        AiProvider provider = providers.get(key);
        if (provider == null) provider = providers.get(activeProviderFromDb());
        if (provider == null) {
            throw new IllegalStateException(
                "No AI provider found for key '" + aiModel + "'. " +
                "Available providers: " + providers.keySet());
        }
        log.info("Resolved AI provider: {} (requested: {})", provider.getProviderName(), aiModel);
        return provider;
    }

    private String activeProviderFromDb() {
        try {
            String val = settingsService.getValueOrNull(KEY_ACTIVE_PROVIDER);
            return (val != null && !val.isBlank()) ? val.toLowerCase().trim() : DEFAULT_PROVIDER;
        } catch (Exception e) {
            log.warn("Could not read ACTIVE_AI_PROVIDER from DB, defaulting to '{}': {}", DEFAULT_PROVIDER, e.getMessage());
            return DEFAULT_PROVIDER;
        }
    }

    private String buildRunKey(String fileId, String providerName) {
        return (fileId == null ? "" : fileId.trim()) + "|" +
               (providerName == null ? "" : providerName.trim().toLowerCase());
    }

    private int readInt(String key, int fallback) {
        try {
            String val = settingsService.getValueOrNull(key);
            if (val != null && !val.isBlank()) {
                int parsed = Integer.parseInt(val.trim());
                if (parsed > 0) return parsed;
            }
        } catch (Exception ignored) {}
        return fallback;
    }

    private long readLong(String key, long fallback) {
        try {
            String val = settingsService.getValueOrNull(key);
            if (val != null && !val.isBlank()) {
                long parsed = Long.parseLong(val.trim());
                if (parsed > 0) return parsed;
            }
        } catch (Exception ignored) {}
        return fallback;
    }

    private void persistHistory(String fileId, String fileName, String modelUsed,
                                 String result, List<String> images) {
        try {
            LocalDateTime now = LocalDateTime.now();

            EvaluationHistory history = new EvaluationHistory();
            history.setFileId(fileId);
            history.setFileName(fileName);
            history.setModelUsed(modelUsed);
            history.setEvaluationResult(result);
            history.setEvaluatedAt(now);
            history.setExtractedImages(images);
            history.setIsSent(false);
            history.setTeacherFeedback(null);
            history.setIsDeleted(false);

            int maxVersion = historyRepository.findMaxVersionByFileId(fileId);
            history.setVersion(maxVersion + 1);

            historyRepository.save(history);
            log.info("Persisted evaluation for fileId={} version={}", fileId, history.getVersion());
        } catch (Exception e) {
            log.error("Failed to persist evaluation history for fileId={}: {}", fileId, e.getMessage(), e);
        }
    }
}