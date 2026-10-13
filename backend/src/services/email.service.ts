import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import type { Anomaly } from '../models/anomaly.model.js';

let transporterPromise: Promise<Transporter> | null = null;

function getTransporter(): Promise<Transporter> {
  transporterPromise ??= (async () => {
    if (env.SMTP_HOST) {
      return nodemailer.createTransport({
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,
        secure: env.SMTP_PORT === 465,
        auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS ?? '' } : undefined,
      });
    }
    // No credentials: use a throwaway Ethereal inbox and log a preview URL.
    const account = await nodemailer.createTestAccount();
    return nodemailer.createTransport({
      host: account.smtp.host,
      port: account.smtp.port,
      secure: account.smtp.secure,
      auth: { user: account.user, pass: account.pass },
    });
  })();
  // Don't cache a failed setup forever.
  transporterPromise.catch(() => (transporterPromise = null));
  return transporterPromise;
}

async function send(critical: Anomaly[]): Promise<void> {
  const transporter = await getTransporter();
  const lines = critical.map((a) => `- [${a.api_name}] ${a.status_code} / ${Math.round(a.response_time_ms)}ms: ${a.ai_summary}`);
  const info = await transporter.sendMail({
    from: env.ALERT_EMAIL_FROM,
    to: env.ALERT_EMAIL_TO,
    subject: `[APIsentry] ${critical.length} critical API alert${critical.length > 1 ? 's' : ''}`,
    text: lines.join('\n'),
  });
  const preview = nodemailer.getTestMessageUrl(info);
  logger.info({ messageId: info.messageId, ...(preview ? { previewUrl: preview } : {}) }, 'Alert email sent');
}

/**
 * Fire-and-forget digest for critical alerts. Returns synchronously so the
 * ingestion response never waits on SMTP; failures are logged, never thrown.
 */
export function notifyCritical(anomalies: Anomaly[]): void {
  if (!env.EMAIL_ALERTS_ENABLED) return;
  const critical = anomalies.filter((a) => a.severity === 'critical');
  if (critical.length === 0) return;
  void send(critical).catch((err) => logger.warn({ err: (err as Error).message }, 'Alert email failed'));
}
