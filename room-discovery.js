// Bounded, single-flight room pages. A timed-out request cannot pin Refresh or
// overwrite a newer response if the underlying fetch settles after its deadline.
export function createRoomBrowser({ url, fetch: fetcher = globalThis.fetch,
  schedule = setTimeout, cancel = clearTimeout, timeoutMs = 6000, onChange = () => {} } = {}) {
  let rows = [], cursor = '', previous = [], nextCursor = '', loading = false, status = '', incomplete = false;
  let pageKey = 0, pageAtEnd = false, pending = null, cancelActive = null, sequence = 0;
  const snapshot = () => ({ rows, cursor, nextCursor, hasPrevious: previous.length > 0, loading, status, incomplete, pageKey, pageAtEnd });
  function load(target = cursor, history = previous, end = false, replace = false) {
    if (pending && !replace) return pending;
    const requestId = ++sequence;
    cancelActive?.();
    loading = true; status = 'Refreshing matches…'; onChange(snapshot());
    const controller = new AbortController(); let timer;
    const deadline = new Promise((_, reject) => {
      timer = schedule(() => { controller.abort(); reject(new Error('Match list timed out. Try Refresh.')); }, timeoutMs);
      cancelActive = () => { cancel(timer); controller.abort(); reject(new Error('Match list request replaced.')); };
    });
    const request = Promise.resolve().then(async () => {
      const endpoint = target ? `${url}?cursor=${encodeURIComponent(target)}` : url;
      const response = await fetcher(endpoint, { cache: 'no-store', signal: controller.signal });
      if (!response.ok) throw new Error('Live matches temporarily unavailable. Try Refresh.');
      const data = await response.json();
      if (!data || !Array.isArray(data.rooms) || data.rooms.length > 30) throw new Error('Match list could not be read. Try Refresh.');
      if (data.rooms.some(room => !room || typeof room.code !== 'string')) throw new Error('Match list could not be read. Try Refresh.');
      const next = typeof data.nextCursor === 'string' ? data.nextCursor : '';
      if (next.length > 256 || next && next === target) throw new Error('Match list could not be read. Try Refresh.');
      return { ...data, nextCursor: next };
    });
    pending = Promise.race([request, deadline]).then(data => {
      if (requestId !== sequence) return;
      if (cursor !== target || history !== previous) { pageKey++; pageAtEnd = end; }
      const oldRows = cursor === target ? rows : [];
      cursor = target; previous = [...history]; rows = data.rooms; nextCursor = data.nextCursor; incomplete = !!data.incomplete;
      if (incomplete) {
        const listed = new Set(rows.map(room => room.code));
        rows = [...rows, ...oldRows.filter(room => !listed.has(room.code)).map(room => ({ ...room, discoveryStale: true }))].slice(0, 30);
      }
      status = incomplete ? 'Some matches could not be checked. Last-seen matches may have changed. Try Refresh.' : '';
    }).catch(error => {
      if (requestId !== sequence) return;
      rows = rows.map(room => ({ ...room, discoveryStale: true }));
      status = error?.message || 'Live matches temporarily unavailable. Try Refresh.';
      incomplete = true;
    }).finally(() => { cancel(timer); if (requestId !== sequence) return; loading = false; pending = null; cancelActive = null; onChange(snapshot()); });
    return pending;
  }
  return { snapshot,
    refresh({ reset = false } = {}) { return reset ? load('', [], false, true) : load(); },
    next() { return nextCursor ? load(nextCursor, [...previous, cursor], false) : Promise.resolve(); },
    previous() { return previous.length ? load(previous.at(-1), previous.slice(0, -1), true) : Promise.resolve(); },
  };
}
