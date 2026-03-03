const express = require("express");
const router = express.Router();
const axios = require("axios");

const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID || "";
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET || "";
const GITHUB_CALLBACK_URL = process.env.GITHUB_CALLBACK_URL || "http://localhost:3000/auth/github/callback";

// In-memory token store (per session – restarts with server, which is OK)
const userGithubTokens = {};
if (!global.userGithubNames) global.userGithubNames = {};

// Initiate GitHub OAuth
router.get("/login", (req, res) => {
    const { studentId } = req.query;
    let callbackUrl = GITHUB_CALLBACK_URL;

    // Support local vs production dynamically if possible
    const host = req.headers.host;
    if (host) {
        if (host.includes("localhost")) {
            callbackUrl = `http://${host}/auth/github/callback`;
        } else if (host.includes("onrender.com")) {
            callbackUrl = `https://${host}/auth/github/callback`;
        }
    }

    const url = `https://github.com/login/oauth/authorize?client_id=${GITHUB_CLIENT_ID}&redirect_uri=${encodeURIComponent(callbackUrl)}&scope=repo&state=${encodeURIComponent(studentId)}&prompt=consent`;
    res.redirect(url);
});

// GitHub OAuth callback
router.get("/callback", async (req, res) => {
    const { code, state } = req.query;
    let callbackUrl = GITHUB_CALLBACK_URL;
    const host = req.headers.host;
    if (host) {
        if (host.includes("localhost")) callbackUrl = `http://${host}/auth/github/callback`;
        else if (host.includes("onrender.com")) callbackUrl = `https://${host}/auth/github/callback`;
    }

    try {
        const response = await axios.post(
            "https://github.com/login/oauth/access_token",
            { client_id: GITHUB_CLIENT_ID, client_secret: GITHUB_CLIENT_SECRET, code, redirect_uri: callbackUrl },
            { headers: { Accept: "application/json" } }
        );
        if (state && response.data.access_token) {
            const token = response.data.access_token;
            userGithubTokens[state] = token;
            try {
                const userRes = await axios.get("https://api.github.com/user", {
                    headers: { Authorization: `Bearer ${token}` },
                });
                global.userGithubNames[state] = userRes.data.login;
            } catch (e) {
                console.error("Could not fetch GitHub username:", e.message);
            }
        }
        res.send("<script>window.close();</script>");
    } catch (err) {
        res.status(500).send("Error during GitHub auth");
    }
});

// Get GitHub connection status
router.get("/status/:studentId", (req, res) => {
    const { studentId } = req.params;
    const token = userGithubTokens[studentId];
    const username = global.userGithubNames?.[studentId] || null;
    res.json({ connected: !!token, username });
});

// Push code to GitHub
router.post("/push", async (req, res) => {
    const { studentId, repoName, code, questionTitle } = req.body;
    const token = userGithubTokens[studentId];
    if (!token) return res.status(401).json({ error: "Not connected to GitHub" });
    if (!repoName || !code) return res.status(400).json({ error: "Missing repoName or code" });

    try {
        const userRes = await axios.get("https://api.github.com/user", {
            headers: { Authorization: `Bearer ${token}` },
        });
        const username = userRes.data.login;

        try {
            await axios.post(
                "https://api.github.com/user/repos",
                { name: repoName, description: "SkillCheckAI Task: " + questionTitle, private: false, auto_init: true },
                { headers: { Authorization: `Bearer ${token}` } }
            );
        } catch (e) {
            if (!(e.response?.status === 422)) throw e; // 422 = repo exists
        }

        await new Promise((r) => setTimeout(r, 2000));

        const base64Code = Buffer.from(code).toString("base64");
        let sha;
        try {
            const fileRes = await axios.get(
                `https://api.github.com/repos/${username}/${repoName}/contents/solution.js`,
                { headers: { Authorization: `Bearer ${token}` } }
            );
            sha = fileRes.data.sha;
        } catch (_) { }

        await axios.put(
            `https://api.github.com/repos/${username}/${repoName}/contents/solution.js`,
            { message: "Add/Update solution", content: base64Code, sha },
            { headers: { Authorization: `Bearer ${token}` } }
        );

        res.json({ url: `https://github.com/${username}/${repoName}` });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to push to GitHub" });
    }
});

module.exports = { router, userGithubTokens };
