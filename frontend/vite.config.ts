import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { keccak256 } from 'ethers';
import http from 'node:http';
import https from 'node:https';
import type { IncomingMessage, ServerResponse } from 'node:http';

const MAX_VALIDATION_BYTES = 50 * 1024 * 1024;
const MAX_REDIRECTS = 5;

const readRequestBody = (req: IncomingMessage) =>
  new Promise<string>((resolve, reject) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 10_000) {
        reject(new Error('Request body is too large'));
        req.destroy();
      }
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });

const sendJson = (res: ServerResponse, statusCode: number, payload: unknown) => {
  res.statusCode = statusCode;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(payload));
};

const fetchFileBytes = (uri: string, redirectsRemaining = MAX_REDIRECTS): Promise<Uint8Array> =>
  new Promise((resolve, reject) => {
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(uri);
    } catch {
      reject(new Error('URI must be a valid URL'));
      return;
    }

    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      reject(new Error('URI must use http or https'));
      return;
    }

    const request = parsedUrl.protocol === 'https:' ? https.request : http.request;
    const req = request(
      parsedUrl,
      {
        method: 'GET',
        headers: {
          'user-agent': 'document-registry-validator/1.0',
          accept: '*/*'
        }
      },
      (response) => {
        const statusCode = response.statusCode ?? 0;

        if ([301, 302, 303, 307, 308].includes(statusCode)) {
          const location = response.headers.location;
          response.resume();

          if (!location) {
            reject(new Error('Redirect response did not include a Location header'));
            return;
          }

          if (redirectsRemaining <= 0) {
            reject(new Error('Too many redirects while fetching URI'));
            return;
          }

          resolve(fetchFileBytes(new URL(location, parsedUrl).toString(), redirectsRemaining - 1));
          return;
        }

        if (statusCode < 200 || statusCode >= 300) {
          response.resume();
          reject(new Error(`Failed to fetch URI: HTTP ${statusCode}`));
          return;
        }

        const chunks: Buffer[] = [];
        let byteLength = 0;

        response.on('data', (chunk: Buffer) => {
          byteLength += chunk.length;

          if (byteLength > MAX_VALIDATION_BYTES) {
            reject(new Error('File is larger than the 50 MB validation limit'));
            req.destroy();
            return;
          }

          chunks.push(chunk);
        });
        response.on('end', () => resolve(new Uint8Array(Buffer.concat(chunks))));
        response.on('error', reject);
      }
    );

    req.setTimeout(30_000, () => {
      req.destroy(new Error('Timed out while fetching URI'));
    });
    req.on('error', reject);
    req.end();
  });

const registerValidationMiddleware = (middlewares: { use: (path: string, handler: (req: IncomingMessage, res: ServerResponse) => void) => void }) => {
  middlewares.use('/api/validate-uri', async (req, res) => {
    if (req.method !== 'POST') {
      sendJson(res, 405, { error: 'Method not allowed' });
      return;
    }

    try {
      const body = JSON.parse(await readRequestBody(req)) as { uri?: string; expectedHash?: string };
      const uri = body.uri?.trim();
      const expectedHash = body.expectedHash?.trim().toLowerCase();

      if (!uri || !expectedHash) {
        sendJson(res, 400, { error: 'URI and expectedHash are required' });
        return;
      }

      const bytes = await fetchFileBytes(uri);
      const hash = keccak256(bytes);

      sendJson(res, 200, {
        ok: hash.toLowerCase() === expectedHash,
        hash,
        byteLength: bytes.byteLength
      });
    } catch (err) {
      sendJson(res, 400, { error: err instanceof Error ? err.message : 'Validation failed' });
    }
  });
};

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'document-registry-uri-validator',
      configureServer(server) {
        registerValidationMiddleware(server.middlewares);
      },
      configurePreviewServer(server) {
        registerValidationMiddleware(server.middlewares);
      }
    }
  ],
  server: {
    port: 3000,
    open: true
  }
});
