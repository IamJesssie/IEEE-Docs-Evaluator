package com.ieee.evaluator.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.http.*;
import org.springframework.stereotype.Service;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestTemplate;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * OpenAI provider.
 *
 * All configuration (API key, model) is read from the system_settings table
 * at request time via SystemSettingService — no restart needed after changes.
 */
@Service
@Slf4j
public class OpenAiProvider implements AiProvider {

    // ── Setting keys ──────────────────────────────────────────────────────────
    private static final String KEY_API_KEY = "OPENAI_API_KEY";
    private static final String KEY_MODEL   = "OPENAI_MODEL";

    // ── Endpoint ──────────────────────────────────────────────────────────────
    private static final String API_URL       = "https://api.openai.com/v1/chat/completions";
    private static final String DEFAULT_MODEL = "gpt-4o-mini";

    // ── Out of scope error message ────────────────────────────────────────────
    private static final String OUT_OF_SCOPE_ERROR =
        "EVALUATION ERROR: This document does not appear to be an SRS, SDD, SPMP, or STD. " +
        "Out-of-scope documents cannot be evaluated.";

    private final SystemSettingService        settingsService;
    private final RestTemplate                restTemplate;
    private final DocumentReviewPromptFactory promptFactory;
    private final ObjectMapper                objectMapper = new ObjectMapper();

    public OpenAiProvider(
        SystemSettingService settingsService,
        DocumentReviewPromptFactory promptFactory,
        @Qualifier("aiRestTemplate") RestTemplate restTemplate
    ) {
        this.settingsService = settingsService;
        this.promptFactory   = promptFactory;
        this.restTemplate    = restTemplate;
    }

    // ── AiProvider ────────────────────────────────────────────────────────────

    @Override
    public String getProviderName() {
        return "openai";
    }

    @Override
    public String analyze(String text) {
        return analyze(text, List.of(), null, null);
    }

    @Override
    public String analyze(String text, List<String> base64Images) {
        return analyze(text, base64Images, null, null);
    }

    @Override
    public String analyze(String text, List<String> base64Images, String previousEvaluation) {
        return analyze(text, base64Images, previousEvaluation, null);
    }

    @Override
    public String analyze(String text, List<String> base64Images, String previousEvaluation, String customInstructions) {
        return analyzeWithFileName("", text, base64Images, previousEvaluation, customInstructions);
    }

    // ── fileName-aware path — called directly from AiService ─────────────────

    public String analyzeWithFileName(
            String fileName,
            String text,
            List<String> base64Images,
            String previousEvaluation,
            String customInstructions) {

        String apiKey = settingsService.getValueOrNull(KEY_API_KEY);
        String model  = settingsService.getValueOrNull(KEY_MODEL);

        if (isBlank(apiKey)) {
            return "EVALUATION ERROR: OpenAI API key is not configured. " +
                   "Please add OPENAI_API_KEY in System Settings.";
        }
        if (isBlank(model)) {
            model = DEFAULT_MODEL;
        }

        try {
            String prompt = promptFactory.buildPrompt(fileName, text, previousEvaluation, customInstructions);

            if (prompt == null) {
                return OUT_OF_SCOPE_ERROR;
            }

            return callOpenAi(apiKey.trim(), model.trim(), prompt, base64Images);
        } catch (HttpClientErrorException e) {
            return handleHttpError(e, "OpenAI");
        } catch (Exception e) {
            log.error("OpenAI analysis failed: {}", e.getMessage(), e);
            return "EVALUATION ERROR: OpenAI request failed — " + e.getMessage();
        }
    }

    // ── Internal helpers ──────────────────────────────────────────────────────

    private String callOpenAi(String apiKey, String model, String prompt, List<String> base64Images)
            throws com.fasterxml.jackson.core.JsonProcessingException {

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.setBearerAuth(apiKey);

        List<Map<String, Object>> contentParts = new ArrayList<>();
        contentParts.add(Map.of("type", "text", "text", prompt));

        if (base64Images != null) {
            for (int i = 0; i < base64Images.size(); i++) {
                String image = base64Images.get(i);
                if (isBlank(image)) continue;

                int pageNumber = i + 1;
                contentParts.add(Map.of(
                    "type", "text",
                    "text", "[IMG-" + pageNumber + "] This is page " + pageNumber +
                            " of the actual document. Use [IMG-" + pageNumber +
                            "] to reference this page in your analysis."
                ));

                Map<String, Object> imageUrl = new HashMap<>();
                imageUrl.put("url", "data:image/jpeg;base64," + image);
                contentParts.add(Map.of("type", "image_url", "image_url", imageUrl));
            }
        }

        Map<String, Object> body = new HashMap<>();
        body.put("model", model);
        body.put("messages", List.of(Map.of("role", "user", "content", contentParts)));

        HttpEntity<Map<String, Object>> request = new HttpEntity<>(body, headers);
        ResponseEntity<String> response = restTemplate.postForEntity(API_URL, request, String.class);

        JsonNode root = objectMapper.readTree(response.getBody());
        return root.path("choices")
                   .get(0)
                   .path("message")
                   .path("content")
                   .asText();
    }

