package com.ieee.evaluator.service;

import com.ieee.evaluator.model.EvaluationHistory;
import com.ieee.evaluator.repository.EvaluationHistoryRepository;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
public class AiService 
{
    private final GoogleDocsService docsService;
    private final EvaluationHistoryRepository historyRepository;
    private final Map<String, AiProvider> providers;

    public AiService
    (
        GoogleDocsService docsService,
        EvaluationHistoryRepository historyRepository,
        List<AiProvider> providerList
    )
    {
        this.docsService = docsService;
        this.historyRepository = historyRepository;
        this.providers = providerList.stream()
                .collect(Collectors.toMap(p -> p.getProviderName().toLowerCase(), Function.identity()));
    }

    public String analyzeDocument(String fileId, String fileName, String aiModel) throws Exception 
    {
        AiProvider provider = providers.get(aiModel.toLowerCase());
        String result;

        // Quick fallback just in case the frontend still sends "GPT" instead of "openrouter"
        if (provider == null && "gpt".equalsIgnoreCase(aiModel)) 
        {
            provider = providers.get("openrouter");
        }

        if (provider == null) 
        {
            return "ERROR: Model provider '" + aiModel + "' is not supported.";
        }

        // Uses image-aware AI model (Gemini 3.1 Flash Lite) and fetches PDF bytes instead of extracting text
        if (provider instanceof DriveAwareAiProvider driveAwareAiProvider) 
        {
            result = driveAwareAiProvider.analyzeFromDrive(fileId, fileName);
        } 
        // Uses text only extraction models
        else 
        {
            String extractedText = docsService.exportDocAsText(fileId);

            if (extractedText == null || extractedText.trim().isEmpty()) 
            {
                return "ERROR: No readable text found in this document. Please ensure the document contains text.";
            }

            result = provider.analyze(extractedText);
        }

        EvaluationHistory history = new EvaluationHistory();
        history.setFileId(fileId);
        history.setFileName(fileName);
        history.setModelUsed(aiModel);
        history.setEvaluationResult(result);
        history.setEvaluatedAt(LocalDateTime.now());
        history.setIsSent(false);
        history.setTeacherFeedback(null);
        historyRepository.save(history);

        return result;
    }
}