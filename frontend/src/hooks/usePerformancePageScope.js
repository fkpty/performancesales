import { useEffect } from 'react';
import usePerformanceStore from '../store/performanceStore';

export default function usePerformancePageScope(scope, loader = 'dashboard') {
  const setReportScope = usePerformanceStore((state) => state.setReportScope);
  const loadDashboard = usePerformanceStore((state) => state.loadDashboard);
  const loadRows = usePerformanceStore((state) => state.loadRows);
  const loadUploads = usePerformanceStore((state) => state.loadUploads);
  const loadFilterOptions = usePerformanceStore((state) => state.loadFilterOptions);

  useEffect(() => {
    setReportScope(scope);

    if (loader === 'rows') {
      loadRows();
      loadFilterOptions();
      return;
    }

    if (loader === 'uploads') {
      loadUploads();
      loadFilterOptions();
      return;
    }

    loadDashboard();
  }, [loadDashboard, loadFilterOptions, loadRows, loadUploads, loader, scope, setReportScope]);
}