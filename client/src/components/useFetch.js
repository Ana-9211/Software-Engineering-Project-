import { useCallback, useEffect, useRef, useState } from 'react';

// Small data-fetching hook: { data, error, loading, reload }. The request is repeated when deps change.
export function useFetch(fn, deps = []) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let active = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    Promise.resolve()
      .then(() => fnRef.current())
      .then((data) => active && setState({ data, error: null, loading: false }))
      .catch((error) => active && setState({ data: null, error, loading: false }));
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { ...state, reload };
}

// Date-range report (S-23, S-29): loading flag, a retryable server error, a separate date message,
// and a request counter so a slow earlier response never replaces a newer one.
export function useReport(load, initialRange) {
  const [range, setRange] = useState(initialRange);
  const [report, setReport] = useState({ data: null, error: null, loading: false, retryable: false });
  const latest = useRef(0);

  const run = useCallback(
    async (e) => {
      if (e && e.preventDefault) e.preventDefault();
      if (range.from > range.to) {
        latest.current += 1;
        setReport({ data: null, error: { message: 'The start date must not be after the end date.' }, loading: false, retryable: false });
        return;
      }
      const mine = (latest.current += 1);
      setReport((r) => ({ data: r.data, error: null, loading: true, retryable: false }));
      try {
        const data = await load(range.from, range.to);
        if (mine === latest.current) setReport({ data, error: null, loading: false, retryable: false });
      } catch (error) {
        if (mine === latest.current) setReport({ data: null, error, loading: false, retryable: true });
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [range.from, range.to]
  );

  useEffect(() => {
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { range, setRange, report, run };
}
