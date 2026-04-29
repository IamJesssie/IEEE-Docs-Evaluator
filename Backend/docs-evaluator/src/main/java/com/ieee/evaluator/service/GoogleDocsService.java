package com.ieee.evaluator.service;

import com.google.api.client.googleapis.json.GoogleJsonResponseException;
import com.google.api.client.http.ByteArrayContent;
import com.google.api.services.drive.Drive;
import com.google.api.services.drive.model.File;
import lombok.extern.slf4j.Slf4j;
import org.apache.tika.metadata.Metadata;
import org.apache.tika.parser.AutoDetectParser;
import org.apache.tika.parser.ParseContext;
import org.apache.tika.sax.BodyContentHandler;
import org.springframework.stereotype.Service;

import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.List;

@Service
@Slf4j
public class GoogleDocsService {

    private static final String GOOGLE_DOC_MIME  = "application/vnd.google-apps.document";
    private static final String PDF_MIME         = "application/pdf";
    private static final String DOCX_MIME        = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    private static final String PLAIN_TEXT_MIME  = "text/plain";

    private final Drive driveService;
    private final PdfImageExtractor pdfImageExtractor;

    public GoogleDocsService(Drive driveService, PdfImageExtractor pdfImageExtractor) {
        this.driveService      = driveService;
        this.pdfImageExtractor = pdfImageExtractor;
    }

    public record DocumentData(String text, List<String> images) {}

    // ── Overload without progress (keeps existing callers working) ────────────

    public DocumentData extractDocumentContent(String fileId, int maxPages) throws Exception {
        return extractDocumentContent(fileId, maxPages, null, null);
    }

    // ── Main extraction with optional progress reporting ──────────────────────

    public DocumentData extractDocumentContent(
            String fileId, int maxPages,
            String sessionId, ProgressEmitter emitter) throws Exception {

        if (fileId == null || fileId.isEmpty()) {
            throw new IllegalArgumentException("File ID cannot be null or empty");
        }

        try {
            File fileInfo = driveService.files().get(fileId).setFields("id,name,mimeType").execute();
            String mimeType = fileInfo.getMimeType();

            String text;
            List<String> images = List.of();

            if (GOOGLE_DOC_MIME.equals(mimeType)) {
                progress(emitter, sessionId, "EXTRACTING",
                    "Exporting Google Doc as plain text", 15);
                try (InputStream is = driveService.files().export(fileId, PLAIN_TEXT_MIME)
                        .executeMediaAsInputStream()) {
                    text = new String(is.readAllBytes(), StandardCharsets.UTF_8);
                }
                progress(emitter, sessionId, "RENDERING",
                    "Exporting Google Doc as PDF for page rendering", 22);
                byte[] pdfBytes = exportGoogleDocAsPdf(fileId);

                progress(emitter, sessionId, "RENDERING",
                    "Rendering PDF pages to images for diagram analysis", 28);
                images = pdfImageExtractor.extractFirstPagesAsBase64Pngs(pdfBytes, maxPages);

                progress(emitter, sessionId, "RENDERING",
                    "Rendered " + images.size() + " page(s) successfully", 48);
            }
            else if (PDF_MIME.equals(mimeType)) {
                progress(emitter, sessionId, "EXTRACTING",
                    "Downloading PDF document", 15);
                byte[] pdfBytes = downloadBlobBytes(fileId);

                progress(emitter, sessionId, "EXTRACTING",
                    "Extracting text content from PDF", 22);
                text = extractTextWithTika(new ByteArrayInputStream(pdfBytes));

                progress(emitter, sessionId, "RENDERING",
                    "Rendering PDF pages to images for diagram analysis", 28);
                images = pdfImageExtractor.extractFirstPagesAsBase64Pngs(pdfBytes, maxPages);

                progress(emitter, sessionId, "RENDERING",
                    "Rendered " + images.size() + " page(s) successfully", 48);
            }
            else if (DOCX_MIME.equals(mimeType)) {
                progress(emitter, sessionId, "EXTRACTING",
                    "Downloading DOCX document", 15);
                byte[] docxBytes = downloadBlobBytes(fileId);

                progress(emitter, sessionId, "EXTRACTING",
                    "Extracting text content from DOCX", 22);
                text = extractTextWithTika(new ByteArrayInputStream(docxBytes));

                progress(emitter, sessionId, "RENDERING",
                    "Converting DOCX to PDF for page rendering", 28);
                byte[] pdfBytes = convertDocxToTemporaryGoogleDocAndExportPdf(fileInfo, docxBytes);

                progress(emitter, sessionId, "RENDERING",
                    "Rendering PDF pages to images for diagram analysis", 35);
                images = pdfImageExtractor.extractFirstPagesAsBase64Pngs(pdfBytes, maxPages);

                progress(emitter, sessionId, "RENDERING",
                    "Rendered " + images.size() + " page(s) successfully", 48);
            }
            else if (PLAIN_TEXT_MIME.equals(mimeType)) {
                progress(emitter, sessionId, "EXTRACTING",
                    "Downloading plain text document", 15);
                byte[] textBytes = downloadBlobBytes(fileId);
                text = new String(textBytes, StandardCharsets.UTF_8);
            }
            else {
                throw new Exception(
                    "Unsupported file format: " + fileInfo.getName() + " (" + mimeType + "). " +
                    "Supported formats are Google Docs, PDF, DOCX, and plain text."
                );
            }

            return new DocumentData(text, images);

        } catch (GoogleJsonResponseException e) {
            throw toFriendlyDriveException(e);
        }
    }

