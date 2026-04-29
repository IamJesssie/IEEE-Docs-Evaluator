import { API_BASE_URL } from '../api';
import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../supabaseClient';
import {
  analyzeSubmission,
  fetchAiRuntimeSettings,
  fetchClassRoster,
  fetchHistoryItem,
  fetchTeacherHistory,
  fetchTeacherSettings,
  fetchTeacherSubmissions,
  fetchPromptTemplates,
  saveEvaluation,
  saveMultipleSettings,
  saveSetting,
  sendEvaluation,
  softDeleteReport,
  restoreReport,
  fetchHiddenSubmissionIds,
  hideSubmission,
  restoreSubmission,
  clearAllHistory,
} from '../services/dashboardService';
import {
  buildFilterOptions,
  extractSubmissionMeta,
  filterSubmissions,
  normalizeSection,
  sortSubmissions,
} from '../utils/dashboardUtils';

// ── Tiny UUID helper (no dependency needed) ───────────────────────────────────
function generateSessionId() {
  return crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function useTeacherDashboard(showToast) {
  const [currentView, setCurrentView] = useState('submissions');
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: 'date', direction: 'desc' });
  const [selectedStudent, setSelectedStudent] = useState('');
  const [selectedSection, setSelectedSection] = useState('');
  const [selectedTeamCode, setSelectedTeamCode] = useState('');
  const [selectedDocType, setSelectedDocType] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const [isAnalyzeOpen, setIsAnalyzeOpen] = useState(false);
  const [customRules, setCustomRules] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [aiResult, setAiResult] = useState('');
  const [aiImages, setAiImages] = useState([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // ── SSE progress state ────────────────────────────────────────────────────
  const [analysisProgress, setAnalysisProgress] = useState({
    currentStep: '',
    currentMessage: '',
    percent: 0,
    isRetrying: false,
  });

  const [historyLogs, setHistoryLogs] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [selectedHistoryItem, setSelectedHistoryItem] = useState(null);
  const [isEditingReport, setIsEditingReport] = useState(false);
  const [editedReportText, setEditedReportText] = useState('');
  const [editedTeacherFeedback, setEditedTeacherFeedback] = useState('');
  const [reportSearchQuery, setReportSearchQuery] = useState('');
  const [reportStatusFilter, setReportStatusFilter] = useState('');
  const [reportDocTypeFilter, setReportDocTypeFilter] = useState('');
  const [reportSelectedStudent, setReportSelectedStudent] = useState('');
  const [reportSelectedSection, setReportSelectedSection] = useState('');
  const [reportSelectedTeamCode, setReportSelectedTeamCode] = useState('');

  const [hiddenSubmissionIds, setHiddenSubmissionIds] = useState([]);

  const [settings, setSettings] = useState([]);
  const [editedSettings, setEditedSettings] = useState({});
  const [loadingSettings, setLoadingSettings] = useState(false);
  const [isSavingAll, setIsSavingAll] = useState(false);
  const [aiRuntimeSettings, setAiRuntimeSettings] = useState(null);
  const [promptTemplates, setPromptTemplates] = useState([]);
  const [roster, setRoster] = useState([]);

  const analysisAbortRef  = useRef(null);
  const sseRef            = useRef(null);   // holds the EventSource
  const sessionIdRef      = useRef(null);   // current analysis session ID
  const selectedFileRef   = useRef(null);
  const isAnalyzeOpenRef  = useRef(false);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);

  useEffect(() => { selectedFileRef.current  = selectedFile;  }, [selectedFile]);
  useEffect(() => { isAnalyzeOpenRef.current = isAnalyzeOpen; }, [isAnalyzeOpen]);

  // ── SSE cleanup on unmount ────────────────────────────────────────────────
  useEffect(() => {
    return () => closeSse();
  }, []);

  function closeSse() {
    if (sseRef.current) {
      sseRef.current.close();
      sseRef.current = null;
    }
    sessionIdRef.current = null;
  }

  function openSse(sessionId) {
    closeSse();
    const es = new EventSource(`${API_BASE_URL}/ai/progress/${sessionId}`);
    sseRef.current    = es;
    sessionIdRef.current = sessionId;

    es.addEventListener('progress', (e) => {
      try {
        const { step, message, percent } = JSON.parse(e.data);
        setAnalysisProgress({
          currentStep:    step,
          currentMessage: message,
          percent:        percent,
          isRetrying:     step === 'RETRYING',
        });
      } catch { /* ignore parse errors */ }
    });

    es.addEventListener('done', () => {
      closeSse();
    });

    es.addEventListener('error', (e) => {
      try {
        const { error: msg } = JSON.parse(e.data || '{}');
        if (msg) showToast(`Analysis error: ${msg}`, 'error');
      } catch { /* ignore */ }
      closeSse();
    });

    es.onerror = () => {
      // Connection dropped — close silently; the HTTP response handles error UI
      closeSse();
    };
  }

  // ── Real-time subscriptions ───────────────────────────────────────────────

  useEffect(() => {
    const historyChannel = supabase
      .channel('teacher-evaluation-history')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'evaluation_history' }, (payload) => {
        if (payload.eventType === 'INSERT') {
          loadHistory().catch(() => {});
        }
        if (payload.eventType === 'UPDATE') {
          setHistoryLogs((prev) =>
            prev.map((log) => {
              if (log.id === payload.new.id) {
                if (payload.new.is_deleted) return null;
                return { ...log, isSent: payload.new.is_sent, isDeleted: payload.new.is_deleted, version: payload.new.version };
              }
              return log;
            }).filter(Boolean)
          );
        }
        if (payload.eventType === 'DELETE') {
          setHistoryLogs((prev) => prev.filter((log) => log.id !== payload.old.id));
        }
      })
      .subscribe();

    const hiddenChannel = supabase
      .channel('teacher-hidden-submissions')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'hidden_submissions' }, (payload) => {
        if (payload.eventType === 'INSERT') {
          setHiddenSubmissionIds((prev) =>
            prev.includes(payload.new.file_id) ? prev : [...prev, payload.new.file_id]
          );
        }
        if (payload.eventType === 'DELETE') {
          setHiddenSubmissionIds((prev) => prev.filter((id) => id !== payload.old.file_id));
        }
      })
      .subscribe();

    const templatesChannel = supabase
      .channel('teacher-prompt-templates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'prompt_templates' }, () => {
        fetchPromptTemplates().then(setPromptTemplates).catch(() => {});
      })
      .subscribe();

    const docProfilesChannel = supabase
      .channel('teacher-doc-profiles')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'professor_doc_profiles' }, () => {
        console.info('[realtime] professor_doc_profiles updated');
      })
      .subscribe();

    const classContextChannel = supabase
      .channel('teacher-class-context')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'class_context_profile' }, () => {
        console.info('[realtime] class_context_profile updated');
      })
      .subscribe();

    return () => {
      supabase.removeChannel(historyChannel);
      supabase.removeChannel(hiddenChannel);
      supabase.removeChannel(templatesChannel);
      supabase.removeChannel(docProfilesChannel);
      supabase.removeChannel(classContextChannel);
    };
  }, []);

  // ── Data loaders ──────────────────────────────────────────────────────────

  async function loadSubmissions() {
    try {
      setLoading(true);
      setError('');
      const [data, hiddenIds] = await Promise.all([
        fetchTeacherSubmissions(),
        fetchHiddenSubmissionIds(),
      ]);
      setFiles(data);
      setHiddenSubmissionIds(hiddenIds);
    } catch (err) {
      setError(`Failed to load submissions: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  async function loadHistory() {
    try {
      setLoadingHistory(true);
      setError('');
      const data = await fetchTeacherHistory();
      setHistoryLogs(data);
    } catch (err) {
      setError(`Failed to load history: ${err.message}`);
    } finally {
      setLoadingHistory(false);
    }
  }

  async function loadSettings() {
    try {
      setLoadingSettings(true);
      setError('');
      const [allSettings, runtimeSettings] = await Promise.all([
        fetchTeacherSettings(),
        fetchAiRuntimeSettings(),
      ]);
      setSettings(allSettings);
      setAiRuntimeSettings(runtimeSettings);
      setEditedSettings({});
    } catch (err) {
      setError(`Failed to load settings: ${err.message}`);
    } finally {
      setLoadingSettings(false);
    }
  }

  async function loadAiRuntime() {
    try {
      const [runtimeSettings, templates] = await Promise.all([
        fetchAiRuntimeSettings(),
        fetchPromptTemplates(),
      ]);
      setAiRuntimeSettings(runtimeSettings);
      setPromptTemplates(templates);
    } catch { /* keep UI usable */ }
  }

  const analyzedFileIds = useMemo(() => new Set(historyLogs.map((h) => h.fileId)), [historyLogs]);

  useEffect(() => {
    if (currentView === 'submissions') { loadSubmissions(); loadHistory(); loadAiRuntime(); }
    if (currentView === 'reports')     loadHistory();
    if (currentView === 'settings')    loadSettings();
    if (currentView === 'submissions' || currentView === 'reports') {
      fetchClassRoster().then(setRoster).catch(() => {});
    }
  }, [currentView]);

  // ── Filter options ────────────────────────────────────────────────────────

  const filterOptions = useMemo(() => {
    const base = buildFilterOptions(files);
    if (roster.length > 0) {
      const rosterSections  = [...new Set(roster.map((s) => s.section).filter(Boolean))].sort((a, b) => a.localeCompare(b));
      const rosterTeamCodes = [...new Set(roster.map((s) => s.groupCode).filter(Boolean))].sort((a, b) => a.localeCompare(b));
      return { ...base, sections: rosterSections, teamCodes: rosterTeamCodes };
    }
    return base;
  }, [files, roster]);

  const filteredFiles = useMemo(
    () => filterSubmissions(
      files.filter((item) => !hiddenSubmissionIds.includes(item.id)),
      { selectedStudent, selectedSection, selectedTeamCode, selectedDocType, searchQuery },
    ),
    [files, hiddenSubmissionIds, selectedStudent, selectedSection, selectedTeamCode, selectedDocType, searchQuery],
  );

  const sortedFiles = useMemo(() => sortSubmissions(filteredFiles, sortConfig), [filteredFiles, sortConfig]);

  const submissionStats = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const isSearchingStudent = query.length > 0;
    const scoped = files.filter((item) => {
      const meta = extractSubmissionMeta(item.name);
      if (selectedSection  && meta.section  !== normalizeSection(selectedSection))            return false;
      if (selectedTeamCode && meta.teamCode !== selectedTeamCode.toUpperCase())               return false;
      return true;
    });
    const scopedRoster = roster.filter((s) => {
      if (selectedSection  && s.section              !== selectedSection)             return false;
      if (selectedTeamCode && s.groupCode?.toUpperCase() !== selectedTeamCode.toUpperCase()) return false;
      return true;
    });
    if (isSearchingStudent) {
      const matched = scoped.filter((item) => {
        const meta = extractSubmissionMeta(item.name);
        return meta.studentName.toLowerCase().includes(query);
      });
      const rosterMatched = scopedRoster.filter((s) => s.studentName?.toLowerCase().includes(query));
      const matchedNames = [...new Set([
        ...matched.map((f) => extractSubmissionMeta(f.name).studentName),
        ...rosterMatched.map((s) => s.studentName),
      ].filter(Boolean))];
      return {
        studentName: matchedNames.length === 1 ? matchedNames[0] : null,
        studentCount: matchedNames.length,
        docCounts: ['SRS', 'SDD', 'SPMP', 'STD'].map((type) => ({
          type,
          count: matched.filter((f) => extractSubmissionMeta(f.name).documentType === type).length,
        })),
      };
    }
    const studentCount = scopedRoster.length > 0
      ? scopedRoster.length
      : new Set(scoped.map((item) => extractSubmissionMeta(item.name).studentName).filter(Boolean)).size;
    return {
      studentName: null,
      studentCount,
      docCounts: ['SRS', 'SDD', 'SPMP', 'STD'].map((type) => ({
        type,
        count: scoped.filter((f) => extractSubmissionMeta(f.name).documentType === type).length,
      })),
    };
  }, [files, roster, selectedSection, selectedTeamCode, searchQuery]);

  const reportDocTypeOptions = useMemo(
    () => [...new Set(historyLogs.map((item) => extractSubmissionMeta(item.fileName).documentType).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [historyLogs],
  );

  const reportFilterOptions = useMemo(() => {
    const students = new Set(), sections = new Set(), teamCodes = new Set();
    historyLogs.forEach((item) => {
      const meta = extractSubmissionMeta(item.fileName);
      if (meta.studentName) students.add(meta.studentName);
      if (meta.section)     sections.add(meta.section);
      if (meta.teamCode)    teamCodes.add(meta.teamCode);
    });
    if (roster.length > 0) {
      return {
        students:  [...students].sort((a, b) => a.localeCompare(b)),
        sections:  [...new Set(roster.map((s) => s.section).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
        teamCodes: [...new Set(roster.map((s) => s.groupCode).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
      };
    }
    return {
      students:  [...students].sort((a, b) => a.localeCompare(b)),
      sections:  [...sections].sort((a, b) => a.localeCompare(b)),
      teamCodes: [...teamCodes].sort((a, b) => a.localeCompare(b)),
    };
  }, [historyLogs, roster]);

  const filteredHistoryLogs = useMemo(() => {
    const query = reportSearchQuery.trim().toLowerCase();
    return historyLogs.filter((log) => {
      const docType = extractSubmissionMeta(log.fileName).documentType;
      const meta    = extractSubmissionMeta(log.fileName);
      if (reportStatusFilter === 'sent'    && !log.isSent) return false;
      if (reportStatusFilter === 'pending' &&  log.isSent) return false;
      if (reportDocTypeFilter && docType !== reportDocTypeFilter) return false;
      if (reportSelectedStudent  && meta.studentName !== reportSelectedStudent)                       return false;
      if (reportSelectedSection  && meta.section     !== normalizeSection(reportSelectedSection))    return false;
      if (reportSelectedTeamCode && meta.teamCode    !== reportSelectedTeamCode.toUpperCase())       return false;
      if (query) {
        const searchable = [log.fileName, log.isSent ? 'sent' : 'pending', log.evaluatedAt]
          .filter(Boolean).join(' ').toLowerCase();
        if (!searchable.includes(query)) return false;
      }
      return true;
    });
  }, [historyLogs, reportSearchQuery, reportStatusFilter, reportDocTypeFilter, reportSelectedStudent, reportSelectedSection, reportSelectedTeamCode]);

  const allHistoryCount = historyLogs.length;

  // ── Trash bin ─────────────────────────────────────────────────────────────

  const trashBinSummary = useMemo(() => {
    const trashedSubmissions = files
      .filter((item) => hiddenSubmissionIds.includes(item.id))
      .map((item) => ({ id: item.id, kind: 'submission', label: item.name, meta: 'Student Submission' }));
    return { submissionCount: trashedSubmissions.length, reportCount: 0, trashedSubmissions, trashedReports: [], trashedItems: trashedSubmissions };
  }, [files, hiddenSubmissionIds]);

  async function deleteReport(reportId) {
    try {
      await softDeleteReport(reportId);
      setHistoryLogs((prev) => prev.filter((log) => log.id !== reportId));
      showToast('Report deleted.', 'success');
    } catch (err) { showToast(`Failed to delete report: ${err.message}`, 'error'); }
  }

  async function deleteSubmission(fileId) {
    try {
      await hideSubmission(fileId);
      setHiddenSubmissionIds((prev) => [...prev, fileId]);
      showToast('Submission hidden.', 'success');
    } catch (err) { showToast(`Failed to hide submission: ${err.message}`, 'error'); }
  }

  async function restoreSelectedTrashItems(selectedItems = []) {
    const items = selectedItems.filter(Boolean);
    if (!items.length) { showToast('Select one or more trashed items to restore.', 'success'); return; }
    try {
      await Promise.all(items.map((item) => item.kind === 'submission' ? restoreSubmission(item.id) : restoreReport(item.id)));
      const restoredIds = items.filter((i) => i.kind === 'submission').map((i) => i.id);
      setHiddenSubmissionIds((prev) => prev.filter((id) => !restoredIds.includes(id)));
      showToast(`Restored ${items.length} item(s).`, 'success');
    } catch (err) { showToast(`Failed to restore items: ${err.message}`, 'error'); }
  }

  async function safeEmptyAllTrashBins() {
    if (!hiddenSubmissionIds.length) { showToast('Trash bins are already empty.', 'success'); return; }
    try {
      await Promise.all(hiddenSubmissionIds.map((id) => restoreSubmission(id)));
      setHiddenSubmissionIds([]);
      showToast('Trash cleared.', 'success');
    } catch (err) { showToast(`Failed to empty trash: ${err.message}`, 'error'); }
  }

  // ── Submissions ───────────────────────────────────────────────────────────

  function clearReportFilters() {
    setReportSelectedStudent(''); setReportSelectedSection(''); setReportSelectedTeamCode('');
    setReportStatusFilter(''); setReportDocTypeFilter(''); setReportSearchQuery('');
  }

  async function handleManualSync() {
    if (loading || isSyncing) return;
    try {
      setIsSyncing(true); setError('');
      const [data, hiddenIds] = await Promise.all([fetchTeacherSubmissions(), fetchHiddenSubmissionIds()]);
      setFiles(data); setHiddenSubmissionIds(hiddenIds);
      showToast('Submissions synced successfully.', 'success');
    } catch (err) { setError(`Sync failed: ${err.message}`); }
    finally { setIsSyncing(false); }
  }

  function requestSort(key) {
    const direction = sortConfig.key === key && sortConfig.direction === 'asc' ? 'desc' : 'asc';
    setSortConfig({ key, direction });
  }

  function clearFilters() {
    setSelectedStudent(''); setSelectedSection(''); setSelectedTeamCode('');
    setSelectedDocType(''); setSearchQuery('');
  }

  // ── Analyze modal ─────────────────────────────────────────────────────────

  function openAnalyzeModal(file) {
    if (analysisAbortRef.current && selectedFileRef.current?.id !== file?.id) {
      analysisAbortRef.current.abort();
      analysisAbortRef.current = null;
      setIsAnalyzing(false);
      closeSse();
    }
    setSelectedFile(file);
    setAiResult('');
    setCustomRules('');
    setAnalysisProgress({ currentStep: '', currentMessage: '', percent: 0, isRetrying: false });
    setIsAnalyzeOpen(true);
    loadAiRuntime();
  }

  function closeAnalyzeModal() {
    if (analysisAbortRef.current) { analysisAbortRef.current.abort(); analysisAbortRef.current = null; }
    closeSse();
    setIsAnalyzing(false);
    setAiResult('');
    setAiImages([]);
    setCustomRules('');
    setSelectedFile(null);
    setIsAnalyzeOpen(false);
    setAnalysisProgress({ currentStep: '', currentMessage: '', percent: 0, isRetrying: false });
  }

  async function runAnalysis(modelName) {
    if (!selectedFile) return;
    if (analysisAbortRef.current && !analysisAbortRef.current.signal.aborted) return;

    const controller  = new AbortController();
    analysisAbortRef.current = controller;
    const fileToAnalyze      = selectedFile;
    const customInstructions = customRules;

    // ── Generate sessionId and open SSE BEFORE calling analyze ───────────────
    const sessionId = generateSessionId();
    setAnalysisProgress({ currentStep: '', currentMessage: '', percent: 0, isRetrying: false });
    openSse(sessionId);

    try {
      setIsAnalyzing(true);
      setAiResult('');
      setAiImages([]);
      setCustomRules('');

      const data = await analyzeSubmission(
        fileToAnalyze.id,
        fileToAnalyze.name,
        modelName,
        customInstructions,
        controller.signal,
        sessionId,
      );

      if (controller.signal.aborted) return;
      if (!isAnalyzeOpenRef.current || selectedFileRef.current?.id !== fileToAnalyze.id) return;

      setAiResult(data.analysis);
      setAiImages(data.images || []);
    } catch (err) {
      if (err.name === 'AbortError') return;
      setAiResult(`Error: ${err.message}`);
    } finally {
      if (analysisAbortRef.current === controller) {
        setIsAnalyzing(false);
        analysisAbortRef.current = null;
      }
      closeSse();
    }
  }

  // ── History modal ─────────────────────────────────────────────────────────

  async function startEditingHistory(item) {
    if (!item?.id) { showToast('Cannot load report: Missing ID', 'error'); return; }
    setIsLoadingDetails(true);
    setSelectedHistoryItem(item);
    try {
      const full = await fetchHistoryItem(item.id);
      setSelectedHistoryItem(full);
      setEditedReportText(full.evaluationResult || '');
      setEditedTeacherFeedback(full.teacherFeedback || '');
      setAiImages(full.extractedImages || []);
    } catch (err) {
      showToast(`Failed to load report details: ${err.message}`, 'error');
    } finally { setIsLoadingDetails(false); }
  }

  async function saveEditedHistory() {
    if (!selectedHistoryItem) return;
    try {
      await saveEvaluation(selectedHistoryItem.id, editedReportText, editedTeacherFeedback);
      const updated = { ...selectedHistoryItem, evaluationResult: editedReportText, teacherFeedback: editedTeacherFeedback };
      setSelectedHistoryItem(updated);
      setHistoryLogs((prev) => prev.map((log) => (log.id === updated.id ? updated : log)));
      setIsEditingReport(false);
      showToast('Evaluation updated successfully.', 'success');
    } catch (err) { showToast(`Error updating report: ${err.message}`, 'error'); }
  }

  async function sendHistoryToStudent() {
    if (!selectedHistoryItem) return;
    try {
      await sendEvaluation(selectedHistoryItem.id);
      const updated = { ...selectedHistoryItem, isSent: true };
      setSelectedHistoryItem(updated);
      setHistoryLogs((prev) => prev.map((log) => (log.id === updated.id ? updated : log)));
      showToast('Result sent to Student Dashboard.', 'success');
    } catch (err) { showToast(`Error sending report: ${err.message}`, 'error'); }
  }

  function closeHistoryModal() {
    setSelectedHistoryItem(null);
    setIsEditingReport(false);
  }

  // ── Settings ──────────────────────────────────────────────────────────────

  function handleSettingChange(key, value) {
    setEditedSettings((prev) => ({ ...prev, [key]: value }));
  }

  async function saveAllSettings() {
    const keys = Object.keys(editedSettings);
    if (!keys.length) return;
    try {
      setIsSavingAll(true);
      await Promise.all(keys.map((key) => saveSetting(key, editedSettings[key])));
      showToast('All settings saved.', 'success');
      await loadSettings();
    } catch (err) { showToast(`Failed to save settings: ${err.message}`, 'error'); }
    finally { setIsSavingAll(false); }
  }

  async function saveAiSettingsBatch(payload) {
    if (!payload || !Object.keys(payload).length) return;
    try {
      setIsSavingAll(true);
      await saveMultipleSettings(payload);
      showToast('AI settings saved.', 'success');
      await loadSettings();
    } catch (err) { showToast(`Failed to save AI settings: ${err.message}`, 'error'); }
    finally { setIsSavingAll(false); }
  }

  async function dangerClearAllHistory() {
    try {
      await clearAllHistory();
      setHistoryLogs([]);
      showToast('All evaluation history cleared.', 'success');
    } catch (err) { showToast(`Failed to clear history: ${err.message}`, 'error'); }
  }

  // ── Exports ───────────────────────────────────────────────────────────────

  return {
    currentView, setCurrentView,
    files: sortedFiles,
    customRules, setCustomRules,
    filterOptions, submissionStats,
    selectedStudent, selectedSection, selectedTeamCode, selectedDocType, searchQuery,
    loading, isSyncing, analyzedFileIds, error,
    historyLogs: filteredHistoryLogs, allHistoryCount,
    reportDocTypeOptions, reportFilterOptions,
    reportSearchQuery, reportStatusFilter, reportDocTypeFilter,
    reportSelectedStudent, reportSelectedSection, reportSelectedTeamCode,
    loadingHistory,
    settings, loadingSettings, aiRuntimeSettings, editedSettings, isSavingAll,
    dirtyCount: Object.keys(editedSettings).length,
    isAnalyzeOpen, setIsAnalyzeOpen, closeAnalyzeModal,
    selectedFile, aiResult, aiImages, isAnalyzing,
    analysisProgress,
    selectedHistoryItem, isEditingReport, setIsEditingReport,
    editedReportText, setEditedReportText,
    editedTeacherFeedback, setEditedTeacherFeedback,
    promptTemplates,
    handleManualSync, requestSort,
    setSelectedStudent, setSelectedSection, setSelectedTeamCode, setSelectedDocType, setSearchQuery,
    setReportSearchQuery, setReportStatusFilter, setReportDocTypeFilter,
    setReportSelectedStudent, setReportSelectedSection, setReportSelectedTeamCode,
    clearReportFilters, clearFilters,
    openAnalyzeModal, runAnalysis,
    loadHistory, startEditingHistory, saveEditedHistory, sendHistoryToStudent, closeHistoryModal,
    handleSettingChange, saveAiSettingsBatch, saveAllSettings, loadSettings,
    deleteReport, deleteSubmission, restoreSelectedTrashItems, safeEmptyAllTrashBins,
    trashBinSummary, hiddenSubmissionIds, dangerClearAllHistory,
  };
}