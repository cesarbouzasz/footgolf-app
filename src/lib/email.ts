import nodemailer from 'nodemailer';

type EmailPayload = {
  to: string | string[];
  bcc?: string | string[];
  subject: string;
  html: string;
  text?: string;
};

function getSmtpConfig() {
  const host = process.env.SMTP_HOST || 'smtp.gmail.com';
  const port = Number.parseInt(String(process.env.SMTP_PORT || '465'), 10);
  const secure = String(process.env.SMTP_SECURE || '').toLowerCase();
  const user = process.env.SMTP_USER || '';
  const pass = process.env.SMTP_PASS || '';

  if (!user || !pass) return null;

  return {
    host,
    port: Number.isFinite(port) ? port : 465,
    secure: secure ? secure === 'true' : port === 465,
    auth: { user, pass },
  };
}

function getFromAddress() {
  return process.env.SMTP_FROM || process.env.SMTP_USER || '';
}

export async function sendEmail(payload: EmailPayload) {
  const config = getSmtpConfig();
  const from = getFromAddress();
  if (!config || !from) {
    return { ok: false as const, error: 'Missing SMTP configuration' };
  }

  const transporter = nodemailer.createTransport(config);

  try {
    await transporter.sendMail({
      from,
      to: payload.to,
      bcc: payload.bcc,
      subject: payload.subject,
      html: payload.html,
      text: payload.text,
    });
    return { ok: true as const };
  } catch (error: any) {
    return { ok: false as const, error: error?.message || 'Email send failed' };
  }
}
