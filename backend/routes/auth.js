const express = require("express");
const router = express.Router();
const crypto = require("crypto");
const User = require("../models/User");
const { sendWelcomeEmail, sendPasswordResetEmail, sendVerificationEmail } = require("../email");
const { STUDENT_ROLL_NOS, STUDENT_GMAILS, FACULTY_EMAILS } = require("../whitelist");

// Helper to validate and extract info from email
function getEmailInfo(email, role) {
    const cleanEmail = email.toLowerCase().trim();
    if (role === "faculty") {
        const isWhitelisted = FACULTY_EMAILS.includes(cleanEmail);
        return { valid: isWhitelisted, role: "faculty" };
    }
    if (role === "student") {
        // Check special gmail
        if (STUDENT_GMAILS.includes(cleanEmail)) {
            return { valid: true, role: "student", rollNo: "GUEST" };
        }
        // Check rguktn pattern: n210577@rguktn.ac.in
        const match = cleanEmail.match(/^(n\d+)@rguktn\.ac\.in$/);
        if (match) {
            const rollNo = match[1].toUpperCase();
            const isWhitelisted = STUDENT_ROLL_NOS.includes(rollNo);
            return { valid: isWhitelisted, role: "student", rollNo };
        }
    }
    return { valid: false };
}

// Check if email is already registered
router.post("/check-email", async (req, res) => {
    const { email, role } = req.body;
    try {
        const user = await User.findOne({ email: email.toLowerCase().trim(), role });
        res.json({ exists: !!user });
    } catch (err) {
        res.status(500).json({ exists: false });
    }
});

// Register (first-time Sign In)
router.post("/register", async (req, res) => {
    const { email, password, role } = req.body;
    if (!email || !password || !role) {
        return res.status(400).json({ error: "Email, password and role are required." });
    }

    const info = getEmailInfo(email, role);
    if (!info.valid) {
        return res.status(403).json({ error: "invalid mail" });
    }

    try {
        const existing = await User.findOne({ email: email.toLowerCase().trim(), role });
        if (existing) {
            return res.status(409).json({ error: "Email already registered. Please Login." });
        }

        const verificationToken = crypto.randomBytes(32).toString("hex");
        const user = new User({
            email: email.toLowerCase().trim(),
            password,
            role,
            rollNo: info.rollNo,
            isVerified: true, // Default to true as requested
            verificationToken: undefined
        });
        await user.save();

        // Send verification email
        await sendVerificationEmail(user.email, verificationToken);

        res.json({
            success: true,
            message: "Registration successful! You can now login.",
            needsVerification: false
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Server error during registration." });
    }
});

// Verify Email Route (GET)
router.get("/verify-email", async (req, res) => {
    const { token } = req.query;
    if (!token) return res.status(400).send("Verification token is missing.");

    try {
        const user = await User.findOne({ verificationToken: token });
        if (!user) {
            return res.status(400).send("Invalid or expired verification link.");
        }

        user.isVerified = true;
        user.verificationToken = undefined;
        await user.save();

        // Success page (simple HTML)
        res.send(`
            <div style="font-family:sans-serif; text-align:center; padding:50px;">
                <h1 style="color:#2563eb;">Email Verified!</h1>
                <p>Your account is now active. You can close this window and login to SkillCheckAI.</p>
                <a href="${process.env.APP_URL}" style="display:inline-block; margin-top:20px; padding:10px 20px; background:#2563eb; color:white; text-decoration:none; border-radius:5px;">Go to App</a>
            </div>
        `);
    } catch (err) {
        res.status(500).send("Server error during verification.");
    }
});

// Login (returning user)
router.post("/login", async (req, res) => {
    const { email, password, role } = req.body;
    if (!email || !password || !role) {
        return res.status(400).json({ error: "Email, password and role are required." });
    }
    try {
        const user = await User.findOne({ email: email.toLowerCase().trim(), role });
        if (!user) {
            return res.status(404).json({ error: "Email not found. Please Sign In first." });
        }
        if (user.password !== password) {
            return res.status(401).json({ error: "Incorrect password. Please try again." });
        }
        // Removed isVerified check for immediate login
        res.json({
            success: true,
            email: user.email,
            role: user.role,
            name: email.split("@")[0],
            rollNo: user.rollNo
        });
    } catch (err) {
        res.status(500).json({ error: "Server error during login." });
    }
});

// Forgot Password – generates reset token and sends email
router.post("/forgot-password", async (req, res) => {
    const { email, role } = req.body;
    if (!email) return res.status(400).json({ error: "Email is required." });
    console.log(`[Auth] Forgot password request for ${email} (${role})`);
    console.log(`[Auth] Using SMTP User: ${process.env.EMAIL_USER || "MISSING"}`);
    try {
        let user = await User.findOne({ email: email.toLowerCase().trim(), role });
        if (!user) {
            console.log(`[Auth] Forgot password: User not found for ${email} as ${role}. Checking other roles...`);
            user = await User.findOne({ email: email.toLowerCase().trim() });
            if (user) {
                console.log(`[Auth] Forgot password: Found user ${email} but with role ${user.role} instead of requested ${role}. Proceeding anyway.`);
            } else {
                console.log(`[Auth] Forgot password: User not found for ${email} at all.`);
                return res.json({ success: true, message: "If this email is registered, a reset link has been sent." });
            }
        }
        const token = crypto.randomBytes(32).toString("hex");
        user.resetToken = token;
        user.resetTokenExpiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
        await user.save();

        console.log(`[Auth] Reset token saved. Triggering background email to ${user.email}`);

        // Fire and forget (catch error in logs)
        sendPasswordResetEmail(user.email, token).catch(err => {
            console.error("[Auth] Background Reset Email Error:", err.message);
        });

        res.json({ success: true, message: "Password reset request received. Please check your inbox shortly." });
    } catch (err) {
        console.error("[Auth] Forgot password error:", err);
        res.status(500).json({ error: "Failed to send reset email. Please try again." });
    }
});

// Reset Password – validates token and updates password
router.post("/reset-password", async (req, res) => {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) {
        return res.status(400).json({ error: "Token and new password are required." });
    }
    try {
        const user = await User.findOne({
            resetToken: token,
            resetTokenExpiry: { $gt: new Date() },
        });
        if (!user) {
            return res.status(400).json({ error: "Reset link is invalid or has expired. Please request a new one." });
        }
        user.password = newPassword;
        user.resetToken = undefined;
        user.resetTokenExpiry = undefined;
        await user.save();
        res.json({ success: true, message: "Password updated successfully. You can now login." });
    } catch (err) {
        res.status(500).json({ error: "Failed to reset password." });
    }
});

// Diagnostic: Test Email Connectivity
router.post("/test-email", async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "Email target is required." });
    console.log(`[Diagnostic] Attempting test email to ${email}`);
    try {
        const { sendPasswordResetEmail } = require("../email");
        // We'll use a dummy token for the test
        await sendPasswordResetEmail(email, "test-token-12345");

        res.json({
            success: true,
            message: "Test email sent successfully! Please check your inbox and SPAM folder.",
        });
    } catch (err) {
        console.error("[Diagnostic] Email Test Failed:", err);
        res.status(500).json({
            success: false,
            error: "Email test failed.",
            details: err.message,
            hint: "Check your EMAIL_USER and EMAIL_PASS (App Password) in Render environment variables. Also ensure APP_URL is set."
        });
    }
});

module.exports = router;
