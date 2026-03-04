const express = require("express");
const router = express.Router();
const axios = require("axios");
const User = require("../models/User");

const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID || "";
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET || "";
const GITHUB_CALLBACK_URL = (process.env.GITHUB_CALLBACK_URL || "").trim();

// Initiate GitHub OAuth
router.get("/login", (req, res) => {
    const { studentId } = req.query;
    if (!studentId) return res.status(400).send("studentId (email) is required");

    let callbackUrl = GITHUB_CALLBACK_URL;
    const host = req.headers.host;
    if (host && host.includes("localhost")) {
        callbackUrl = `http://${host}/auth/github/callback`;
    }

    console.log(`[GitHub] Initiating login for ${studentId}`);
    console.log(`[GitHub] Using Redirect URI: ${callbackUrl}`);

    const url = `https://github.com/login/oauth/authorize?client_id=${GITHUB_CLIENT_ID}&redirect_uri=${encodeURIComponent(callbackUrl)}&scope=repo&state=${encodeURIComponent(studentId)}&prompt=consent`;
    res.redirect(url);
});

// GitHub OAuth callback
router.get("/callback", async (req, res) => {
    const { code, state: studentId } = req.query;
    if (!code) return res.status(400).send("No code provided from GitHub");

    let callbackUrl = GITHUB_CALLBACK_URL;
    const host = req.headers.host;
    if (host && host.includes("localhost")) {
        callbackUrl = `http://${host}/auth/github/callback`;
    }

    console.log(`[GitHub] Callback received for ${studentId}`);
    console.log(`[GitHub] Using Redirect URI for Token Exchange: ${callbackUrl}`);

    try {
        const response = await axios.post(
            "https://github.com/login/oauth/access_token",
            { client_id: GITHUB_CLIENT_ID, client_secret: GITHUB_CLIENT_SECRET, code, redirect_uri: callbackUrl },
            { headers: { Accept: "application/json" } }
        );

        const token = response.data.access_token;
        if (!token) {
            console.error("[GitHub] Failed to get access token:", response.data);
            return res.status(500).send("Failed to obtain access token from GitHub");
        }

        // Fetch GitHub username
        const userRes = await axios.get("https://api.github.com/user", {
            headers: { Authorization: `Bearer ${token}` },
        });
        const githubUsername = userRes.data.login;

        // Persist to Database
        if (studentId) {
            await User.findOneAndUpdate(
                { email: studentId.toLowerCase() },
                { githubAccessToken: token, githubUsername: githubUsername },
                { upsert: false }
            );
            console.log(`[GitHub] Token saved to DB for ${studentId} (${githubUsername})`);
        }

        res.send("<script>window.close();</script>");
    } catch (err) {
        console.error("[GitHub] Auth Error:", err.response?.data || err.message);
        res.status(500).send("Error during GitHub auth: " + (err.response?.data?.error_description || err.message));
    }
});

// Get GitHub connection status
router.get("/status/:studentId", async (req, res) => {
    const { studentId } = req.params;
    try {
        const user = await User.findOne({ email: studentId.toLowerCase() });
        res.json({
            connected: !!user?.githubAccessToken,
            username: user?.githubUsername || null
        });
    } catch (err) {
        res.status(500).json({ connected: false });
    }
});

// Push code to GitHub
router.post("/push", async (req, res) => {
    const { studentId, repoName, code, questionTitle } = req.body;

    try {
        const user = await User.findOne({ email: studentId?.toLowerCase() });
        const token = user?.githubAccessToken;

        if (!token) {
            console.warn(`[GitHub] Push failed: No token found for ${studentId}`);
            return res.status(401).json({ error: "Not connected to GitHub or session expired. Please connect again." });
        }
        if (!repoName || !code) return res.status(400).json({ error: "Missing repoName or code" });

        console.log(`[GitHub] Attempting push for ${studentId} to repo ${repoName}`);

        const username = user.githubUsername || (await axios.get("https://api.github.com/user", {
            headers: { Authorization: `Bearer ${token}` },
        })).data.login;

        // 1. Create Repo (if not exists)
        try {
            await axios.post(
                "https://api.github.com/user/repos",
                {
                    name: repoName,
                    description: "SkillCheckAI Task: " + questionTitle,
                    private: false,
                    auto_init: true
                },
                { headers: { Authorization: `Bearer ${token}` } }
            );
            console.log(`[GitHub] Created/Verified repo: ${repoName}`);
        } catch (e) {
            if (!(e.response?.status === 422)) {
                console.error("[GitHub] Repo creation error:", e.response?.data || e.message);
                throw e;
            }
        }

        await new Promise((r) => setTimeout(r, 2000));

        // 2. Push File
        const base64Code = Buffer.from(code).toString("base64");
        let sha;
        const filePath = "solution.js";

        try {
            const fileRes = await axios.get(
                `https://api.github.com/repos/${username}/${repoName}/contents/${filePath}`,
                { headers: { Authorization: `Bearer ${token}` } }
            );
            sha = fileRes.data.sha;
        } catch (_) { }

        await axios.put(
            `https://api.github.com/repos/${username}/${repoName}/contents/${filePath}`,
            { message: "Add/Update solution via SkillCheckAI", content: base64Code, sha },
            { headers: { Authorization: `Bearer ${token}` } }
        );

        console.log(`[GitHub] Successfully pushed to ${username}/${repoName}`);
        res.json({ url: `https://github.com/${username}/${repoName}` });
    } catch (err) {
        console.error("[GitHub] Push Error:", err.response?.data || err.message);
        res.status(500).json({
            error: "Failed to push to GitHub: " + (err.response?.data?.message || err.message)
        });
    }
});

module.exports = { router };
