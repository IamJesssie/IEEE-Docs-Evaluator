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

    public String buildPrompt(String documentContent, String previousEvaluation, String customInstructions) {
        DocumentType      type       = detectorService.detect(documentContent);
        String            docTypeKey = type.name();

        // ── Load the per-doc-type profile (used for both rubric/diagram AND step overrides) ──
        ProfessorDocProfile docProfile = profileService.findByDocType(docTypeKey);

        // ── Steps 2 & 3: rubric/diagram (existing per-doc-type system) ────────
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

    // ── Helpers ───────────────────────────────────────────────────────────────

    private String resolve(PromptStepKey key, ProfessorDocProfile docProfile, String hardcodedDefault) {
        return stepProfileService.resolve(key, docProfile, hardcodedDefault);
    }

    private String resolveRubric(DocumentType type, String docTypeKey) {
        String override = profileService.getRubricOverride(docTypeKey);
        if (override != null) return override;
        return switch (type) {
            case SRS     -> srsPromptService.rubricSection();
            case SDD     -> sddPromptService.rubricSection();
            case SPMP    -> spmpPromptService.rubricSection();
            case STD     -> stdPromptService.rubricSection();
            case UNKNOWN -> """
                If document type is unknown, evaluate against the closest matching IEEE software document structure,
                but clearly identify missing sections and keep scoring strict.
                """;
        };
    }

    private String resolveDiagram(DocumentType type, String docTypeKey) {
        String override = profileService.getDiagramOverride(docTypeKey);
        if (override != null) return override;
        return switch (type) {
            case SRS     -> srsPromptService.diagramAnalysisSection();
            case SDD     -> sddPromptService.diagramAnalysisSection();
            case SPMP    -> spmpPromptService.diagramAnalysisSection();
            case STD     -> stdPromptService.diagramAnalysisSection();
            case UNKNOWN -> """
                For EVERY diagram, figure, or table visible in the provided page images, identify
                the diagram type, analyze the notation used, evaluate correctness against the closest
                matching IEEE document standard, and report findings under "Diagram Analysis".
                Use the format: * [IMG-X] - <Diagram Type>: with sub-bullets for Notation observed,
                Correctness, Issues, and Alignment.
                If no diagrams are detected, output exactly "None detected."
                """;
        };
    }
}