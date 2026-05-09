package com.ieee.evaluator.service;

import com.google.api.services.drive.Drive;
import com.google.api.services.sheets.v4.Sheets;
import com.google.api.services.sheets.v4.model.ValueRange;
import com.ieee.evaluator.model.DriveFile;
import com.ieee.evaluator.model.DeliverableConfig;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
public class SubmissionSyncService {

    private final Sheets sheetsService;
    private final GoogleSheetsService configLoader;
    private final DynamicConfigService configService;
    private final Drive driveService;

    private static final DateTimeFormatter TIMESTAMP_FORMATTER = DateTimeFormatter.ofPattern("M/d/yyyy H:mm:ss");

    public SubmissionSyncService(
            Sheets sheetsService,
            GoogleSheetsService configLoader,
            DynamicConfigService configService,
            Drive driveService) {
        this.sheetsService = sheetsService;
        this.configLoader  = configLoader;
        this.configService = configService;
        this.driveService  = driveService;
    }

    public List<DriveFile> getLatestSubmissions() throws IOException {
        Map<String, DeliverableConfig> configMap;
        try {
            configMap = configLoader.getDeliverableConfigs();
        } catch (Exception e) {
            throw new IOException("Could not load deliverable rules: " + e.getMessage());
        }

        String spreadsheetId   = configService.getValue("GOOGLE_SHEET_ID");
        String responsesRange  = configService.getValue("GOOGLE_RESPONSES_RANGE");

        int colTimestamp = getColumnIndexSafely("COL_INDEX_TIMESTAMP");
        int colName      = getColumnIndexSafely("COL_INDEX_NAME");
        int colSection   = getColumnIndexSafely("COL_INDEX_SECTION");
        int colTeam      = getColumnIndexSafely("COL_INDEX_TEAM");
        int colSrs       = getColumnIndexSafely("COL_INDEX_SRS");
        int colSdd       = getColumnIndexSafely("COL_INDEX_SDD");
        int colSpmp      = getColumnIndexSafely("COL_INDEX_SPMP");
        int colStd       = getColumnIndexSafely("COL_INDEX_STD");

        ValueRange response = sheetsService.spreadsheets().values()
                .get(spreadsheetId, responsesRange)
                .execute();

        List<List<Object>> values = response.getValues();

        Map<String, DriveFile> submissionMap = new LinkedHashMap<>();

        if (values != null) {
            for (List<Object> row : values) {
                if (row.isEmpty()) continue;

                String timestampStr = row.size() > colTimestamp && colTimestamp >= 0 ? row.get(colTimestamp).toString() : "Unknown Date";
                String studentName  = row.size() > colName      && colName >= 0      ? row.get(colName).toString()      : "Unknown Student";
                String teamCode     = row.size() > colTeam      && colTeam >= 0      ? row.get(colTeam).toString()      : "No Team";
                String section      = row.size() > colSection   && colSection >= 0   ? row.get(colSection).toString()   : "No Section";

                extractAndAddFile(row, colSrs,  "SRS",  studentName, teamCode, section, timestampStr, configMap, submissionMap);
                extractAndAddFile(row, colSdd,  "SDD",  studentName, teamCode, section, timestampStr, configMap, submissionMap);
                extractAndAddFile(row, colSpmp, "SPMP", studentName, teamCode, section, timestampStr, configMap, submissionMap);
                extractAndAddFile(row, colStd,  "STD",  studentName, teamCode, section, timestampStr, configMap, submissionMap);
            }
        }

        return new ArrayList<>(submissionMap.values());
    }

    private int getColumnIndexSafely(String key) {
        try {
            String value = configService.getValue(key);
            return (value != null && !value.trim().isEmpty()) ? Integer.parseInt(value.trim()) : -1;
        } catch (Exception e) {
            return -1;
        }
    }

    private void extractAndAddFile(
            List<Object> row, int colIndex, String docType,
            String studentName, String teamCode, String section,
            String timestampStr, Map<String, DeliverableConfig> configMap,
            Map<String, DriveFile> submissionMap) {

        if (colIndex < 0 || colIndex >= row.size()) return;

        String url = row.get(colIndex).toString().trim();
        if (url.isEmpty()) return;

        String fileId = extractIdFromUrl(url);
        if (fileId == null) return;

        boolean isLate = false;
        DeliverableConfig config = configMap.get(docType);

        if (config != null && !timestampStr.equals("Unknown Date")) {
            try {
                LocalDateTime submissionTime = LocalDateTime.parse(timestampStr, TIMESTAMP_FORMATTER);
                isLate = submissionTime.isAfter(config.getDeadline());
            } catch (Exception e) {
                System.err.println("Could not parse date for " + studentName + ": " + e.getMessage());
            }
        }

        // Fetch the real mimeType from Drive instead of hardcoding it
        String mimeType = "application/vnd.google-apps.document";
        try {
            com.google.api.services.drive.model.File fileInfo = driveService
                    .files().get(fileId).setFields("mimeType").execute();
            if (fileInfo.getMimeType() != null) {
                mimeType = fileInfo.getMimeType();
            }
        } catch (Exception e) {
            System.err.println("Could not fetch mimeType for fileId=" + fileId + ": " + e.getMessage());
        }

        DriveFile file = new DriveFile();
        file.setId(fileId);
        file.setWebViewLink(url);

        String statusPrefix = isLate ? "[LATE] " : "";
        file.setName(statusPrefix + "[" + docType + "] " + section + " - " + teamCode + " | " + studentName);
        file.setSubmittedAt(timestampStr);
        file.setMimeType(mimeType);

        submissionMap.put(fileId + "_" + docType, file);
    }

    private String extractIdFromUrl(String url) {
        if (url == null || url.isEmpty()) return null;
        Pattern pattern = Pattern.compile("(?:/d/|folders/|id=)([a-zA-Z0-9_-]{25,})");
        Matcher matcher = pattern.matcher(url);
        return matcher.find() ? matcher.group(1) : null;
    }
}