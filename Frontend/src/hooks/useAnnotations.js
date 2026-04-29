import { useCallback, useEffect, useState } from 'react';
import { getAnnotations, createAnnotation, deleteAnnotation } from '../api';

export function useAnnotations(historyId) {
    const [annotations, setAnnotations] = useState([]);
    const [loading, setLoading]         = useState(false);

    const load = useCallback(async () => {
        if (!historyId) { setAnnotations([]); return; }
        setLoading(true);
        try {
            const data = await getAnnotations(historyId);
            setAnnotations(Array.isArray(data) ? data : []);
        } catch (err) {
            console.error('Failed to load annotations:', err);
            setAnnotations([]);
        } finally {
            setLoading(false);
        }
    }, [historyId]);

    useEffect(() => { load(); }, [load]);

    const addAnnotation = useCallback(async (selectedText, comment, startOffset, endOffset) => {
        const saved = await createAnnotation(historyId, selectedText, comment, startOffset, endOffset);
        setAnnotations((prev) => [...prev, saved].sort((a, b) => a.startOffset - b.startOffset));
        return saved;
    }, [historyId]);

    const removeAnnotation = useCallback(async (annotationId) => {
        await deleteAnnotation(annotationId);
        setAnnotations((prev) => prev.filter((a) => a.id !== annotationId));
    }, []);

    return { annotations, loading, addAnnotation, removeAnnotation, reload: load };
}