    // ── Vision export (unchanged) ─────────────────────────────────────────────

    public byte[] exportDocAsPdfBytesForVision(String fileId) throws Exception {
        if (fileId == null || fileId.isEmpty()) {
            throw new IllegalArgumentException("File ID cannot be null or empty");
        }
        try {
            File fileInfo = driveService.files().get(fileId).setFields("id,name,mimeType").execute();
            String mimeType = fileInfo.getMimeType();

            if (GOOGLE_DOC_MIME.equals(mimeType)) return exportGoogleDocAsPdf(fileId);
            if (PDF_MIME.equals(mimeType))        return downloadBlobBytes(fileId);
            if (DOCX_MIME.equals(mimeType)) {
                byte[] docxBytes = downloadBlobBytes(fileId);
                return convertDocxToTemporaryGoogleDocAndExportPdf(fileInfo, docxBytes);
            }
            throw new Exception(
                "Unsupported file format for vision: " + fileInfo.getName() + " (" + mimeType + ")."
            );
        } catch (GoogleJsonResponseException e) {
            throw toFriendlyDriveException(e);
        }
    }

    // ── Internal helpers ──────────────────────────────────────────────────────

    private byte[] convertDocxToTemporaryGoogleDocAndExportPdf(
            File sourceFile, byte[] docxBytes) throws Exception {
        String tempGoogleDocId = null;
        try {
            File tempMetadata = new File();
            tempMetadata.setName(sourceFile.getName() + " [tmp-conversion]");
            tempMetadata.setMimeType(GOOGLE_DOC_MIME);

            ByteArrayContent mediaContent = new ByteArrayContent(DOCX_MIME, docxBytes);
            File tempGoogleDoc = driveService.files()
                    .create(tempMetadata, mediaContent)
                    .setFields("id,name,mimeType")
                    .execute();

            tempGoogleDocId = tempGoogleDoc.getId();
            return exportGoogleDocAsPdf(tempGoogleDocId);
        } finally {
            if (tempGoogleDocId != null) {
                try { driveService.files().delete(tempGoogleDocId).execute(); }
                catch (Exception e) { log.warn("Failed to delete temp Google Doc: {}", e.getMessage()); }
            }
        }
    }

    private byte[] exportGoogleDocAsPdf(String fileId) throws Exception {
        try (InputStream is = driveService.files().export(fileId, PDF_MIME).executeMediaAsInputStream()) {
            return is.readAllBytes();
        }
    }

    private byte[] downloadBlobBytes(String fileId) throws Exception {
        try (InputStream is = driveService.files().get(fileId).setAlt("media").executeMediaAsInputStream()) {
            return is.readAllBytes();
        }
    }

    private String extractTextWithTika(InputStream inputStream) throws Exception {
        BodyContentHandler handler = new BodyContentHandler(-1);
        AutoDetectParser   parser  = new AutoDetectParser();
        Metadata           meta    = new Metadata();
        ParseContext       ctx     = new ParseContext();
        parser.parse(inputStream, handler, meta, ctx);
        return handler.toString();
    }

    private Exception toFriendlyDriveException(GoogleJsonResponseException e) {
        if (e.getStatusCode() == 403) {
            return new Exception(
                "PERMISSION DENIED: The service account does not have access to this file. " +
                "Please set the sharing to 'Anyone with the link' and ensure the access level " +
                "is set to 'Editor' (not Viewer or Commenter). " +
                "Viewer access is not sufficient — the service account requires Editor permissions " +
                "to export and read the document contents."
            );
        }
        if (e.getStatusCode() == 404) {
            return new Exception(
                "FILE NOT FOUND: The document could not be located. " +
                "Please verify the file exists and sharing is set to " +
                "'Anyone with the link' with 'Editor' access."
            );
        }
        return e;
    }

    private void progress(ProgressEmitter emitter, String sessionId,
                          String step, String message, int percent) {
        if (emitter == null || sessionId == null || sessionId.isBlank()) return;
        emitter.emit(sessionId, step, message, percent);
    }
}