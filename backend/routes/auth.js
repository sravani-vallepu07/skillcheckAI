const express = require("express");
const router = express.Router();
const crypto = require("crypto");
const User = require("../models/User");
const { sendWelcomeEmail, sendPasswordResetEmail } = require("../email");

// Check if email is already registered (for Sign In vs Login toggle)
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
    try {
        const existing = await User.findOne({ email: email.toLowerCase().trim(), role });
        if (existing) {
            return res.status(409).json({ error: "Email already registered. Please Login." });
        }
        const user = new User({ email: email.toLowerCase().trim(), password, role });
        await user.save();
        // Send welcome email (non-blocking)
        sendWelcomeEmail(user.email, email.split("@")[0]);
        res.json({ success: true, email: user.email, role: user.role, name: email.split("@")[0] });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Server error during registration." });
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
        res.json({ success: true, email: user.email, role: user.role, name: email.split("@")[0] });
    } catch (err) {
        res.status(500).json({ error: "Server error during login." });
    }
});

// Forgot Password – generates reset token and sends email
router.post("/forgot-password", async (req, res) => {
    const { email, role } = req.body;
    if (!email) return res.status(400).json({ error: "Email is required." });
    try {
        const user = await User.findOne({ email: email.toLowerCase().trim(), role });
        if (!user) {
            // Security: don't reveal whether user exists
            return res.json({ success: true, message: "If this email is registered, a reset link has been sent." });
        }
        const token = crypto.randomBytes(32).toString("hex");
        user.resetToken = token;
        user.resetTokenExpiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
        await user.save();
        await sendPasswordResetEmail(user.email, token);
        res.json({ success: true, message: "Password reset email sent. Please check your inbox." });
    } catch (err) {
        console.error(err);
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

module.exports = router;
