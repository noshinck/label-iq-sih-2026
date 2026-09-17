(function () {
  const prefix = 'labeliq.inspection.';

  function key(id) {
    return `${prefix}${id}`;
  }

  function inspectionId(detail) {
    return detail && detail.inspection && detail.inspection.id;
  }

  function store(detail) {
    const id = inspectionId(detail);
    if (!id || !window.localStorage) return null;
    try {
      window.localStorage.setItem(key(id), JSON.stringify(detail));
      return id;
    } catch (error) {
      return null;
    }
  }

  function read(id) {
    if (!id || !window.localStorage) return null;
    try {
      const raw = window.localStorage.getItem(key(id));
      return raw ? JSON.parse(raw) : null;
    } catch (error) {
      return null;
    }
  }

  async function hydrate(detailOrId) {
    const detail = typeof detailOrId === 'string' ? read(detailOrId) : detailOrId;
    const id = inspectionId(detail);
    if (!id) return false;
    store(detail);

    try {
      const response = await fetch('/api/inspection-cache', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },
        body: JSON.stringify({ detail })
      });
      return response.ok;
    } catch (error) {
      return false;
    }
  }

  async function openJobResult(job) {
    if (job && job.detail) await hydrate(job.detail);
    window.location.href = job.result_url;
  }

  window.LabelIQInspectionCache = {
    store,
    read,
    hydrate,
    openJobResult
  };
})();