    private String handleHttpError(HttpClientErrorException e, String provider) {
        int status = e.getStatusCode().value();
        String rawBody = e.getResponseBodyAsString();

        // ── Always log the full raw response body so the real reason is visible ──
        log.warn("{} HTTP error {} — raw response body: {}", provider, status, rawBody);

        // ── Attempt to parse the OpenAI error object ──────────────────────────
        String openAiMessage = extractOpenAiErrorMessage(rawBody);
        String openAiCode    = extractOpenAiErrorCode(rawBody);

        String reason = switch (status) {
            case 401 -> "Invalid or expired API key. Please update your " + provider + " API key in System Settings.";
            case 429 -> "Rate limit exceeded. Please wait a moment and try again, or upgrade your " + provider + " plan.";
            case 400 -> buildBadRequestReason(provider, openAiMessage, openAiCode, rawBody);
            default  -> provider + " returned HTTP " + status + (openAiMessage != null ? ": " + openAiMessage : ": " + rawBody);
        };

        log.warn("{} HTTP error {} — surfaced reason: {}", provider, status, reason);
        return "EVALUATION ERROR: " + reason;
    }

    /**
     * Builds a human-readable reason for HTTP 400, using the parsed OpenAI error
     * message and code where available, falling back to the raw body.
     */
    private String buildBadRequestReason(String provider, String openAiMessage, String openAiCode, String rawBody) {
        if (openAiCode != null) {
            return switch (openAiCode) {
                case "context_length_exceeded", "max_tokens_exceeded" ->
                    "The document is too large for the selected model's context window. " +
                    "Try reducing the number of pages rendered (RENDER_MAX_PAGES in System Settings) " +
                    "or switch to a model with a larger context window. " +
                    "OpenAI detail: " + (openAiMessage != null ? openAiMessage : rawBody);

                case "model_not_found" ->
                    "The configured model was not found on OpenAI. " +
                    "Please verify the model name in System Settings. " +
                    "OpenAI detail: " + (openAiMessage != null ? openAiMessage : rawBody);

                case "invalid_api_key" ->
                    "The OpenAI API key is invalid. Please update it in System Settings.";

                case "billing_hard_limit_reached", "insufficient_quota" ->
                    "Your OpenAI account has reached its billing limit or quota. " +
                    "Please check your OpenAI billing settings.";

                default ->
                    provider + " rejected the request (400). " +
                    "Code: " + openAiCode + ". " +
                    "Detail: " + (openAiMessage != null ? openAiMessage : rawBody);
            };
        }

        // No parseable code — surface whatever OpenAI returned
        if (openAiMessage != null && !openAiMessage.isBlank()) {
            return provider + " rejected the request (400): " + openAiMessage;
        }

        return provider + " rejected the request (400). Raw response: " + rawBody;
    }

    /**
     * Extracts the "error.message" field from a standard OpenAI error response body.
     * Returns null if parsing fails or the field is absent.
     */
    private String extractOpenAiErrorMessage(String rawBody) {
        if (rawBody == null || rawBody.isBlank()) return null;
        try {
            JsonNode root = objectMapper.readTree(rawBody);
            String message = root.path("error").path("message").asText(null);
            return (message == null || message.isBlank()) ? null : message;
        } catch (Exception ignored) {
            return null;
        }
    }

    /**
     * Extracts the "error.code" field from a standard OpenAI error response body.
     * Returns null if parsing fails or the field is absent.
     */
    private String extractOpenAiErrorCode(String rawBody) {
        if (rawBody == null || rawBody.isBlank()) return null;
        try {
            JsonNode root = objectMapper.readTree(rawBody);
            String code = root.path("error").path("code").asText(null);
            return (code == null || code.isBlank()) ? null : code;
        } catch (Exception ignored) {
            return null;
        }
    }

    private static boolean isBlank(String s) {
        return s == null || s.isBlank();
    }
}