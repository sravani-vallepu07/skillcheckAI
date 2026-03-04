const nodemailer = require("nodemailer");

function createTransporter() {
  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  // Verify connection configuration
  transporter.verify(function (error, success) {
    if (error) {
      console.error("SMTP Connection Error:", error);
    } else {
      console.log("SMTP Server is ready to take our messages");
    }
  });

  return transporter;
}

async function sendWelcomeEmail(to, name) {
  try {
    const transporter = createTransporter();
    await transporter.sendMail({
      from: `"SkillCheckAI" <${process.env.EMAIL_USER}>`,
      to,
      subject: "Welcome to SkillCheckAI!",
      html: `
        <div style="font-family:'Inter',system-ui,sans-serif;background:#f8fafc;padding:0;margin:0;">
          <div style="max-width:600px;margin:0 auto;background:#f8fafc;padding:48px 20px;">
            <div style="text-align:center;margin-bottom:32px;">
              <h1 style="color:#2563eb;font-size:28px;font-weight:800;letter-spacing:-1px;margin:0;">SkillCheckAI</h1>
              <p style="color:#64748b;font-size:15px;margin:8px 0 0 0;">AI-Powered Code Review Platform</p>
            </div>

            <div style="background:#ffffff;border-radius:12px;padding:48px;border:1px solid #e2e8f0;box-shadow:0 1px 3px 0 rgba(0,0,0,0.1);margin-bottom:24px;">
              <h2 style="color:#0f172a;font-size:24px;margin:0 0 16px 0;font-weight:700;">Welcome, ${name}!</h2>
              <p style="color:#475569;line-height:1.6;margin:0 0 24px 0;font-size:16px;">
                You've successfully joined <strong>SkillCheckAI</strong> — the platform for DSA practice and AI-powered feedback at RGUKT.
              </p>
              <div style="background:#f1f5f9;border-radius:8px;padding:24px;margin-bottom:32px;">
                <p style="color:#0f172a;font-size:13px;margin:0 0 12px 0;text-transform:uppercase;letter-spacing:0.5px;font-weight:700;">Features</p>
                <ul style="color:#475569;padding-left:20px;margin:0;line-height:1.8;font-size:15px;">
                  <li>Weekly DSA challenges</li>
                  <li>GitHub integration</li>
                  <li>Voice explanations</li>
                  <li>AI feedback</li>
                </ul>
              </div>
              <div style="text-align:center;">
                <a href="${process.env.APP_URL}" style="background:#2563eb;color:white;padding:16px 32px;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px;display:inline-block;">
                  Get Started
                </a>
              </div>
            </div>

            <p style="text-align:center;color:#94a3b8;font-size:12px;margin:0;">
              SkillCheckAI &bull; RGUKT &bull; Powered by AI
            </p>
          </div>
        </div>
      `,
    });
    console.log("Welcome email sent to:", to);
  } catch (err) {
    console.error("Failed to send welcome email:", err.message);
    // Don't fail registration if email fails
  }
}

