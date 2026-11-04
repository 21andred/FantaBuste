import { getStore } from '@netlify/blobs';
import { createApi } from '../../lib/server.mjs';
import league from '../../config/league.mjs';

function blobStore() {
  const s = getStore({ name: 'fantabuste', consistency: 'strong' });
  return {
    async read() {
      const r = await s.getWithMetadata('state', { type: 'json', consistency: 'strong' });
      return r ? { data: r.data, etag: r.etag } : null;
    },
    async write(data, etag) {
      const opts = etag ? { onlyIfMatch: etag } : { onlyIfNew: true };
      const res = await s.setJSON('state', data, opts);
      return res.modified;
    },
    async archive(data) {
      await s.setJSON(`archive/${new Date().toISOString()}`, data);
    },
  };
}

export default async (req) => {
  const api = createApi({ store: blobStore(), config: league, resetKey: process.env.RESET_KEY || '' });
  return api.handle(req);
};

export const config = { path: '/api/*' };
