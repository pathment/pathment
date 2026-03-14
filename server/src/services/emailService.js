const nodemailer = require('nodemailer');

class EmailService {
  constructor() {
    this.transporter = null;
    this.enabled = false;
    this.init();
  }

  init() {
    const host = process.env.SMTP_HOST;
    const port = Number(process.env.SMTP_PORT || 587);
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;

    if (!host || !user || !pass) {
      this.enabled = false;
      return;
    }

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: {
        user,
        pass
      }
    });
    this.enabled = true;
  }

  async sendEmail({ to, subject, text, html }) {
    if (!to || !subject) {
      return { sent: false, reason: 'invalid_payload' };
    }

    const from = process.env.EMAIL_FROM || 'Pathment <no-reply@pathment.local>';

    if (!this.enabled) {
      // Keep dev/test environments functional without SMTP credentials.
      console.log('[email:disabled]', { to, subject, preview: text?.slice(0, 120) || '' });
      return { sent: false, reason: 'smtp_not_configured' };
    }

    await this.transporter.sendMail({
      from,
      to,
      subject,
      text,
      html
    });

    return { sent: true };
  }
}

module.exports = new EmailService();
