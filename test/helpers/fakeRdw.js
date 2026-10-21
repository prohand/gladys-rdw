// -----------------------------------------------------------------------------
// A fake opendata.rdw.nl: a `fetch` that answers the vehicle dataset from an
// in-memory register, so no test touches the network.
// -----------------------------------------------------------------------------

/**
 * A register row as the portal returns it, with sensible values; `fields`
 * overrides or adds any column.
 */
export function registerRow(kenteken, fields = {}) {
  return {
    kenteken,
    voertuigsoort: 'Personenauto',
    merk: 'VOLKSWAGEN',
    handelsbenaming: 'GOLF',
    eerste_kleur: 'GRIJS',
    datum_eerste_toelating: '20190315',
    vervaldatum_apk: '20270315',
    wam_verzekerd: 'Ja',
    openstaande_terugroepactie_indicator: 'Nee',
    export_indicator: 'Nee',
    tellerstandoordeel: 'Logisch',
    ...fields,
  };
}

/**
 * @param {Record<string, object>} [rows] plate -> register row
 * @returns {{ fetch: typeof fetch, rows: Record<string, object>, requests: URL[],
 *   headers: Record<string, string>[], fail: (status?: number) => void, recover: () => void }}
 */
export function createFakeRdw(rows = {}) {
  const fake = {
    // A copy: a test that edits the register never leaks into the next one.
    rows: { ...rows },
    requests: [],
    headers: [],
    failure: null,
    fail(status = 0) {
      fake.failure = status;
    },
    recover() {
      fake.failure = null;
    },
    async fetch(url, { headers = {} } = {}) {
      const parsed = new URL(url);
      fake.requests.push(parsed);
      fake.headers.push(headers);
      if (fake.failure === 0) {
        throw new TypeError('fetch failed');
      }
      if (fake.failure !== null) {
        return { ok: false, status: fake.failure, json: async () => ({}) };
      }
      // Only the query this integration sends: kenteken in('A','B',...)
      const where = parsed.searchParams.get('$where') ?? '';
      const plates = [...where.matchAll(/'([A-Z0-9]+)'/g)].map((match) => match[1]);
      const body = plates.filter((plate) => fake.rows[plate]).map((plate) => fake.rows[plate]);
      return { ok: true, status: 200, json: async () => body };
    },
  };
  return fake;
}
