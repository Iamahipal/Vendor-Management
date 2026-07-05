import { spawn, ChildProcess } from 'child_process';
import net from 'net';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Seed identities (src/seed.ts) used throughout the tests
export const ADMIN = 'u-pfl-admin';        // Internal — Sarah Jenkins
export const RELEASE_SPOC = 'u-release-spoc'; // Release SPOC — Ravi Menon
export const PIXEL_VENDOR = 'u-pixel-vendor'; // Vendor v-pixel — Alex Rivero
export const PRESS_VENDOR = 'u-press-vendor'; // Vendor v-press — Marcus Vance
export const MODAL_VENDOR = 'u-modal-vendor'; // Vendor v-modal — Chloe Wu

export interface TestServer {
  baseUrl: string;
  dataDir: string;
  stop: () => Promise<void>;
  api: (userId: string | null, method: string, route: string, body?: unknown) => Promise<{ status: number; json: any }>;
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const address = srv.address();
      if (address && typeof address === 'object') {
        const port = address.port;
        srv.close(() => resolve(port));
      } else {
        srv.close(() => reject(new Error('Could not determine free port')));
      }
    });
    srv.on('error', reject);
  });
}

// Boot the real server (tsx, production mode so Vite never loads) in an
// isolated temp directory: data.json starts from the seed, the automation
// scheduler is off, and no AI provider keys leak in from the host env.
export async function startServer(): Promise<TestServer> {
  const port = await freePort();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vm-test-'));
  const tsxCli = path.join(REPO_ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs');

  const child: ChildProcess = spawn(
    process.execPath,
    [tsxCli, path.join(REPO_ROOT, 'server.ts')],
    {
      cwd: dataDir,
      env: {
        ...process.env,
        NODE_ENV: 'production',
        PORT: String(port),
        DISABLE_AUTOMATION_CRON: 'true',
        NVIDIA_API_KEY: '',
        OPENROUTER_API_KEY: '',
        GEMINI_API_KEY: ''
      },
      stdio: ['ignore', 'pipe', 'pipe']
    }
  );

  let output = '';
  child.stdout?.on('data', d => { output += d.toString(); });
  child.stderr?.on('data', d => { output += d.toString(); });

  const baseUrl = `http://127.0.0.1:${port}`;

  const api = async (userId: string | null, method: string, route: string, body?: unknown) => {
    const headers: Record<string, string> = {};
    if (userId) headers['x-simulated-user-id'] = userId;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const res = await fetch(baseUrl + route, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    let json: any = null;
    try {
      json = await res.json();
    } catch {
      // non-JSON response — callers assert on status in that case
    }
    return { status: res.status, json };
  };

  // Wait until the API answers (or the process dies)
  const deadline = Date.now() + 15_000;
  for (;;) {
    if (child.exitCode !== null) {
      throw new Error(`Server exited before becoming ready:\n${output}`);
    }
    try {
      const { status } = await api(ADMIN, 'GET', '/api/db');
      if (status === 200) break;
    } catch {
      // not listening yet
    }
    if (Date.now() > deadline) {
      child.kill('SIGKILL');
      throw new Error(`Server did not become ready in 15s:\n${output}`);
    }
    await new Promise(r => setTimeout(r, 100));
  }

  const stop = () =>
    new Promise<void>(resolve => {
      if (child.exitCode !== null) {
        fs.rmSync(dataDir, { recursive: true, force: true });
        return resolve();
      }
      child.once('exit', () => {
        fs.rmSync(dataDir, { recursive: true, force: true });
        resolve();
      });
      child.kill('SIGTERM');
      // Escalate if graceful shutdown stalls
      setTimeout(() => child.kill('SIGKILL'), 3_000).unref();
    });

  return { baseUrl, dataDir, stop, api };
}

// ISO date N days from now, YYYY-MM-DD (task creation requires future dates)
export function daysFromNow(days: number): string {
  const d = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}
