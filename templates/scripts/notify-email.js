'use strict';
// Transport-agnostic email helper (SMTP via nodemailer). Works with Gmail /
// Google Workspace app passwords, Resend, SendGrid, Mailgun — anything SMTP.
//
// Required env: SMTP_HOST, SMTP_USER, SMTP_PASS, ALERT_TO
// Optional env: SMTP_PORT (default 587), ALERT_FROM (default SMTP_USER)
const nodemailer = require('nodemailer');

async function sendEmail({ subject, text, html, to = process.env.ALERT_TO }) {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const port = Number(process.env.SMTP_PORT || 587);
  const from = process.env.ALERT_FROM || user;
  if (!to || !host || !user || !pass) {
    throw new Error('Email not sent: ALERT_TO, SMTP_HOST, SMTP_USER, and SMTP_PASS are required');
  }
  const transporter = nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass } });
  await transporter.sendMail({ from, to, subject, text, html });
  console.log(`Email sent to ${to}`);
}

// log by default; email only when NOTIFY_MODE=email
async function notify({ subject, text, html }) {
  const mode = (process.env.NOTIFY_MODE || 'log').trim().toLowerCase();
  if (mode !== 'email') {
    console.log(`\n----- NOTIFICATION (mode=${mode} — formatted, not sent) -----\nSubject: ${subject}\n\n${text}\n----- end notification -----`);
    return;
  }
  return sendEmail({ subject, text, html });   // existing SMTP path
}

module.exports = { sendEmail, notify };
