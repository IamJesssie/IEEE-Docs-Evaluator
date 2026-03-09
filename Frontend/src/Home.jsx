import { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';
import { getStudentReports } from './api';
import './Home.css';

function Home({ studentData }) {
    const [reports, setReports] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedReport, setSelectedReport] = useState(null);

    useEffect(() => {
        const fetchReports = async () => {
            try {
                // Fetch only reports that contain the student's group code
                const data = await getStudentReports(studentData.groupCode);
                setReports(data);
            } catch (error) {
                console.error("Failed to fetch reports", error);
            } finally {
                setLoading(false);
            }
        };
        fetchReports();
    }, [studentData.groupCode]);

    const handleLogout = async () => {
        await supabase.auth.signOut();
    };

    return (
        <div className="student-dash-root">
            <aside className="student-sidebar">
                <h2 style={{ margin: 0, fontSize: '20px', color: '#60a5fa' }}>Student Portal</h2>
                <p style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '40px' }}>IEEE Docs Evaluator</p>
                
                <div style={{ flex: 1 }}>
                    <div style={{ backgroundColor: '#0f172a', padding: '15px', borderRadius: '8px', marginBottom: '20px' }}>
                        <p style={{ margin: '0 0 5px 0', fontSize: '13px', color: '#94a3b8' }}>Logged in as</p>
                        <h4 style={{ margin: 0, color: 'white' }}>{studentData.studentName}</h4>
                        <p style={{ margin: '5px 0 0 0', fontSize: '12px', color: '#38bdf8' }}>Team: {studentData.groupCode}</p>
                        {/* These fields match the Java StudentTrackerRecord properties exactly */}
                        <p style={{ margin: '5px 0 0 0', fontSize: '12px', color: '#94a3b8' }}>Section: {studentData.section}</p>
                    </div>
                </div>

                <button onClick={handleLogout} style={{ padding: '10px', background: 'none', border: '1px solid #475569', color: '#cbd5e1', borderRadius: '8px', cursor: 'pointer' }}>
                    Sign Out
                </button>
            </aside>

            <main className="student-main">
                <div className="student-header">
                    <div>
                        <h1 style={{ margin: 0, color: '#0f172a', fontSize: '28px' }}>My Team Evaluations</h1>
                        <p style={{ margin: '5px 0 0 0', color: '#64748b' }}>View AI Analysis feedback sent by your professor.</p>
                    </div>
                </div>

                <div className="student-card">
                    {loading ? (
                        <p style={{ color: '#64748b' }}>Loading your evaluations...</p>
                    ) : reports.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
                            <span style={{ fontSize: '40px' }}>📄</span>
                            <p>No evaluations have been sent to your team yet.</p>
                        </div>
                    ) : (
                        <table className="student-table">
                            <thead>
                                <tr>
                                    <th>Document Name</th>
                                    <th>Date Evaluated</th>
                                    <th>Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {reports.map(report => (
                                    <tr key={report.id}>
                                        <td style={{ fontWeight: '500' }}>{report.fileName}</td>
                                        <td>{new Date(report.evaluatedAt).toLocaleDateString()}</td>
                                        <td>
                                            <button 
                                                onClick={() => setSelectedReport(report)}
                                                style={{ backgroundColor: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: '500' }}
                                            >
                                                🔍 View Feedback
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>

                {/* MODAL: View Report Full Text */}
                {selectedReport && (
                    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
                        <div style={{ backgroundColor: 'white', padding: '30px', borderRadius: '12px', width: '700px', display: 'flex', flexDirection: 'column', maxHeight: '90vh' }}>
                            
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid #e2e8f0', paddingBottom: '15px', marginBottom: '20px' }}>
                                <div>
                                    <h2 style={{ marginTop: 0, marginBottom: '5px', color: '#1e293b' }}>Professor's Evaluation</h2>
                                    <p style={{ margin: 0, color: '#64748b', fontSize: '14px' }}>File: {selectedReport.fileName}</p>
                                </div>
                                <button 
                                    onClick={() => setSelectedReport(null)} 
                                    style={{ background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer', color: '#94a3b8' }}
                                >
                                    &times;
                                </button>
                            </div>

                            <div style={{ whiteSpace: 'pre-wrap', backgroundColor: '#f8fafc', padding: '20px', borderRadius: '8px', border: '1px solid #e2e8f0', color: '#334155', lineHeight: '1.6', overflowY: 'auto', flex: 1 }}>
                                {selectedReport.evaluationResult}
                            </div>
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}

export default Home;