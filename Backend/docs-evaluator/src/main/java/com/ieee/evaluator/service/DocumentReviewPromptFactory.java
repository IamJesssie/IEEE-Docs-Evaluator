package com.ieee.evaluator.service;

import com.ieee.evaluator.model.ProfessorDocProfile;
import org.springframework.stereotype.Service;

@Service
public class DocumentReviewPromptFactory {

    private final DocumentTypeDetectorService  detectorService;
    private final PromptSharedRulesService     sharedRulesService;
    private final PromptStepProfileService     stepProfileService;
    private final ProfessorDocProfileService   profileService;
    private final ClassContextProfileService   classContextService;
    private final SrsPromptService             srsPromptService;
    private final SddPromptService             sddPromptService;
    private final SpmpPromptService            spmpPromptService;
    private final StdPromptService             stdPromptService;

    public DocumentReviewPromptFactory(
        DocumentTypeDetectorService  detectorService,
        PromptSharedRulesService     sharedRulesService,
        PromptStepProfileService     stepProfileService,
        ProfessorDocProfileService   profileService,
        ClassContextProfileService   classContextService,
        SrsPromptService             srsPromptService,
        SddPromptService             sddPromptService,
        SpmpPromptService            spmpPromptService,
        StdPromptService             stdPromptService
    ) {
        this.detectorService     = detectorService;
        this.sharedRulesService  = sharedRulesService;
        this.stepProfileService  = stepProfileService;
        this.profileService      = profileService;
        this.classContextService = classContextService;
        this.srsPromptService    = srsPromptService;
        this.sddPromptService    = sddPromptService;
        this.spmpPromptService   = spmpPromptService;
        this.stdPromptService    = stdPromptService;
    }

    /**
     * Returns null if the document type is OUT_OF_SCOPE.
     * Callers must check for null and return the out-of-scope error message
     * instead of sending to the AI.
     */
    public String buildPrompt(String fileName, String documentContent, String previousEvaluation, String customInstructions) {
        DocumentType type = detectorService.detect(fileName, documentContent);

        if (type == DocumentType.OUT_OF_SCOPE) {
            return null;
        }

        String docTypeKey = type.name();

        // ── Load the per-doc-type profile ─────────────────────────────────────
        ProfessorDocProfile docProfile = profileService.findByDocType(docTypeKey);

        // ── Steps 2 & 3: rubric/diagram ───────────────────────────────────────
        String rubricSection  = resolveRubric(type, docTypeKey);
        String diagramSection = resolveDiagram(type, docTypeKey);

        // ── Class context ─────────────────────────────────────────────────────
        String classContext = classContextService.getContext();

        // ── Steps 0,1,4,5,6 + Core Directive: three-tier resolution ──────────
        String coreDirective         = resolve(PromptStepKey.CORE_DIRECTIVE,           docProfile, PromptSharedRulesService.DEFAULT_CORE_DIRECTIVE);
        String step0Guard            = resolve(PromptStepKey.STEP_0_GUARD,             docProfile, PromptSharedRulesService.DEFAULT_STEP_0_GUARD);
        String step1DocType          = resolve(PromptStepKey.STEP_1_DOC_TYPE,          docProfile, PromptSharedRulesService.DEFAULT_STEP_1_DOC_TYPE);
        String step4Scoring          = resolve(PromptStepKey.STEP_4_SCORING,           docProfile, PromptSharedRulesService.DEFAULT_STEP_4_SCORING);
        String step5RevisionFirst    = resolve(PromptStepKey.STEP_5_REVISION_FIRST,    docProfile, PromptSharedRulesService.DEFAULT_STEP_5_REVISION_FIRST);
        String step5RevisionFollowup = resolve(PromptStepKey.STEP_5_REVISION_FOLLOWUP, docProfile, PromptSharedRulesService.DEFAULT_STEP_5_REVISION_FOLLOWUP);
        String step6OutputFormat     = resolve(PromptStepKey.STEP_6_OUTPUT_FORMAT,     docProfile, PromptSharedRulesService.DEFAULT_STEP_6_OUTPUT_FORMAT);

        return sharedRulesService.buildPrompt(
                type,
                rubricSection,
                diagramSection,
                classContext,
                documentContent,
                previousEvaluation,
                customInstructions,
                coreDirective,
                step0Guard,
                step1DocType,
                step4Scoring,
                step5RevisionFirst,
                step5RevisionFollowup,
                step6OutputFormat);
    }

    // ── Keep old signature for any existing callers ───────────────────────────

    public String buildPrompt(String documentContent, String previousEvaluation, String customInstructions) {
        return buildPrompt("", documentContent, previousEvaluation, customInstructions);
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private String resolve(PromptStepKey key, ProfessorDocProfile docProfile, String hardcodedDefault) {
        return stepProfileService.resolve(key, docProfile, hardcodedDefault);
    }

    private String resolveRubric(DocumentType type, String docTypeKey) {
        String override = profileService.getRubricOverride(docTypeKey);
        if (override != null) return override;
        return switch (type) {
            case SRS  -> srsPromptService.rubricSection();
            case SDD  -> sddPromptService.rubricSection();
            case SPMP -> spmpPromptService.rubricSection();
            case STD  -> stdPromptService.rubricSection();
            default   -> "";
        };
    }

    private String resolveDiagram(DocumentType type, String docTypeKey) {
        String override = profileService.getDiagramOverride(docTypeKey);
        if (override != null) return override;
        return switch (type) {
            case SRS  -> srsPromptService.diagramAnalysisSection();
            case SDD  -> sddPromptService.diagramAnalysisSection();
            case SPMP -> spmpPromptService.diagramAnalysisSection();
            case STD  -> stdPromptService.diagramAnalysisSection();
            default   -> "";
        };
    }
}