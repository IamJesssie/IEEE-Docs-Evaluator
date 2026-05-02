package com.ieee.evaluator.service;

import org.springframework.stereotype.Service;

import java.util.Locale;

@Service
public class DocumentTypeDetectorService {

    private static final int HEADER_WINDOW = 500;

    // ── Full document type names as they appear on cover pages ────────────────
    private static final String[] SRS_NAMES  = { "software requirements specification", "software requirements specifications" };
    private static final String[] SDD_NAMES  = { "software design description", "software design descriptions" };
    private static final String[] SPMP_NAMES = { "software project management plan", "software project management plans" };
    private static final String[] STD_NAMES  = { "software test documentation", "software test document" };

    // ── Abbreviations as they appear in file names e.g. _SRS_ or [SRS] ─────────
    private static final String[] TAG_SRS  = { "_srs_", "_srs.", "[srs]" };
    private static final String[] TAG_SDD  = { "_sdd_", "_sdd.", "[sdd]" };
    private static final String[] TAG_SPMP = { "_spmp_", "_spmp.", "[spmp]" };
    private static final String[] TAG_STD  = { "_std_", "_std.", "[std]" };

    public DocumentType detect(String fileName, String content) {
        String normalizedFileName = normalize(fileName);
        String header             = extractHeader(content);

        // ── Step 1: Check file name tag AND/OR document header ────────────────

        if (matchesTag(normalizedFileName, TAG_SRS) || matchesHeader(header, SRS_NAMES)) {
            return DocumentType.SRS;
        }
        if (matchesTag(normalizedFileName, TAG_SDD) || matchesHeader(header, SDD_NAMES)) {
            return DocumentType.SDD;
        }
        if (matchesTag(normalizedFileName, TAG_SPMP) || matchesHeader(header, SPMP_NAMES)) {
            return DocumentType.SPMP;
        }
        if (matchesTag(normalizedFileName, TAG_STD) || matchesHeader(header, STD_NAMES)) {
            return DocumentType.STD;
        }

        // ── Step 2: Nothing matched — treat as out of scope ───────────────────

        return DocumentType.OUT_OF_SCOPE;
    }

    // ── Keep the old single-arg signature as a fallback ───────────────────────
    // This prevents breaking any existing callers that do not yet pass a fileName.

    public DocumentType detect(String content) {
        return detect("", content);
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private boolean matchesTag(String normalizedFileName, String[] tags) {
        for (String tag : tags) {
            if (normalizedFileName.contains(tag)) return true;
        }
        return false;
    }

    private boolean matchesHeader(String header, String[] names) {
        for (String name : names) {
            if (header.contains(name)) return true;
        }
        return false;
    }

    private String extractHeader(String content) {
        if (content == null || content.isBlank()) return "";
        String normalized = normalize(content);
        return normalized.length() <= HEADER_WINDOW
                ? normalized
                : normalized.substring(0, HEADER_WINDOW);
    }

    private String normalize(String value) {
        return value == null ? "" : value.toLowerCase(Locale.ROOT);
    }
}