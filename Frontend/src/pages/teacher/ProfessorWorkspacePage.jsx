/* eslint-disable react/prop-types */
import { useEffect, useState } from 'react';
import AppModal from '../../components/common/AppModal';
import PanelHeader from '../../components/common/PanelHeader';
import { useProfessorConfig } from '../../hooks/useProfessorConfig';
import { useToast } from '../../hooks/useToast';
import ToastMessage from '../../components/common/ToastMessage';
import { fetchTeacherSettings, saveSetting } from '../../services/dashboardService';
import { API_BASE_URL } from '../../api';
import './ProfessorWorkspacePage.css';

const DOC_TYPES = ['SRS', 'SDD', 'SPMP', 'STD'];

const TOKENS_PER_IMAGE_AT_300DPI = 1500;
const COST_PER_1K_TOKENS = 0.01;

// ── Step definitions ──────────────────────────────────────────────────────────
// Each entry describes one configurable step shown in the UI.
const STEP_DEFINITIONS = [
  {
    key: 'CORE_DIRECTIVE',
    label: 'Core Directive',
    description: 'The overarching evaluation philosophy — substance over style, self-consistency rule, and evidence rule.',
  },
  {
    key: 'STEP_0_GUARD',
    label: 'Step 0 — Guard Check',
    description: 'Minimum word count check. Documents below the threshold are rejected before evaluation.',
  },
  {
    key: 'STEP_1_DOC_TYPE',
    label: 'Step 1 — Document Type Verification',
    description: 'Instructions for the AI to verify (or override) the pre-classifier\'s document type detection. Use %s as a placeholder for the detected type.',
  },
  {
    key: 'STEP_4_SCORING',
    label: 'Step 4 — Scoring Scale',
    description: 'The calibrated scoring scale (4/8/12/16/20) and the overall score summation rule.',
  },
  {
    key: 'STEP_5_REVISION_FIRST',
    label: 'Step 5 — Revision Analysis Instructions',
    description: 'Instructions for comparing the current document against a previous evaluation. Use %s as a placeholder for the injected previous evaluation text. Only used when a previous evaluation exists.',
  },
  {
    key: 'STEP_5_REVISION_FOLLOWUP',
    label: 'Step 5 — Revision Output Format',
    description: 'The output format template for the Revision Analysis section (Status, Changes Detected, Remaining Issues, Next Steps).',
  },
  {
    key: 'STEP_6_OUTPUT_FORMAT',
    label: 'Step 6 — Output Format',
    description: 'The full output structure the AI must follow. Use %s as a placeholder for the Revision Analysis block.',
  },
];

