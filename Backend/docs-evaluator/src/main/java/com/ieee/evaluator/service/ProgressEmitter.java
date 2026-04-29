package com.ieee.evaluator.service;

import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Central registry for per-session SSE emitters.
 *
 * Lifecycle:
 *   1. Frontend calls GET /api/ai/progress/{sessionId} → register() creates the emitter.
 *   2. Frontend calls POST /api/ai/analyze with the same sessionId.
 *   3. AiService calls emit() at each real phase checkpoint.
 *   4. AiService calls complete() or error() when done.
 *   5. Emitter is removed from the map on completion, error, or timeout.
 */
@Component
@Slf4j
public class ProgressEmitter {

    // 10-minute timeout — generous enough for heavy documents
    private static final long TIMEOUT_MS = 600_000L;

    private final ConcurrentHashMap<String, SseEmitter> emitters = new ConcurrentHashMap<>();

    // ── Registration ──────────────────────────────────────────────────────────

    public SseEmitter register(String sessionId) {
        SseEmitter emitter = new SseEmitter(TIMEOUT_MS);

        emitter.onCompletion(() -> emitters.remove(sessionId));
        emitter.onTimeout(()    -> emitters.remove(sessionId));
        emitter.onError(e       -> emitters.remove(sessionId));

        emitters.put(sessionId, emitter);
        log.debug("SSE emitter registered for sessionId={}", sessionId);
        return emitter;
    }

    // ── Emit a named step event ───────────────────────────────────────────────

    /**
     * Sends a progress event to the frontend.
     *
     * @param sessionId  the session to target
     * @param step       machine-readable step key (e.g. "EXTRACTING")
     * @param message    human-readable description shown in the UI
     * @param percent    0–100 progress percentage
     */
    public void emit(String sessionId, String step, String message, int percent) {
        SseEmitter emitter = emitters.get(sessionId);
        if (emitter == null) return;

        try {
            String payload = String.format(
                "{\"step\":\"%s\",\"message\":\"%s\",\"percent\":%d}",
                escape(step), escape(message), percent
            );
            emitter.send(SseEmitter.event()
                .name("progress")
                .data(payload));
        } catch (IOException | IllegalStateException e) {
            log.debug("Could not send SSE event for sessionId={}: {}", sessionId, e.getMessage());
            emitters.remove(sessionId);
        }
    }

    // ── Terminal events ───────────────────────────────────────────────────────

    public void complete(String sessionId) {
        SseEmitter emitter = emitters.remove(sessionId);
        if (emitter == null) return;
        try {
            emitter.send(SseEmitter.event().name("done").data("{}"));
            emitter.complete();
        } catch (Exception e) {
            log.debug("Could not send done event for sessionId={}: {}", sessionId, e.getMessage());
        }
    }

    public void error(String sessionId, String message) {
        SseEmitter emitter = emitters.remove(sessionId);
        if (emitter == null) return;
        try {
            String payload = String.format("{\"error\":\"%s\"}", escape(message));
            emitter.send(SseEmitter.event().name("error").data(payload));
            emitter.complete();
        } catch (Exception e) {
            log.debug("Could not send error event for sessionId={}: {}", sessionId, e.getMessage());
        }
    }

    // ── Helper ────────────────────────────────────────────────────────────────

    private String escape(String s) {
        if (s == null) return "";
        return s.replace("\\", "\\\\")
                .replace("\"", "\\\"")
                .replace("\n", "\\n")
                .replace("\r", "");
    }
}