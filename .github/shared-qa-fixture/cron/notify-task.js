'use strict';
// The task the shared-cron-notify self-test runs. It sends nothing: it proves
// the shared workflow staged notify-email.js beside it, installed its
// dependency, and ran it with the caller's force input.
const { sendEmail } = require('./notify-email.js');
require('nodemailer');

if (typeof sendEmail !== 'function') {
  console.error('notify-email.js was staged but exports no sendEmail');
  process.exit(1);
}
if (process.env.FORCE !== 'true') {
  console.error(`expected FORCE=true from the caller, got ${JSON.stringify(process.env.FORCE)}`);
  process.exit(1);
}
console.log('fixture task ran: notify-email.js staged, nodemailer installed, FORCE passed through');
