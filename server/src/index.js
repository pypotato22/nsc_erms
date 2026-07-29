import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import { createApp } from './app.js';
import { config, validateProductionConfig } from './config.js';
import { checkConnection } from './db/pool.js';
import { pruneExpiredPdsPdfCache } from './services/pdsPdfCache.js';

async function main() {
  validateProductionConfig(config);

  const ok = await checkConnection();
  if (!ok) {
    throw new Error('Database connection failed');
  }

  const app = createApp();
  const useTls = config.tlsCertPath && config.tlsKeyPath;

  let server;
  if (useTls) {
    const options = {
      cert: fs.readFileSync(config.tlsCertPath),
      key: fs.readFileSync(config.tlsKeyPath),
    };
    server = https.createServer(options, app);
  } else if (config.allowHttpDev) {
    console.warn(
      '[warn] Running without TLS (ALLOW_HTTP_DEV). Use HTTPS on LAN for production.',
    );
    server = http.createServer(app);
  } else {
    throw new Error(
      'TLS_CERT_PATH and TLS_KEY_PATH are required when ALLOW_HTTP_DEV is not true',
    );
  }

  server.listen(config.port, () => {
    const scheme = useTls ? 'https' : 'http';
    console.log(`NSC-ERMS API listening on ${scheme}://localhost:${config.port}`);
    console.log(`Health: ${scheme}://localhost:${config.port}/api/v1/health`);

    pruneExpiredPdsPdfCache()
      .then((n) => { if (n) console.log(`Pruned ${n} expired PDS-PDF cache entries`); })
      .catch(() => {});
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
