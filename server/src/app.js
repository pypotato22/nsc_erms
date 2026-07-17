import path from 'node:path';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import { config } from './config.js';
import { pool } from './db/pool.js';
import { errorHandler, notFound } from './middleware/errors.js';
import { healthRouter } from './routes/health.js';
import { setupRouter } from './routes/setup.js';
import { authRouter } from './routes/auth.js';
import { lookupsRouter } from './routes/lookups.js';
import { departmentsRouter } from './routes/departments.js';
import { positionsRouter } from './routes/positions.js';
import { employeesRouter } from './routes/employees.js';
import { usersRouter } from './routes/users.js';
import { documentsRouter, documentItemRouter } from './routes/documents.js';
import { scanInboxRouter } from './routes/scanInbox.js';
import { backupsRouter } from './routes/backups.js';
import { auditRouter } from './routes/audit.js';

const PgSession = connectPgSimple(session);

export function createApp() {
  const app = express();

  app.set('trust proxy', 1);

  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
    }),
  );

  app.use(
    cors({
      origin: true,
      credentials: true,
    }),
  );

  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: false }));
  app.use(cookieParser());

  const useSecureCookie =
    Boolean(config.tlsCertPath) ||
    (config.env === 'production' && !config.allowHttpDev);

  app.use(
    session({
      store: new PgSession({
        pool,
        tableName: 'session',
        createTableIfMissing: false,
      }),
      name: 'nsc_erms.sid',
      secret: config.sessionSecret,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        secure: useSecureCookie,
        sameSite: 'lax',
        maxAge: 1000 * 60 * 60 * 8,
      },
    }),
  );

  app.use('/api/v1/health', healthRouter);
  app.use('/api/v1/setup', setupRouter);
  app.use('/api/v1/auth', authRouter);
  app.use('/api/v1/lookups', lookupsRouter);
  app.use('/api/v1/departments', departmentsRouter);
  app.use('/api/v1/positions', positionsRouter);
  app.use('/api/v1/employees/:employeeId/documents', documentsRouter);
  app.use('/api/v1/employees', employeesRouter);
  app.use('/api/v1/documents', documentItemRouter);
  app.use('/api/v1/scan-inbox', scanInboxRouter);
  app.use('/api/v1/backups', backupsRouter);
  app.use('/api/v1/audit-logs', auditRouter);
  app.use('/api/v1/users', usersRouter);

  // Prefer renderer/dist (Vite build); falls back to renderer/ when dist is missing
  app.use(express.static(config.clientDist, { index: false }));

  app.get(/^(?!\/api(?:\/|$)).*/, (req, res, next) => {
    res.sendFile(path.join(config.clientDist, 'index.html'), (err) => {
      if (err) next(err);
    });
  });

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
