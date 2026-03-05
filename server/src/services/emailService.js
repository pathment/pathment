const nodemailer = require("nodemailer");
const config = require("../config");

class EmailService {
  constructor() {
    this.transporter = null;
    this.initializeTransporter();
  }

  /**
   * Initialize email transporter
   */
  initializeTransporter() {
    if (!config.email.host || !config.email.user || !config.email.password) {
      console.log("Email service not configured. Emails will not be sent.");
      return;
    }

    this.transporter = nodemailer.createTransport({
      host: config.email.host,
      port: config.email.port,
      secure: config.email.secure,
      auth: {
        user: config.email.user,
        pass: config.email.password,
      },
    });
  }

  /**
   * Send email
   */
  async sendEmail(to, subject, html, text) {
    if (!this.transporter) {
      console.log("Email service not configured, skipping email send to:", to);
      return { skipped: true, message: "Email service not configured" };
    }

    try {
      const info = await this.transporter.sendMail({
        from: config.email.from,
        to,
        subject,
        html,
        text,
      });

      console.log("Email sent:", info.response);
      return { success: true, messageId: info.messageId };
    } catch (error) {
      console.error("Error sending email:", error);
      throw new Error(`Failed to send email: ${error.message}`);
    }
  }

  /**
   * Send email verification code
   */
  async sendVerificationEmail(email, verificationCode) {
    const subject = "Verify Your Email - Pathment";
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px;">
          <h1 style="color: #4f46e5; text-align: center; margin-bottom: 20px;">Verify Your Email</h1>
          
          <p style="color: #333; font-size: 16px; margin-bottom: 20px;">
            Hello,
          </p>
          
          <p style="color: #333; font-size: 16px; margin-bottom: 20px;">
            Thank you for creating a Pathment account! To complete your registration, please verify your email address using the code below:
          </p>
          
          <div style="background-color: #4f46e5; padding: 20px; border-radius: 8px; text-align: center; margin-bottom: 20px;">
            <p style="color: white; font-size: 32px; font-weight: bold; letter-spacing: 5px; margin: 0;">
              ${verificationCode}
            </p>
          </div>
          
          <p style="color: #666; font-size: 14px; margin-bottom: 20px;">
            This code will expire in <strong>15 minutes</strong>.
          </p>
          
          <p style="color: #666; font-size: 14px; margin-bottom: 20px;">
            If you didn't request this code, you can safely ignore this email.
          </p>
          
          <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">
          
          <p style="color: #999; font-size: 12px; text-align: center;">
            © 2024 Pathment. All rights reserved.
          </p>
        </div>
      </div>
    `;

    const text = `
      Verify Your Email - Pathment

      Hello,

      Thank you for creating a Pathment account! To complete your registration, please use the code below:

      ${verificationCode}

      This code will expire in 15 minutes.

      If you didn't request this code, you can safely ignore this email.

      © 2024 Pathment. All rights reserved.
    `;

    return this.sendEmail(email, subject, html, text);
  }

  /**
   * Send password reset email
   */
  async sendPasswordResetEmail(email, resetToken) {
    const subject = "Reset Your Password - Pathment";
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px;">
          <h1 style="color: #4f46e5; text-align: center; margin-bottom: 20px;">Reset Your Password</h1>
          
          <p style="color: #333; font-size: 16px; margin-bottom: 20px;">
            Hello,
          </p>
          
          <p style="color: #333; font-size: 16px; margin-bottom: 20px;">
            We received a request to reset your password. Use the code below to reset it:
          </p>
          
          <div style="background-color: #4f46e5; padding: 20px; border-radius: 8px; text-align: center; margin-bottom: 20px;">
            <p style="color: white; font-size: 32px; font-weight: bold; letter-spacing: 5px; margin: 0;">
              ${resetToken}
            </p>
          </div>
          
          <p style="color: #666; font-size: 14px; margin-bottom: 20px;">
            This code will expire in <strong>1 hour</strong>.
          </p>
          
          <p style="color: #666; font-size: 14px; margin-bottom: 20px;">
            If you didn't request this, you can safely ignore this email.
          </p>
          
          <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">
          
          <p style="color: #999; font-size: 12px; text-align: center;">
            © 2024 Pathment. All rights reserved.
          </p>
        </div>
      </div>
    `;

    const text = `
      Reset Your Password - Pathment

      Hello,

      We received a request to reset your password. Use the code below to reset it:

      ${resetToken}

      This code will expire in 1 hour.

      If you didn't request this, you can safely ignore this email.

      © 2024 Pathment. All rights reserved.
    `;

    return this.sendEmail(email, subject, html, text);
  }
}

module.exports = new EmailService();
