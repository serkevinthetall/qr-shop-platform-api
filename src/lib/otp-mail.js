/**
 * Send OTP email via Admin Gmail (or generic SMTP).
 *
 * Env:
 *   OTP_GMAIL_USER / OTP_GMAIL_APP_PASSWORD  — Gmail app password login
 *   OTP_TO_EMAIL                             — who receives OTP (defaults to OTP_GMAIL_USER)
 *   SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS / SMTP_FROM — optional override
 */
import nodemailer from "nodemailer";

export function otpMailConfigured() {
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    return true;
  }
  return Boolean(
    process.env.OTP_GMAIL_USER?.trim() && process.env.OTP_GMAIL_APP_PASSWORD?.trim(),
  );
}

export function otpRecipientEmail() {
  return (
    process.env.OTP_TO_EMAIL?.trim() ||
    process.env.OTP_GMAIL_USER?.trim() ||
    process.env.SMTP_FROM?.trim() ||
    ""
  );
}

function createTransport() {
  if (process.env.SMTP_HOST) {
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: String(process.env.SMTP_SECURE || "").toLowerCase() === "true",
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }
  const user = process.env.OTP_GMAIL_USER?.trim();
  const pass = process.env.OTP_GMAIL_APP_PASSWORD?.trim();
  if (!user || !pass) {
    throw new Error("OTP email is not configured (OTP_GMAIL_USER / OTP_GMAIL_APP_PASSWORD)");
  }
  return nodemailer.createTransport({
    service: "gmail",
    auth: { user, pass },
  });
}

export async function sendOtpEmail({ to, code, purpose, targetLabel }) {
  if (!otpMailConfigured()) {
    throw new Error("OTP email is not configured");
  }
  const transport = createTransport();
  const from =
    process.env.SMTP_FROM?.trim() ||
    process.env.OTP_GMAIL_USER?.trim() ||
    "noreply@qrshopmyanmar.com";
  const recipient = to || otpRecipientEmail();
  if (!recipient) throw new Error("No OTP recipient email");

  const subject = `QR Shop Admin OTP — ${purpose || "verify"}`;
  const text = [
    `Your QR Shop Admin verification code is: ${code}`,
    "",
    targetLabel ? `Account: ${targetLabel}` : null,
    "This code expires in 10 minutes.",
    "If you did not request this, ignore this email.",
  ]
    .filter(Boolean)
    .join("\n");

  await transport.sendMail({
    from: `QR Shop Admin <${from}>`,
    to: recipient,
    subject,
    text,
  });

  return { to: recipient, from };
}
