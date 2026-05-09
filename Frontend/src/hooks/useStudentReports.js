import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabaseClient';
import { fetchClassRoster, fetchStudentReports } from '../services/dashboardService';
import { extractSubmissionMeta } from '../utils/dashboardUtils';
import { getViewedReportIds, markReportAsViewed } from '../api';

const DOC_TYPES = ['SRS', 'SDD', 'SPMP', 'STD'];

export function useStudentReports(groupCode) {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [teamMembers, setTeamMembers] = useState([]);
  const [selectedDocType, setSelectedDocType] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [viewedIds, setViewedIds] = useState([]);

  // ── Load reports ──────────────────────────────────────────────────────────

  const loadReports = useCallback(async () => {
    try {
      setLoading(true);
      const data = await fetchStudentReports(groupCode);
      setReports(data);
    } catch (error) {
      console.error('Failed to fetch reports', error);
    } finally {
      setLoading(false);
    }
  }, [groupCode]);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  // ── Load viewed IDs from Supabase ─────────────────────────────────────────

  const loadViewedIds = useCallback(async () => {
    if (!groupCode) return;
    try {
      const ids = await getViewedReportIds(groupCode);
      setViewedIds(Array.isArray(ids) ? ids : []);
    } catch (err) {
      console.error('Failed to load viewed report IDs:', err);
    }
  }, [groupCode]);

  useEffect(() => {
    loadViewedIds();
  }, [loadViewedIds]);

  // ── Team members ──────────────────────────────────────────────────────────

  useEffect(() => {
    fetchClassRoster()
      .then((roster) => {
        const members = roster.filter(
          (s) => s.groupCode?.toUpperCase() === groupCode?.toUpperCase(),
        );
        setTeamMembers(members);
      })
      .catch(() => {});
  }, [groupCode]);

  // ── Real-time subscription ────────────────────────────────────────────────

  useEffect(() => {
    if (!groupCode) return;

    const channel = supabase
      .channel(`student-reports-${groupCode}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'evaluation_history',
          filter: 'is_sent=eq.true',
        },
        (payload) => {
          const fileName = payload.new?.file_name || '';
          if (fileName.toLowerCase().includes(groupCode.toLowerCase())) {
            loadReports();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [groupCode, loadReports]);

  // ── Mark viewed ───────────────────────────────────────────────────────────

  const markViewed = useCallback(async (id) => {
    if (viewedIds.includes(id)) return;
    setViewedIds((prev) => [...prev, id]);
    try {
      await markReportAsViewed(groupCode, id);
    } catch (err) {
      console.error('Failed to persist viewed state:', err);
      // Revert optimistic update on failure
      setViewedIds((prev) => prev.filter((v) => v !== id));
    }
  }, [groupCode, viewedIds]);

  // ── Filtering ─────────────────────────────────────────────────────────────

  const filteredReports = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return reports.filter((r) => {
      if (selectedDocType) {
        const docType = extractSubmissionMeta(r.fileName).documentType;
        if (docType !== selectedDocType) return false;
      }
      if (query) {
        const searchable = [r.fileName, r.evaluatedAt].filter(Boolean).join(' ').toLowerCase();
        if (!searchable.includes(query)) return false;
      }
      return true;
    });
  }, [reports, selectedDocType, searchQuery]);

  const docStats = useMemo(() =>
    DOC_TYPES.map((type) => ({
      type,
      count: reports.filter(
        (r) => extractSubmissionMeta(r.fileName).documentType === type,
      ).length,
    })),
  [reports]);

  return {
    reports: filteredReports,
    allReportCount: reports.length,
    loading,
    teamMembers,
    docStats,
    docTypes: DOC_TYPES,
    selectedDocType,
    setSelectedDocType,
    searchQuery,
    setSearchQuery,
    viewedIds,
    markViewed,
    refresh: loadReports,
  };
}