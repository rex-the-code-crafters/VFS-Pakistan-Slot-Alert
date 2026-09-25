// Shared utilities for VFS Alert PK website
const WORKER_URL = 'https://vfs-alert-pk.YOUR_SUBDOMAIN.workers.dev';

async function fetchRoutes() {
  try {
    const res = await fetch(`${WORKER_URL}/api/routes`);
    return res.ok ? res.json() : [];
  } catch {
    return [];
  }
}

async function fetchStatus() {
  try {
    const res = await fetch(`${WORKER_URL}/api/status`);
    return res.ok ? res.json() : {};
  } catch {
    return {};
  }
}
