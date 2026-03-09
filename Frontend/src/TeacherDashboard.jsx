import { useEffect, useState } from 'react';
import { syncSubmissionsWithBackend, analyzeDocumentWithAI, getEvaluationHistory, getSystemSettings, updateSystemSetting, updateEvaluationResult, sendEvaluationToStudent } from './api';
import { supabase } from './supabaseClient';
import './TeacherDashboard.css';

const FileIcon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '10px', color: '#64748b' }}>
        <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path>
        <polyline points="13 2 13 9 20 9"></polyline>
    </svg>
);

const CATEGORY_CONFIG = {
    'AI':      { label: 'AI Keys',              color: '#7c3aed', bg: '#f5f3ff', border: '#ede9fe' },
    'GOOGLE':  { label: 'Google ID',            color: '#0369a1', bg: '#f0f9ff', border: '#e0f2fe' },
    'MAPPING': { label: 'Submission Columns',   color: '#b45309', bg: '#fffbeb', border: '#fef3c7' },
};

const CATEGORY_ORDER = ['AI', 'GOOGLE', 'MAPPING'];

const SettingsSection = ({ categoryKey, settings, editedSettings, onSettingChange }) => {
    const config = CATEGORY_CONFIG[categoryKey] || { label: categoryKey, color: '#64748b', bg: '#f8fafc', border: '#e2e8f0' };
    const sectionSettings = settings.filter(s => s.category === categoryKey);
    if (sectionSettings.length === 0) return null;

    return (
        <div className="td-card">
            <div style={{ padding: '16px 24px', backgroundColor: config.bg, borderBottom: `1px solid ${config.border}`, display: 'flex', alignItems: 'center', gap: '10px', borderTopLeftRadius: '12px', borderTopRightRadius: '12px' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: config.color, display: 'inline-block', flexShrink: 0 }} />
                <span style={{ fontSize: '13px', fontWeight: '700', color: config.color, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{config.label}</span>
                <span style={{ marginLeft: 'auto', fontSize: '12px', color: config.color, opacity: 0.7 }}>{sectionSettings.length} setting{sectionSettings.length !== 1 ? 's' : ''}</span>
            </div>

            <div style={{ padding: '8px 24px' }}>
                {sectionSettings.map((setting, idx) => {
                    const currentValue = editedSettings[setting.key] !== undefined
                        ? editedSettings[setting.key]
                        : setting.value;
                    const isDirty = editedSettings[setting.key] !== undefined;

                    return (
                        <div
                            key={setting.key}
                            style={{ display: 'flex', flexDirection: 'column', gap: '6px', paddingTop: '16px', paddingBottom: '16px', borderBottom: idx < sectionSettings.length - 1 ? '1px solid #f1f5f9' : 'none' }}
                        >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <strong style={{ color: '#1e293b', fontSize: '14px' }}>{setting.key}</strong>
                                {isDirty && (
                                    <span style={{ fontSize: '11px', color: '#059669', fontWeight: '600', backgroundColor: '#f0fdf4', padding: '2px 8px', borderRadius: '20px', border: '1px solid #bbf7d0' }}>
                                        Modified
                                    </span>
                                )}
                            </div>
                            <p style={{ margin: 0, fontSize: '12px', color: '#94a3b8' }}>{setting.description}</p>
                            <input
                                type={setting.category === 'AI' ? 'password' : 'text'}
                                value={currentValue}
                                onChange={(e) => onSettingChange(setting.key, e.target.value)}
                                style={{ width: '100%', padding: '9px 12px', borderRadius: '6px', border: isDirty ? `1px solid ${config.color}` : '1px solid #cbd5e1', fontSize: '13px', boxSizing: 'border-box', color: '#1e293b', backgroundColor: isDirty ? config.bg : '#ffffff', outline: 'none', fontFamily: setting.category === 'AI' ? 'monospace' : 'inherit' }}
                            />
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

const TeacherDashboard = ({ user }) => {
    const [currentView, setCurrentView] = useState('dashboard');
    const [files, setFiles] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isSyncing, setIsSyncing] = useState(false);
    const [error, setError] = useState('');
    const [sortConfig, setSortConfig] = useState({ key: 'date', direction: 'desc' });

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedFileForAi, setSelectedFileForAi] = useState(null);
    const [aiResult, setAiResult] = useState('');
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    
    const [historyLogs, setHistoryLogs] = useState([]);
    const [loadingHistory, setLoadingHistory] = useState(false);
    const [selectedHistoryItem, setSelectedHistoryItem] = useState(null);
    
    const [isEditingReport, setIsEditingReport] = useState(false);
    const [editedReportText, setEditedReportText] = useState("");

    const [settings, setSettings] = useState([]);
    const [loadingSettings, setLoadingSettings] = useState(false);
    const [isSavingAll, setIsSavingAll] = useState(false);
    const [editedSettings, setEditedSettings] = useState({});

    const [toast, setToast] = useState({ show: false, message: '', type: 'success' });
    const showToast = (message, type = 'success') => {
        setToast({ show: true, message, type });
        setTimeout(() => setToast(prev => ({ ...prev, show: false })), 3000);
    };

    const getDisplayType = (mimeType) => {
        if (mimeType === 'application/vnd.google-apps.document') return 'Google Doc';
        return 'Document';
    };

    const loadSubmissions = async () => {
        try {
            setLoading(true);
            setError('');
            const data = await syncSubmissionsWithBackend();
            // FIX: Deduplicate by file name instead of file ID
            const uniqueData = Array.from(new Map(data.map(item => [item.name, item])).values());
            setFiles(uniqueData);
        } catch (err) {
            setError("Failed to load submissions: " + err.message);
        } finally {
            setLoading(false);
        }
    };

    const loadHistory = async () => {
        try {
            setLoadingHistory(true);
            const data = await getEvaluationHistory();
            setHistoryLogs(data);
        } catch (err) {
            setError("Failed to load history: " + err.message);
        } finally {
            setLoadingHistory(false);
        }
    };

    const loadSettings = async () => {
        try {
            setLoadingSettings(true);
            setError('');
            const data = await getSystemSettings();
            setSettings(data);
            setEditedSettings({});
        } catch (err) {
            setError("Failed to load settings: " + err.message);
        } finally {
            setLoadingSettings(false);
        }
    };

    useEffect(() => {
        if (currentView === 'dashboard') {
            loadSubmissions(); 
        } else if (currentView === 'reports') {
            loadHistory();
        } else if (currentView === 'settings') {
            loadSettings();
        }
    }, [currentView]);

    const handleManualSync = async () => {
        if (loading || isSyncing) return;
        try {
            setIsSyncing(true);
            setError('');
            const data = await syncSubmissionsWithBackend(); 
            // FIX: Deduplicate by file name instead of file ID
            const uniqueData = Array.from(new Map(data.map(item => [item.name, item])).values());
            setFiles(uniqueData);
        } catch (err) {
            setError("Sync failed: " + err.message);
        } finally {
            setIsSyncing(false);
        }
    };

    const handleSettingChange = (key, newValue) => {
        setEditedSettings(prev => ({ ...prev, [key]: newValue }));
    };

    const handleSaveAllSettings = async () => {
        const keysToUpdate = Object.keys(editedSettings);
        if (keysToUpdate.length === 0) return;
        try {
            setIsSavingAll(true);
            await Promise.all(keysToUpdate.map(key => updateSystemSetting(key, editedSettings[key])));
            showToast('All settings updated successfully!', 'success');
            setEditedSettings({});
            loadSettings();
        } catch (err) {
            showToast("Failed to save some settings: " + err.message, 'error'); 
        } finally {
            setIsSavingAll(false);
        }
    };

    const requestSort = (key) => {
        let direction = 'asc';
        if (sortConfig.key === key && sortConfig.direction === 'asc') direction = 'desc';
        setSortConfig({ key, direction });
    };

    const handleAnalyzeClick = (file) => {
        setSelectedFileForAi(file);
        setAiResult('');
        setIsModalOpen(true);
    };

    const triggerAnalysis = async (modelName) => {
        setIsAnalyzing(true);
        setAiResult('');
        try {
            const data = await analyzeDocumentWithAI(selectedFileForAi.id, selectedFileForAi.name, modelName);
            setAiResult(data.analysis || data);
            if (currentView === 'reports') loadHistory();
        } catch (err) {
            setAiResult('Error: ' + err.message);
        } finally {
            setIsAnalyzing(false);
        }
    };

    const handleCopyReportText = (text) => {
        navigator.clipboard.writeText(text);
        showToast("Evaluation text copied to clipboard!", "success");
    };

    const startEditingReport = () => {
        setEditedReportText(selectedHistoryItem.evaluationResult);
        setIsEditingReport(true);
    };

    const handleSaveReportEdit = async () => {
        try {
            await updateEvaluationResult(selectedHistoryItem.id, editedReportText);
            const updatedItem = { ...selectedHistoryItem, evaluationResult: editedReportText };
            setSelectedHistoryItem(updatedItem);
            setHistoryLogs(prevLogs => prevLogs.map(log => 
                log.id === selectedHistoryItem.id ? updatedItem : log
            ));
            setIsEditingReport(false);
            showToast("Evaluation updated successfully!", "success");
        } catch (err) {
            showToast("Error updating report: " + err.message, "error");
        }
    };

    const handleSendReport = async () => {
        try {
            await sendEvaluationToStudent(selectedHistoryItem.id);
            const updatedItem = { ...selectedHistoryItem, isSent: true };
            setSelectedHistoryItem(updatedItem);
            setHistoryLogs(prevLogs => prevLogs.map(log => 
                log.id === updatedItem.id ? updatedItem : log
            ));
            showToast("Result sent to Student Dashboard!", "success");
        } catch (err) {
            showToast("Error sending report: " + err.message, "error");
        }
    };

    const closeHistoryModal = () => {
        setSelectedHistoryItem(null);
        setIsEditingReport(false);
    };

    const sortedFiles = [...files].sort((a, b) => {
        if (sortConfig.key === 'name') {
            return sortConfig.direction === 'asc' ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);
        }
        if (sortConfig.key === 'date') {
            return sortConfig.direction === 'asc'
                ? new Date(a.submittedAt) - new Date(b.submittedAt)
                : new Date(b.submittedAt) - new Date(a.submittedAt);
        }
        return 0;
    });

    const dirtyCount = Object.keys(editedSettings).length;

    return (
        <div className="td-root">
            
            <div className={`td-toast ${toast.show ? 'show' : ''} ${toast.type}`}>
                {toast.type === 'success' ? '✅' : '❌'} {toast.message}
            </div>

            <aside className="td-sidebar">
                <div className="td-sidebar-brand">IEEE Docs</div>
                <div className="td-sidebar-role">Evaluator</div>
                <nav>
                    <div className={currentView === 'dashboard' ? 'td-nav-item-active' : 'td-nav-item'} onClick={() => setCurrentView('dashboard')}>Dashboard</div>
                    <div className={currentView === 'reports' ? 'td-nav-item-active' : 'td-nav-item'} onClick={() => setCurrentView('reports')}>AI Reports</div>
                    <div className={currentView === 'settings' ? 'td-nav-item-active' : 'td-nav-item'} onClick={() => setCurrentView('settings')}>System Settings</div>
                </nav>
                <button onClick={() => supabase.auth.signOut()} className="td-sign-out-btn">Sign Out</button>
            </aside>

            <main className="td-main">
                {error && <div style={{ color: 'red', padding: '10px', background: '#fff1f1', borderRadius: '8px' }}>{error}</div>}

                {currentView === 'dashboard' && (
                    <>
                        <header className="td-header">
                            <div>
                                <h1 className="td-header-title">Live Submissions Dashboard</h1>
                                <p className="td-subtitle">Sourced directly from the Google Sheets tracker</p>
                            </div>
                            <button onClick={handleManualSync} className="td-sync-btn" disabled={isSyncing}>
                                {isSyncing ? "Fetching Updates..." : "Sync Latest Submissions"}
                            </button>
                        </header>

                        <div className="td-card">
                            <div className="td-table-container">
                                <table className="td-table">
                                    <thead>
                                        <tr>
                                            <th className="td-th" onClick={() => requestSort('name')}>Submission Identity</th>
                                            <th className="td-th">Type</th>
                                            <th className="td-th" onClick={() => requestSort('date')}>Date Submitted</th>
                                            <th className="td-th">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {loading || isSyncing ? (
                                            [...Array(5)].map((_, i) => (
                                                <tr key={i} className="loading-row">
                                                    <td colSpan="4" className="td-td" style={{ height: '50px' }}></td>
                                                </tr>
                                            ))
                                        ) : sortedFiles.length === 0 ? (
                                            <tr><td colSpan="4" style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>No submissions found in the tracker.</td></tr>
                                        ) : sortedFiles.map((file, index) => {
                                            const displayType = getDisplayType(file.mimeType);
                                            return (
                                                <tr key={`${file.id}-${index}`}>
                                                    <td className="td-td">
                                                        <div style={{ display: 'flex', alignItems: 'center' }}>
                                                            <FileIcon />
                                                            <a href={file.webViewLink} target="_blank" rel="noreferrer" style={{ textDecoration: 'none', color: '#1e293b', fontWeight: '500' }}>{file.name}</a>
                                                        </div>
                                                    </td>
                                                    <td className="td-td"><span className="td-badge">{displayType}</span></td>
                                                    <td className="td-td">{file.submittedAt}</td>
                                                    <td className="td-td">
                                                        <button onClick={() => handleAnalyzeClick(file)} className="td-analyze-btn">Run AI Analysis</button>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </>
                )}

                {currentView === 'reports' && (
                    <>
                        <header className="td-header">
                            <div>
                                <h1 className="td-header-title">AI Evaluation History</h1>
                                <p className="td-subtitle">Saved results from Supabase Database</p>
                            </div>
                            <button onClick={loadHistory} className="td-sync-btn" style={{ backgroundColor: '#2563eb' }}>Refresh History</button>
                        </header>

                        <div className="td-card">
                            <div className="td-table-container">
                                <table className="td-table">
                                    <thead>
                                        <tr>
                                            <th className="td-th">Date Analyzed</th>
                                            <th className="td-th">Document Name</th>
                                            <th className="td-th">Model</th>
                                            <th className="td-th">Action</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {loadingHistory ? (
                                            [...Array(5)].map((_, i) => (
                                                <tr key={i} className="loading-row">
                                                    <td colSpan="4" className="td-td" style={{ height: '50px' }}></td>
                                                </tr>
                                            ))
                                        ) : historyLogs.length === 0 ? (
                                            <tr><td colSpan="4" style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>No evaluations saved.</td></tr>
                                        ) : historyLogs.map(log => (
                                            <tr key={log.id}>
                                                <td className="td-td">{new Date(log.evaluatedAt).toLocaleString()}</td>
                                                <td className="td-td"><span style={{ fontWeight: '500' }}>{log.fileName}</span></td>
                                                <td className="td-td"><span className="td-badge">{log.modelUsed}</span></td>
                                                <td className="td-td">
                                                    <button onClick={() => setSelectedHistoryItem(log)} className="td-analyze-btn">View Full Report</button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </>
                )}

                {currentView === 'settings' && (
                    <>
                        <header className="td-header">
                            <div>
                                <h1 className="td-header-title">System Settings</h1>
                                <p className="td-subtitle">Manage API keys, Google Sheet mappings, and column configuration</p>
                            </div>
                            <div style={{ display: 'flex', gap: '10px' }}>
                                <button onClick={() => { setEditedSettings({}); loadSettings(); }} className="td-refresh-btn">Discard Changes</button>
                                <button
                                    onClick={handleSaveAllSettings}
                                    className="td-sync-btn" 
                                    style={{ opacity: dirtyCount === 0 ? 0.5 : 1, cursor: dirtyCount === 0 ? 'not-allowed' : 'pointer' }}
                                    disabled={isSavingAll || dirtyCount === 0}
                                >
                                    {isSavingAll ? 'Saving...' : `Save All Changes${dirtyCount > 0 ? ` (${dirtyCount})` : ''}`}
                                </button>
                            </div>
                        </header>

                        {loadingSettings ? (
                            <div className="td-card" style={{ padding: '24px', color: '#64748b' }}>Loading configuration from database...</div>
                        ) : (
                            CATEGORY_ORDER.map(categoryKey => (
                                <SettingsSection
                                    key={categoryKey}
                                    categoryKey={categoryKey}
                                    settings={settings}
                                    editedSettings={editedSettings}
                                    onSettingChange={handleSettingChange}
                                />
                            ))
                        )}
                    </>
                )}

                {isModalOpen && (
                    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
                        <div style={{ backgroundColor: 'white', padding: '30px', borderRadius: '12px', width: '700px', display: 'flex', flexDirection: 'column', maxHeight: '90vh' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                <h2 style={{ marginTop: 0, color: '#1e293b', flexShrink: 0 }}>Analyze: {selectedFileForAi?.name}</h2>
                                <button onClick={() => setIsModalOpen(false)} style={{ background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer', color: '#94a3b8', lineHeight: '1' }}>&times;</button>
                            </div>

                            {!isAnalyzing && !aiResult && (
                                <div>
                                    <p style={{ color: '#64748b' }}>Select an AI model to evaluate this document.</p>
                                    <div style={{ display: 'flex', gap: '10px', marginTop: '15px' }}>
                                        <button onClick={() => triggerAnalysis('openai')} className="td-sync-btn">Use OpenAI (GPT)</button>
                                        <button onClick={() => triggerAnalysis('openrouter')} className="td-sync-btn" style={{ backgroundColor: '#19526d' }}>Use Google (GEMINI)</button>
                                    </div>
                                </div>
                            )}

                            {isAnalyzing && <div style={{ padding: '20px', textAlign: 'center', color: '#2563eb', fontWeight: '500' }}>Extracting text and running analysis...</div>}

                            {aiResult && (
                                <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                                    <h3 style={{ color: '#1e293b', flexShrink: 0 }}>AI Evaluation Result:</h3>
                                    <div style={{ whiteSpace: 'pre-wrap', backgroundColor: '#f8fafc', padding: '20px', borderRadius: '8px', border: '1px solid #e2e8f0', color: '#334155', lineHeight: '1.6', maxHeight: '50vh', overflowY: 'auto' }}>
                                        {aiResult}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {selectedHistoryItem && (
                    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
                        <div style={{ backgroundColor: 'white', padding: '30px', borderRadius: '12px', width: '700px', display: 'flex', flexDirection: 'column', maxHeight: '90vh' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid #e2e8f0', paddingBottom: '15px', marginBottom: '20px', flexShrink: 0 }}>
                                <div>
                                    <h2 style={{ marginTop: 0, marginBottom: '5px', color: '#1e293b' }}>Saved Evaluation Report</h2>
                                    <p style={{ margin: 0, color: '#64748b', fontSize: '14px' }}>File: {selectedHistoryItem.fileName}</p>
                                </div>
                                <button 
                                    onClick={closeHistoryModal} 
                                    style={{ background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer', color: '#94a3b8', lineHeight: '1' }}
                                    onMouseOver={(e) => e.target.style.color = '#ef4444'}
                                    onMouseOut={(e) => e.target.style.color = '#94a3b8'}
                                    title="Close"
                                >
                                    &times;
                                </button>
                            </div>

                            {isEditingReport ? (
                                <textarea 
                                    value={editedReportText}
                                    onChange={(e) => setEditedReportText(e.target.value)}
                                    style={{ width: '100%', minHeight: '300px', padding: '15px', borderRadius: '8px', border: '1px solid #2563eb', fontFamily: 'inherit', fontSize: '14px', lineHeight: '1.6', resize: 'vertical', outline: 'none', flex: 1 }}
                                />
                            ) : (
                                <div style={{ whiteSpace: 'pre-wrap', backgroundColor: '#f8fafc', padding: '20px', borderRadius: '8px', border: '1px solid #e2e8f0', color: '#334155', lineHeight: '1.6', overflowY: 'auto', flex: 1 }}>
                                    {selectedHistoryItem.evaluationResult}
                                </div>
                            )}

                            <div style={{ marginTop: '24px', display: 'flex', justifyContent: 'flex-end', gap: '10px', flexShrink: 0 }}>
                                {isEditingReport ? (
                                    <>
                                        <button onClick={handleSaveReportEdit} style={{ backgroundColor: '#059669', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '8px', cursor: 'pointer', fontWeight: '500' }}>Save Changes</button>
                                        <button onClick={() => setIsEditingReport(false)} style={{ backgroundColor: '#f1f5f9', color: '#1e293b', border: '1px solid #e2e8f0', padding: '10px 20px', borderRadius: '8px', cursor: 'pointer', fontWeight: '500' }}>Cancel</button>
                                    </>
                                ) : (
                                    <>
                                        <button onClick={startEditingReport} style={{ backgroundColor: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', padding: '10px 20px', borderRadius: '8px', cursor: 'pointer', fontWeight: '500' }}>Edit</button>
                                        <button onClick={() => handleCopyReportText(selectedHistoryItem.evaluationResult)} style={{ backgroundColor: '#f8fafc', color: '#475569', border: '1px solid #e2e8f0', padding: '10px 20px', borderRadius: '8px', cursor: 'pointer', fontWeight: '500' }}>Copy Text</button>
                                        <button 
                                            onClick={handleSendReport} 
                                            disabled={selectedHistoryItem.isSent}
                                            style={{ 
                                                backgroundColor: selectedHistoryItem.isSent ? '#f1f5f9' : '#2563eb', 
                                                color: selectedHistoryItem.isSent ? '#94a3b8' : 'white', 
                                                border: selectedHistoryItem.isSent ? '1px solid #e2e8f0' : 'none', 
                                                padding: '10px 20px', borderRadius: '8px', cursor: selectedHistoryItem.isSent ? 'not-allowed' : 'pointer', fontWeight: '500' 
                                            }}
                                        >
                                            {selectedHistoryItem.isSent ? 'Sent to Student' : 'Send Result'}
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
};

export default TeacherDashboard;