package com.ieee.evaluator.controller;

import com.ieee.evaluator.service.ProgressEmitter;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

@RestController
@RequestMapping("/api/ai")
public class AnalysisProgressController {

    private final ProgressEmitter progressEmitter;

    public AnalysisProgressController(ProgressEmitter progressEmitter) {
        this.progressEmitter = progressEmitter;
    }

    /**
     * GET /api/ai/progress/{sessionId}
     *
     * Opens an SSE stream for the given session.
     * The frontend opens this BEFORE calling POST /api/ai/analyze.
     *
     * Events emitted:
     *   name=progress  data={"step":"...", "message":"...", "percent":N}
     *   name=done      data={}
     *   name=error     data={"error":"..."}
     */
    @GetMapping(value = "/progress/{sessionId}", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter streamProgress(@PathVariable String sessionId) {
        return progressEmitter.register(sessionId);
    }
}