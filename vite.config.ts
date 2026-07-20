import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, type Plugin} from 'vite';

const allowedWpsEndpoints = [
  /^\/oauth2\/token$/,
  /^\/v7\/sheets\/[^/]+\/worksheets$/,
  /^\/v7\/sheets\/[^/]+\/worksheets\/\d+\/range_data(?:\?.*)?$/,
];

function wpsDevProxy(): Plugin {
  return {
    name: 'wps-dev-proxy',
    configureServer(server) {
      server.middlewares.use('/api/wps-proxy', async (request, response) => {
        if (request.method !== 'POST') {
          response.statusCode = 405;
          response.end(JSON.stringify({ error: 'HTTP method is not allowed' }));
          return;
        }

        try {
          let rawBody = '';
          for await (const chunk of request) rawBody += chunk;
          const payload = JSON.parse(rawBody) as {
            endpoint?: string;
            method?: string;
            body?: Record<string, string>;
            headers?: Record<string, string>;
          };
          const endpoint = payload.endpoint || '';
          const method = (payload.method || 'GET').toUpperCase();
          if (!allowedWpsEndpoints.some(pattern => pattern.test(endpoint))) {
            response.statusCode = 400;
            response.end(JSON.stringify({ error: 'WPS endpoint is not allowed' }));
            return;
          }
          if (!['GET', 'POST'].includes(method)) {
            response.statusCode = 405;
            response.end(JSON.stringify({ error: 'HTTP method is not allowed' }));
            return;
          }

          const headers: Record<string, string> = {};
          if (payload.headers?.Authorization) {
            headers.Authorization = payload.headers.Authorization;
          }
          let body: BodyInit | undefined;
          if (method === 'POST') {
            headers['Content-Type'] = 'application/x-www-form-urlencoded';
            body = new URLSearchParams(payload.body || {});
          }

          const upstream = await fetch(`https://openapi.wps.cn${endpoint}`, {
            method,
            headers,
            body,
          });
          response.statusCode = upstream.status;
          response.setHeader(
            'Content-Type',
            upstream.headers.get('Content-Type') || 'application/json',
          );
          response.end(await upstream.text());
        } catch (error) {
          response.statusCode = 500;
          response.setHeader('Content-Type', 'application/json');
          response.end(
            JSON.stringify({ error: 'WPS proxy request failed', message: String(error) }),
          );
        }
      });
    },
  };
}

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss(), wpsDevProxy()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