async function sendPasswordResetEmail(to, token) {
  try {
    const transporter = createTransporter();
    const resetUrl = `${process.env.APP_URL}/reset-password?token=${token}`;
    await transporter.sendMail({
      from: `"SkillCheckAI" <${process.env.EMAIL_USER}>`,
      to,
      subject: "SkillCheckAI – Reset Your Password",
      html: `
        <div style="font-family:'Inter',system-ui,sans-serif;background:#f8fafc;padding:0;margin:0;">
          <div style="max-width:600px;margin:0 auto;background:#f8fafc;padding:48px 20px;">
            <div style="text-align:center;margin-bottom:32px;">
              <h1 style="color:#2563eb;font-size:28px;font-weight:800;letter-spacing:-1px;margin:0;">SkillCheckAI</h1>
              <p style="color:#64748b;font-size:15px;margin:8px 0 0 0;">Password Reset Request</p>
            </div>

            <div style="background:#ffffff;border-radius:12px;padding:48px;border:1px solid #e2e8f0;box-shadow:0 1px 3px 0 rgba(0,0,0,0.1);margin-bottom:24px;">
              <h2 style="color:#0f172a;font-size:22px;margin:0 0 16px 0;font-weight:700;text-align:center;">Reset Your Password</h2>
              <p style="color:#475569;line-height:1.6;margin:0 0 24px 0;font-size:16px;">
                We received a request to reset your <strong>SkillCheckAI</strong> password. Click the button below to set a new password.
              </p>

              <div style="background:#fffbeb;border-radius:8px;padding:20px;margin-bottom:32px;border-left:4px solid #d97706;">
                <p style="color:#92400e;font-size:13px;margin:0;font-weight:600;">This link expires in 1 hour.</p>
                <p style="color:#b45309;font-size:14px;margin:4px 0 0 0;">If you didn't request this, you can safely ignore this email.</p>
              </div>

              <div style="text-align:center;margin-bottom:24px;">
                <a href="${resetUrl}" style="background:#2563eb;color:white;padding:16px 32px;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px;display:inline-block;">
                  Reset Password
                </a>
              </div>

              <p style="color:#94a3b8;font-size:12px;margin:0;text-align:center;">
                Or copy this link:<br/>
                <a href="${resetUrl}" style="color:#2563eb;word-break:break-all;">${resetUrl}</a>
              </p>
            </div>

            <p style="text-align:center;color:#94a3b8;font-size:12px;margin:0;">
              SkillCheckAI &bull; RGUKT &bull; Powered by AI
            </p>
          </div>
        </div>
      `,
    });
    console.log("Password reset email sent to:", to);
  } catch (err) {
    console.error("Failed to send password reset email:", err.message);
    throw err;
  }
}

async function sendVerificationEmail(to, token) {
  try {
    const transporter = createTransporter();
    const verifyUrl = `${process.env.APP_URL}/api/auth/verify-email?token=${token}`;
    await transporter.sendMail({
      from: `"SkillCheckAI" <${process.env.EMAIL_USER}>`,
      to,
      subject: "SkillCheckAI – Verify Your Email",
      html: `
        <div style="font-family:'Inter',system-ui,sans-serif;background:#f8fafc;padding:0;margin:0;">
          <div style="max-width:600px;margin:0 auto;background:#f8fafc;padding:48px 20px;">
            <div style="text-align:center;margin-bottom:32px;">
              <h1 style="color:#2563eb;font-size:28px;font-weight:800;letter-spacing:-1px;margin:0;">SkillCheckAI</h1>
              <p style="color:#64748b;font-size:15px;margin:8px 0 0 0;">Email Verification Required</p>
            </div>

            <div style="background:#ffffff;border-radius:12px;padding:48px;border:1px solid #e2e8f0;box-shadow:0 1px 3px 0 rgba(0,0,0,0.1);margin-bottom:24px;">
              <h2 style="color:#0f172a;font-size:22px;margin:0 0 16px 0;font-weight:700;text-align:center;">Verify Your Email Address</h2>
              <p style="color:#475569;line-height:1.6;margin:0 0 24px 0;font-size:16px;">
                Thank you for signing up for <strong>SkillCheckAI</strong>. To complete your registration and start your DSA practice, please verify your email address by clicking the button below.
              </p>

              <div style="text-align:center;margin-bottom:24px;">
                <a href="${verifyUrl}" style="background:#2563eb;color:white;padding:16px 32px;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px;display:inline-block;">
                  Verify Email
                </a>
              </div>

              <p style="color:#94a3b8;font-size:12px;margin:0;text-align:center;">
                Or copy this link:<br/>
                <a href="${verifyUrl}" style="color:#2563eb;word-break:break-all;">${verifyUrl}</a>
              </p>
              <p style="color:#94a3b8;font-size:12px;margin:16px 0 0 0;text-align:center;">
                This link will verify your account on any device you use to open it.
              </p>
            </div>

            <p style="text-align:center;color:#94a3b8;font-size:12px;margin:0;">
              SkillCheckAI &bull; RGUKT &bull; Powered by AI
            </p>
          </div>
        </div>
      `,
    });
    console.log("Verification email sent to:", to);
  } catch (err) {
    console.error("Failed to send verification email:", err.message);
    throw err;
  }
}

module.exports = { sendWelcomeEmail, sendPasswordResetEmail, sendVerificationEmail };