export default function ProfessorWorkspacePage() {
  const { toast, showToast } = useToast();
  const { systemDefaults, ...config } = useProfessorConfig(showToast);

  const [activeSection, setActiveSection] = useState('context'); // 'context' | 'docprofiles' | 'steps' | 'templates' | 'render'
  const [showDefaultsModal, setShowDefaultsModal] = useState(false);
  const [activeDocType, setActiveDocType] = useState('SRS');

  // Per-doctype draft state
  const [rubricDrafts, setRubricDrafts]   = useState({ SRS: '', SDD: '', SPMP: '', STD: '' });
  const [diagramDrafts, setDiagramDrafts] = useState({ SRS: '', SDD: '', SPMP: '', STD: '' });

  // Class context draft
  const [contextDraft, setContextDraft] = useState('');

  // Prompt template form
  const [templateForm, setTemplateForm]       = useState({ name: '', content: '' });
  const [editingTemplate, setEditingTemplate] = useState(null);

  // Render settings
  const [renderDpi, setRenderDpi]           = useState('300');
  const [renderQuality, setRenderQuality]   = useState('1.0');
  const [renderMaxPages, setRenderMaxPages] = useState('999');
  const [savingRender, setSavingRender]     = useState(false);

  // ── Prompt Steps state ────────────────────────────────────────────────────
  const [stepDefaults, setStepDefaults]         = useState({});       // hardcoded defaults from /api
  const [globalStepDrafts, setGlobalStepDrafts] = useState({});       // global override drafts
  const [globalStepSaved, setGlobalStepSaved]   = useState({});       // saved global overrides from DB
  const [docTypeStepDrafts, setDocTypeStepDrafts] = useState({});     // { SRS: { CORE_DIRECTIVE: '', ... }, ... }
  const [expandedStep, setExpandedStep]         = useState(null);     // which step card is expanded
  const [showStepDefault, setShowStepDefault]   = useState({});       // { STEP_KEY: bool }
  const [loadingSteps, setLoadingSteps]         = useState(false);
  const [activeStepDocType, setActiveStepDocType] = useState('SRS'); // for per-doc-type step tab

  // ── Load step data ────────────────────────────────────────────────────────

  useEffect(() => {
    loadStepData();
  }, []);

  async function loadStepData() {
    setLoadingSteps(true);
    try {
      const [defaultsRes, savedRes] = await Promise.all([
        fetch(`${API_BASE_URL}/professor/step-profiles/defaults`),
        fetch(`${API_BASE_URL}/professor/step-profiles`),
      ]);
      const defaults = await defaultsRes.json();
      const saved    = await savedRes.json();
      setStepDefaults(defaults);

      // Build a map of stepKey -> saved content
      const savedMap = {};
      (Array.isArray(saved) ? saved : []).forEach((item) => {
        savedMap[item.stepKey?.toUpperCase()] = item.content || '';
      });
      setGlobalStepSaved(savedMap);

      // Init drafts from saved values
      const drafts = {};
      STEP_DEFINITIONS.forEach(({ key }) => {
        drafts[key] = savedMap[key] || '';
      });
      setGlobalStepDrafts(drafts);
    } catch (err) {
      showToast('Failed to load step profiles.', 'error');
    } finally {
      setLoadingSteps(false);
    }
  }

  // ── Load per-doc-type step drafts from doc profiles ───────────────────────

  useEffect(() => {
    if (!config.loading) {
      const perDocType = {};
      DOC_TYPES.forEach((dt) => {
        const profile = config.docProfiles.find((p) => p.docType === dt);
        perDocType[dt] = {
          CORE_DIRECTIVE:          profile?.stepCoreDirective          || '',
          STEP_0_GUARD:            profile?.step0Guard                  || '',
          STEP_1_DOC_TYPE:         profile?.step1DocType                || '',
          STEP_4_SCORING:          profile?.step4Scoring                || '',
          STEP_5_REVISION_FIRST:   profile?.step5RevisionFirst          || '',
          STEP_5_REVISION_FOLLOWUP: profile?.step5RevisionFollowup     || '',
          STEP_6_OUTPUT_FORMAT:    profile?.step6OutputFormat           || '',
        };
      });
      setDocTypeStepDrafts(perDocType);
    }
  }, [config.loading, config.docProfiles]);

  // ── Sync other drafts from loaded config ─────────────────────────────────

  useEffect(() => {
    if (!config.loading) {
      setContextDraft(config.classContext || '');
      const newRubric  = { SRS: '', SDD: '', SPMP: '', STD: '' };
      const newDiagram = { SRS: '', SDD: '', SPMP: '', STD: '' };
      config.docProfiles.forEach((p) => {
        if (newRubric[p.docType]  !== undefined) newRubric[p.docType]  = p.rubricSection  || '';
        if (newDiagram[p.docType] !== undefined) newDiagram[p.docType] = p.diagramSection || '';
      });
      setRubricDrafts(newRubric);
      setDiagramDrafts(newDiagram);
    }
  }, [config.loading, config.docProfiles, config.classContext]);

  useEffect(() => {
    fetchTeacherSettings()
      .then((settings) => {
        const get = (key) => settings.find((s) => s.key === key)?.value || '';
        const dpi  = get('RENDER_DPI');
        const qual = get('RENDER_JPEG_QUALITY');
        const max  = get('RENDER_MAX_PAGES');
        if (dpi)  setRenderDpi(dpi);
        if (qual) setRenderQuality(qual);
        if (max)  setRenderMaxPages(max);
      })
      .catch(() => {});
  }, []);

  const costEstimate = (() => {
    const pages = parseInt(renderMaxPages, 10);
    if (isNaN(pages) || pages <= 0) return null;
    const capped = Math.min(pages, 50);
    const tokens = capped * TOKENS_PER_IMAGE_AT_300DPI;
    const cost   = (tokens / 1000) * COST_PER_1K_TOKENS;
    return { tokens: tokens.toLocaleString(), cost: cost.toFixed(4), pages: capped };
  })();

  // ── Doc profile actions ───────────────────────────────────────────────────

  function handleSaveDocProfile(docType) {
    config.saveDocProfile(docType, rubricDrafts[docType], diagramDrafts[docType]);
  }

  function handleClearDocProfile(docType) {
    setRubricDrafts((prev)  => ({ ...prev,  [docType]: '' }));
    setDiagramDrafts((prev) => ({ ...prev, [docType]: '' }));
    config.saveDocProfile(docType, '', '');
    showToast(`${docType} override cleared. Reverting to system defaults.`, 'success');
  }

  function handleShowDefaultsModal() {
    if (!systemDefaults || !systemDefaults[activeDocType]) {
      showToast('System defaults are still loading, please wait.', 'error');
      return;
    }
    setShowDefaultsModal(true);
  }

  function handleApplyDefaultsFromModal() {
    setRubricDrafts((prev)  => ({ ...prev,  [activeDocType]: systemDefaults[activeDocType].rubricSection }));
    setDiagramDrafts((prev) => ({ ...prev, [activeDocType]: systemDefaults[activeDocType].diagramSection }));
    setShowDefaultsModal(false);
    showToast(`${activeDocType} defaults loaded into editor. Click Save to apply.`, 'success');
  }

  // ── Global step override actions ──────────────────────────────────────────

  async function handleSaveGlobalStep(key) {
    try {
      const res = await fetch(`${API_BASE_URL}/professor/step-profiles/${key}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: globalStepDrafts[key] || '' }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Save failed.');
      setGlobalStepSaved((prev) => ({ ...prev, [key]: globalStepDrafts[key] || '' }));
      showToast(`${key} global override saved.`, 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  async function handleClearGlobalStep(key) {
    try {
      const res = await fetch(`${API_BASE_URL}/professor/step-profiles/${key}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: '' }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Clear failed.');
      setGlobalStepDrafts((prev) => ({ ...prev, [key]: '' }));
      setGlobalStepSaved((prev)  => ({ ...prev, [key]: '' }));
      showToast(`${key} override cleared. Using hardcoded default.`, 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  // ── Per-doc-type step actions ─────────────────────────────────────────────

  async function handleSaveDocTypeSteps(docType) {
    try {
      const res = await fetch(`${API_BASE_URL}/professor/doc-profiles/${docType}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rubricSection:  rubricDrafts[docType]  || null,
          diagramSection: diagramDrafts[docType] || null,
          // Step overrides
          stepCoreDirective:        docTypeStepDrafts[docType]?.CORE_DIRECTIVE           || null,
          step0Guard:               docTypeStepDrafts[docType]?.STEP_0_GUARD             || null,
          step1DocType:             docTypeStepDrafts[docType]?.STEP_1_DOC_TYPE          || null,
          step4Scoring:             docTypeStepDrafts[docType]?.STEP_4_SCORING           || null,
          step5RevisionFirst:       docTypeStepDrafts[docType]?.STEP_5_REVISION_FIRST    || null,
          step5RevisionFollowup:    docTypeStepDrafts[docType]?.STEP_5_REVISION_FOLLOWUP || null,
          step6OutputFormat:        docTypeStepDrafts[docType]?.STEP_6_OUTPUT_FORMAT     || null,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Save failed.');
      showToast(`${docType} step overrides saved.`, 'success');
      await config.loadAll();
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  async function handleClearDocTypeStep(docType, key) {
    setDocTypeStepDrafts((prev) => ({
      ...prev,
      [docType]: { ...prev[docType], [key]: '' },
    }));
    showToast(`${docType} override for ${key} cleared (unsaved). Click Save to apply.`, 'success');
  }

  // ── Template actions ──────────────────────────────────────────────────────

  function handleStartEdit(template) {
    setEditingTemplate({ ...template });
    setTemplateForm({ name: template.name, content: template.content });
  }

  function handleCancelEdit() {
    setEditingTemplate(null);
    setTemplateForm({ name: '', content: '' });
  }

  async function handleSaveTemplate() {
    if (!templateForm.name.trim() || !templateForm.content.trim()) {
      showToast('Name and content are both required.', 'error');
      return;
    }
    if (editingTemplate) {
      await config.updateTemplate(editingTemplate.id, templateForm.name, templateForm.content);
      setEditingTemplate(null);
    } else {
      await config.createTemplate(templateForm.name, templateForm.content);
    }
    setTemplateForm({ name: '', content: '' });
  }

  async function handleDeleteTemplate(id) {
    await config.deleteTemplate(id);
  }

  // ── Render settings ───────────────────────────────────────────────────────

  async function handleSaveRenderSettings() {
    setSavingRender(true);
    try {
      await Promise.all([
        saveSetting('RENDER_DPI',          renderDpi),
        saveSetting('RENDER_JPEG_QUALITY', renderQuality),
        saveSetting('RENDER_MAX_PAGES',    renderMaxPages),
      ]);
      showToast('Render settings saved.', 'success');
    } catch (err) {
      showToast(`Failed to save render settings: ${err.message}`, 'error');
    } finally {
      setSavingRender(false);
    }
  }

  if (config.loading) {
    return (
      <div>
        <PanelHeader title="Configure AI Logic" subtitle="Loading configuration..." />
        <p className="muted" style={{ padding: '1rem' }}>Loading...</p>
      </div>
    );
  }

  const activeProfile      = config.docProfiles.find((p) => p.docType === activeDocType);
  const hasRubricOverride  = Boolean(activeProfile?.rubricSection?.trim());
  const hasDiagramOverride = Boolean(activeProfile?.diagramSection?.trim());

  // ── Section nav items ─────────────────────────────────────────────────────
  const NAV = [
    { key: 'context',    label: 'Class Context' },
    { key: 'docprofiles', label: 'Document Profiles' },
    { key: 'steps',      label: 'Prompt Steps' },
    { key: 'templates',  label: 'Templates' },
    { key: 'render',     label: 'Render Settings' },
  ];

  return (
    <div className="pw-root">
      <ToastMessage toast={toast} />

      <PanelHeader
        title="Configure AI Logic"
        subtitle="Configure evaluation behavior, templates, and render settings"
      />

      {/* ── Section Nav ──────────────────────────────────────────────────── */}
      <div className="pw-tabs" style={{ marginBottom: '0.5rem' }}>
        {NAV.map(({ key, label }) => (
          <button
            key={key}
            className={`pw-tab ${activeSection === key ? 'pw-tab--active' : ''}`}
            onClick={() => setActiveSection(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ════════════════════════════════════════════════════════════════════
          SECTION: Class Context
      ════════════════════════════════════════════════════════════════════ */}
      {activeSection === 'context' && (
        <section className="pw-card">
          <div className="pw-card__header-row">
            <div>
              <h3 className="pw-card__title">Class Context Profile</h3>
              <p className="pw-muted">
                Describe the current class — their tools, semester stage, and common weaknesses.
                This paragraph is injected into every evaluation so the AI understands the academic context.
              </p>
            </div>
            <button className="pw-btn pw-btn--primary" onClick={() => config.saveClassContext(contextDraft)}>
              Save Context
            </button>
          </div>
          <textarea
            className="pw-textarea pw-textarea--tall"
            placeholder="e.g. This is a 3rd year IT class using StarUML and Lucidchart. They are in Week 10 of the semester..."
            value={contextDraft}
            onChange={(e) => setContextDraft(e.target.value)}
            rows={5}
          />
        </section>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          SECTION: Document Type Profiles (rubric + diagram)
      ════════════════════════════════════════════════════════════════════ */}
      {activeSection === 'docprofiles' && (
        <section className="pw-card">
          <h3 className="pw-card__title">Document Type Profiles</h3>
          <p className="pw-muted">
            Override the default rubric and diagram analysis instructions per document type.
            Leave blank to use the hardcoded defaults.
          </p>

          <div className="pw-tabs">
            {DOC_TYPES.map((dt) => {
              const profile    = config.docProfiles.find((p) => p.docType === dt);
              const hasOverride = Boolean(profile?.rubricSection?.trim() || profile?.diagramSection?.trim());
              return (
                <button
                  key={dt}
                  className={`pw-tab ${activeDocType === dt ? 'pw-tab--active' : ''}`}
                  onClick={() => setActiveDocType(dt)}
                >
                  {dt}
                  {hasOverride && <span className="pw-tab__dot" title="Has active override" />}
                </button>
              );
            })}
          </div>

          <div className="pw-doc-profile">
            <div className="pw-override-status-row">
              <span className={`pw-override-pill ${hasRubricOverride ? 'pw-override-pill--active' : 'pw-override-pill--default'}`}>
                Rubric: {hasRubricOverride ? 'Override active' : 'Using default'}
              </span>
              <span className={`pw-override-pill ${hasDiagramOverride ? 'pw-override-pill--active' : 'pw-override-pill--default'}`}>
                Diagram Analysis: {hasDiagramOverride ? 'Override active' : 'Using default'}
              </span>
            </div>

            <div className="pw-field">
              <label className="pw-label">Rubric Section</label>
              <textarea
                className="pw-textarea"
                placeholder={`Leave blank to use the default rubric criteria for ${activeDocType}.`}
                value={rubricDrafts[activeDocType]}
                onChange={(e) => setRubricDrafts((prev) => ({ ...prev, [activeDocType]: e.target.value }))}
                rows={6}
              />
            </div>

            <div className="pw-field">
              <label className="pw-label">Diagram Analysis Section</label>
              <textarea
                className="pw-textarea"
                placeholder={`Leave blank to use the default diagram analysis instructions for ${activeDocType}.`}
                value={diagramDrafts[activeDocType]}
                onChange={(e) => setDiagramDrafts((prev) => ({ ...prev, [activeDocType]: e.target.value }))}
                rows={8}
              />
            </div>

            <div className="pw-action-row" style={{ display: 'flex', gap: '10px' }}>
              <button className="pw-btn pw-btn--soft"  onClick={handleShowDefaultsModal}>Show Defaults</button>
              <button className="pw-btn pw-btn--ghost" onClick={() => handleClearDocProfile(activeDocType)}>Clear Override</button>
              <button className="pw-btn pw-btn--primary" onClick={() => handleSaveDocProfile(activeDocType)}>
                Save {activeDocType} Profile
              </button>
            </div>
          </div>
        </section>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          SECTION: Prompt Steps
      ════════════════════════════════════════════════════════════════════ */}
      {activeSection === 'steps' && (
        <section className="pw-card">
          <h3 className="pw-card__title">Prompt Steps</h3>
          <p className="pw-muted">
            Override the evaluation framework steps globally or per-document-type.
            Resolution order: Per-doc-type override → Global override → Hardcoded default.
            Steps 2 (Diagram) and 3 (Rubric) are managed in the Document Profiles tab.
          </p>

          {/* ── Sub-tabs: Global vs per-doc-type ── */}
          <div className="pw-tabs" style={{ marginBottom: '1rem' }}>
            <button
              className={`pw-tab ${activeStepDocType === '_global' ? 'pw-tab--active' : ''}`}
              onClick={() => setActiveStepDocType('_global')}
            >
              Global
              {STEP_DEFINITIONS.some(({ key }) => globalStepSaved[key]?.trim()) && (
                <span className="pw-tab__dot" title="Has active global override" />
              )}
            </button>
            {DOC_TYPES.map((dt) => {
              const drafts     = docTypeStepDrafts[dt] || {};
              const hasOverride = STEP_DEFINITIONS.some(({ key }) => drafts[key]?.trim());
              return (
                <button
                  key={dt}
                  className={`pw-tab ${activeStepDocType === dt ? 'pw-tab--active' : ''}`}
                  onClick={() => setActiveStepDocType(dt)}
                >
                  {dt}
                  {hasOverride && <span className="pw-tab__dot" title="Has active step override" />}
                </button>
              );
            })}
          </div>

          {loadingSteps ? (
            <p className="pw-muted">Loading step profiles...</p>
          ) : (
            <>
              {/* ── Global overrides ── */}
              {activeStepDocType === '_global' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {STEP_DEFINITIONS.map(({ key, label, description }) => {
                    const isExpanded    = expandedStep === `global_${key}`;
                    const hasGlobalSave = Boolean(globalStepSaved[key]?.trim());
                    const showDefault   = showStepDefault[`global_${key}`];

                    return (
                      <StepCard
                        key={key}
                        stepKey={key}
                        label={label}
                        description={description}
                        isExpanded={isExpanded}
                        onToggle={() => setExpandedStep(isExpanded ? null : `global_${key}`)}
                        hasOverride={hasGlobalSave}
                        overrideLabel="Global override active"
                        defaultLabel="Using hardcoded default"
                        draftValue={globalStepDrafts[key] || ''}
                        onDraftChange={(val) => setGlobalStepDrafts((prev) => ({ ...prev, [key]: val }))}
                        defaultValue={stepDefaults[key.toLowerCase()] || ''}
                        showDefault={showDefault}
                        onToggleDefault={() => setShowStepDefault((prev) => ({ ...prev, [`global_${key}`]: !showDefault }))}
                        onSave={() => handleSaveGlobalStep(key)}
                        onClear={() => handleClearGlobalStep(key)}
                        placeholder={`Leave blank to use the hardcoded default for ${label}.`}
                      />
                    );
                  })}
                </div>
              )}

              {/* ── Per-doc-type overrides ── */}
              {DOC_TYPES.includes(activeStepDocType) && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <p className="pw-muted" style={{ margin: '0 0 0.5rem' }}>
                    These override the global step settings specifically for <strong>{activeStepDocType}</strong> documents.
                    Leave blank to fall through to the global override (or hardcoded default).
                  </p>
                  {STEP_DEFINITIONS.map(({ key, label, description }) => {
                    const cardKey    = `${activeStepDocType}_${key}`;
                    const isExpanded = expandedStep === cardKey;
                    const drafts     = docTypeStepDrafts[activeStepDocType] || {};
                    const hasOverride = Boolean(drafts[key]?.trim());
                    const showDefault = showStepDefault[cardKey];

                    return (
                      <StepCard
                        key={cardKey}
                        stepKey={key}
                        label={label}
                        description={description}
                        isExpanded={isExpanded}
                        onToggle={() => setExpandedStep(isExpanded ? null : cardKey)}
                        hasOverride={hasOverride}
                        overrideLabel={`${activeStepDocType} override active`}
                        defaultLabel="Falls through to global/default"
                        draftValue={drafts[key] || ''}
                        onDraftChange={(val) =>
                          setDocTypeStepDrafts((prev) => ({
                            ...prev,
                            [activeStepDocType]: { ...prev[activeStepDocType], [key]: val },
                          }))
                        }
                        defaultValue={stepDefaults[key.toLowerCase()] || ''}
                        showDefault={showDefault}
                        onToggleDefault={() => setShowStepDefault((prev) => ({ ...prev, [cardKey]: !showDefault }))}
                        onSave={null}   // per-doc-type saves are batched
                        onClear={() => handleClearDocTypeStep(activeStepDocType, key)}
                        placeholder={`Leave blank to fall through to global override or hardcoded default for ${label}.`}
                      />
                    );
                  })}

                  <div className="pw-action-row">
                    <button
                      className="pw-btn pw-btn--ghost"
                      onClick={() => {
                        setDocTypeStepDrafts((prev) => ({
                          ...prev,
                          [activeStepDocType]: Object.fromEntries(STEP_DEFINITIONS.map(({ key }) => [key, ''])),
                        }));
                        showToast(`All ${activeStepDocType} step overrides cleared (unsaved). Click Save to apply.`, 'success');
                      }}
                    >
                      Clear All {activeStepDocType} Overrides
                    </button>
                    <button
                      className="pw-btn pw-btn--primary"
                      onClick={() => handleSaveDocTypeSteps(activeStepDocType)}
                    >
                      Save {activeStepDocType} Step Overrides
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </section>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          SECTION: Prompt Template Library
      ════════════════════════════════════════════════════════════════════ */}
      {activeSection === 'templates' && (
        <section className="pw-card">
          <h3 className="pw-card__title">Prompt Template Library</h3>
          <p className="pw-muted">
            Named reusable instruction sets. Select a template in the Analyze modal to populate
            the Professor Directives field.
          </p>

          {config.promptTemplates.length > 0 ? (
            <div className="pw-template-list">
              {config.promptTemplates.map((t) => (
                <div key={t.id} className="pw-template-item">
                  <div className="pw-template-item__info">
                    <span className="pw-template-item__name">{t.name}</span>
                    <span className="pw-template-item__preview">
                      {t.content.slice(0, 120)}{t.content.length > 120 ? '…' : ''}
                    </span>
                  </div>
                  <div className="pw-template-item__actions">
                    <button className="pw-btn pw-btn--soft"   onClick={() => handleStartEdit(t)}>Edit</button>
                    <button className="pw-btn pw-btn--danger" onClick={() => handleDeleteTemplate(t.id)}>Delete</button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="pw-muted" style={{ marginBottom: '1rem' }}>No templates saved yet.</p>
          )}

          <div className="pw-template-form">
            <h4 className="pw-template-form__title">
              {editingTemplate ? `Editing: ${editingTemplate.name}` : 'New Template'}
            </h4>
            <div className="pw-field">
              <label className="pw-label">Template Name</label>
              <input
                className="pw-input"
                type="text"
                placeholder='e.g. "Strict Final Submission"'
                value={templateForm.name}
                onChange={(e) => setTemplateForm((prev) => ({ ...prev, name: e.target.value }))}
              />
            </div>
            <div className="pw-field">
              <label className="pw-label">Instructions</label>
              <textarea
                className="pw-textarea"
                placeholder="e.g. Be extremely strict on diagrams..."
                value={templateForm.content}
                onChange={(e) => setTemplateForm((prev) => ({ ...prev, content: e.target.value }))}
                rows={5}
              />
            </div>
            <div className="pw-action-row">
              {editingTemplate && (
                <button className="pw-btn pw-btn--ghost" onClick={handleCancelEdit}>Cancel</button>
              )}
              <button className="pw-btn pw-btn--primary" onClick={handleSaveTemplate}>
                {editingTemplate ? 'Update Template' : 'Save as New Template'}
              </button>
            </div>
          </div>
        </section>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          SECTION: Render Settings
      ════════════════════════════════════════════════════════════════════ */}
      {activeSection === 'render' && (
        <section className="pw-card">
          <div className="pw-card__header-row">
            <div>
              <h3 className="pw-card__title">Render Settings</h3>
              <p className="pw-muted">Controls how PDF pages are rendered before being sent to the AI model.</p>
            </div>
            <button className="pw-btn pw-btn--primary" onClick={handleSaveRenderSettings} disabled={savingRender}>
              {savingRender ? 'Saving...' : 'Save Render Settings'}
            </button>
          </div>

          <div className="pw-render-grid">
            <div className="pw-field">
              <label className="pw-label">Render DPI</label>
              <span className="pw-hint">Recommended range: 150–300. Higher DPI improves diagram clarity.</span>
              <input className="pw-input" type="number" min="72" max="600" value={renderDpi} onChange={(e) => setRenderDpi(e.target.value)} />
            </div>
            <div className="pw-field">
              <label className="pw-label">JPEG Quality</label>
              <span className="pw-hint">Range: 0.5–1.0. Values below 0.80 may introduce artifacts.</span>
              <input className="pw-input" type="number" min="0.5" max="1.0" step="0.05" value={renderQuality} onChange={(e) => setRenderQuality(e.target.value)} />
            </div>
            <div className="pw-field">
              <label className="pw-label">Max Pages to Render</label>
              <span className="pw-hint">Set to 999 to render all pages.</span>
              <input className="pw-input" type="number" min="1" max="999" value={renderMaxPages} onChange={(e) => setRenderMaxPages(e.target.value)} />
            </div>
          </div>

          {costEstimate && (
            <div className="pw-cost-estimate">
              <span className="pw-cost-estimate__label">Estimated image tokens per evaluation</span>
              <span className="pw-cost-estimate__value">
                ~{costEstimate.tokens} tokens ({costEstimate.pages} pages × ~{TOKENS_PER_IMAGE_AT_300DPI.toLocaleString()} tokens) ≈ <strong>${costEstimate.cost}</strong>
              </span>
              <span className="pw-cost-estimate__note">Estimate is approximate.</span>
            </div>
          )}
        </section>
      )}

      {/* ── System Defaults Modal (doc profiles) ─────────────────────────── */}
      {showDefaultsModal && systemDefaults && systemDefaults[activeDocType] && (
        <AppModal
          isOpen={showDefaultsModal}
          onClose={() => setShowDefaultsModal(false)}
          title={`System Defaults for ${activeDocType}`}
        >
          <div style={{ padding: '1rem', maxWidth: '800px' }}>
            <p className="pw-muted" style={{ marginBottom: '1rem' }}>
              These are the hardcoded system defaults. You can reference them or apply the whole template to your editor.
            </p>
            <div className="pw-field">
              <label className="pw-label">Default Rubric Section</label>
              <textarea className="pw-textarea" readOnly rows={6} value={systemDefaults[activeDocType].rubricSection} style={{ backgroundColor: 'var(--bg-secondary)', cursor: 'text' }} />
            </div>
            <div className="pw-field">
              <label className="pw-label">Default Diagram Analysis Section</label>
              <textarea className="pw-textarea" readOnly rows={8} value={systemDefaults[activeDocType].diagramSection} style={{ backgroundColor: 'var(--bg-secondary)', cursor: 'text' }} />
            </div>
            <div className="pw-action-row" style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button className="pw-btn pw-btn--ghost"   onClick={() => setShowDefaultsModal(false)}>Close</button>
              <button className="pw-btn pw-btn--primary" onClick={handleApplyDefaultsFromModal}>Apply to Editor</button>
            </div>
          </div>
        </AppModal>
      )}
    </div>
  );
}

// ── StepCard sub-component ────────────────────────────────────────────────────

function StepCard({
  stepKey, label, description,
  isExpanded, onToggle,
  hasOverride, overrideLabel, defaultLabel,
  draftValue, onDraftChange,
  defaultValue, showDefault, onToggleDefault,
  onSave, onClear,
  placeholder,
}) {
  return (
    <div className="pw-doc-profile" style={{ padding: '0' }}>
      {/* Header row — always visible */}
      <div
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: '1rem', padding: '0.75rem 1rem',
          cursor: 'pointer', userSelect: 'none',
        }}
        onClick={onToggle}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1 }}>
          <span
            style={{
              fontSize: '0.75rem', fontWeight: 800,
              color: isExpanded ? 'var(--brand)' : 'var(--text-muted)',
              transition: 'transform 0.2s',
              transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
              display: 'inline-block',
            }}
          >
            ▶
          </span>
          <div>
            <div style={{ fontWeight: 700, fontSize: '0.92rem', color: 'var(--text-main)' }}>{label}</div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '1px' }}>{description}</div>
          </div>
        </div>
        <span className={`pw-override-pill ${hasOverride ? 'pw-override-pill--active' : 'pw-override-pill--default'}`}>
          {hasOverride ? overrideLabel : defaultLabel}
        </span>
      </div>

      {/* Expanded body */}
      {isExpanded && (
        <div style={{ padding: '0 1rem 1rem', borderTop: '1px solid var(--line-soft)' }}>
          <div className="pw-field" style={{ marginTop: '0.75rem' }}>
            <div className="pw-label-row">
              <label className="pw-label">Override Content</label>
              <button className="pw-btn--link" onClick={onToggleDefault}>
                {showDefault ? 'Hide Default' : 'View Default'}
              </button>
            </div>

            {showDefault && (
              <pre
                className="pw-hint-container--expanded"
                style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}
              >
                {defaultValue || '(No default available)'}
              </pre>
            )}

            <textarea
              className="pw-textarea"
              placeholder={placeholder}
              value={draftValue}
              onChange={(e) => onDraftChange(e.target.value)}
              rows={8}
            />
          </div>

          <div className="pw-action-row" style={{ marginTop: '0.75rem' }}>
            <button className="pw-btn pw-btn--soft" onClick={onToggleDefault}>
              {showDefault ? 'Hide Default' : 'View Default'}
            </button>
            <button className="pw-btn pw-btn--ghost" onClick={onClear}>
              Clear Override
            </button>
            {onSave && (
              <button className="pw-btn pw-btn--primary" onClick={onSave}>
                Save
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}