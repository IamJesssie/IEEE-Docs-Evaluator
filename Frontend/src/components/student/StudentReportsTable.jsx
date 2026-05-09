import { extractSubmissionMeta, formatDate } from '../../utils/dashboardUtils';
import { formatDateTime } from '../../utils/dashboardUtils';

function StudentReportsTable({ reports, loading, viewedIds = [], onOpen }) {
  if (loading) return <p className="muted">Loading your evaluations...</p>;

  if (!reports.length) {
    return (
      <div className="student-empty">
        <h3 className="student-empty__title">No evaluations yet</h3>
        <p className="student-empty__text">
          Your professor hasn't sent evaluations for this filter yet. Check back later or try a different document type.
        </p>
      </div>
    );
  }

  return (
    <table className="app-table">
      <thead>
        <tr>
          <th>Document Name</th>
          <th>Type</th>
          <th>Date Evaluated</th>
          <th>Status</th>
          <th>Action</th>
        </tr>
      </thead>
      <tbody>
        {reports.map((report) => {
          const isNew   = !viewedIds.includes(report.id);
          const docType = extractSubmissionMeta(report.fileName).documentType;
          
          // Fallback to constructing a Google Drive link if webViewLink isn't explicitly provided
          const documentUrl = report.webViewLink || `https://drive.google.com/file/d/${report.fileId}/view`;

          return (
            <tr key={report.id} className={isNew ? 'student-row--new' : ''}>
              <td className="strong">
                {/* ── Make the filename clickable ── */}
                <a 
                  href={documentUrl} 
                  target="_blank" 
                  rel="noreferrer" 
                  className="link-reset"
                  style={{ color: 'inherit', textDecoration: 'none' }} // Ensure it inherits the strong font but doesn't look like an ugly default link until hovered
                >
                  {report.fileName}
                </a>
              </td>
              <td>
                {docType && <span className="student-doc-badge">{docType}</span>}
              </td>
              <td>{formatDateTime(report.evaluatedAt)}</td>
              <td>
                <span className={`student-status ${isNew ? 'student-status--new' : 'student-status--viewed'}`}>
                  {isNew ? 'New' : 'Viewed'}
                </span>
              </td>
              <td>
                <button className="btn btn--soft" onClick={() => onOpen(report)}>
                  View Feedback
                </button>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export default StudentReportsTable;