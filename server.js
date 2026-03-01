require("dotenv").config();
const express = require("express");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const { exec } = require("child_process");
const axios = require("axios");
const FormData = require("form-data");

const app = express();
const PORT = process.env.PORT || 3000;

const upload = multer({ dest: "uploads/" });
const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID || "";
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET || "";
const GITHUB_CALLBACK_URL = process.env.GITHUB_CALLBACK_URL || `http://localhost:${PORT}/auth/github/callback`;

let userGithubTokens = {}; // map of studentId -> access_token


const DATA_PATH = path.join(__dirname, "data.json");
const QUESTIONS_PATH = path.join(__dirname, "questions.json");

const CONFIG = {
  codeTimeMinutes: 30,
  explainTimeMinutes: 5
};

app.use(express.json({ limit: "2mb" }));
app.use(express.static(path.join(__dirname, "public")));

function readJsonSafe(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) {
      return fallback;
    }
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw);
  } catch (error) {
    return fallback;
  }
}

function writeJsonSafe(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
}

function loadData() {
  return readJsonSafe(DATA_PATH, { submissions: [], users: [] });
}

function saveData(data) {
  writeJsonSafe(DATA_PATH, data);
}

function loadQuestions() {
  return readJsonSafe(QUESTIONS_PATH, { weeks: [] });
}

function findSubmission(submissions, studentId, weekId, questionId) {
  return submissions.find(
    (entry) =>
      entry.studentId === studentId &&
      entry.weekId === weekId &&
      entry.questionId === questionId
  );
}

app.post("/api/auth/register", (req, res) => {
  const { email, password, role } = req.body;
  const data = loadData();
  if (!data.users) data.users = [];

  const existing = data.users.find(u => u.email === email && u.role === role);
  if (existing) {
    return res.status(409).json({ error: "Email already existed. Please Login." });
  }

  data.users.push({ email, password, role });
  saveData(data);
  res.json({ success: true, email, role, name: email.split("@")[0] });
});

app.post("/api/auth/login", (req, res) => {
  const { email, password, role } = req.body;
  const data = loadData();
  if (!data.users) data.users = [];

  const existing = data.users.find(u => u.email === email && u.role === role);
  if (!existing) {
    return res.status(404).json({ error: "Email is not existed. Please Sign In." });
  }

  if (existing.password !== password) {
    return res.status(401).json({ error: "Password is wrong." });
  }

  res.json({ success: true, email, role, name: email.split("@")[0] });
});

app.get("/api/config", (req, res) => {
  res.json(CONFIG);
});

app.get("/api/weeks", (req, res) => {
  const data = loadQuestions();
  const weeks = (data.weeks || []).map((week) => ({
    id: week.id,
    title: week.title,
    summary: week.summary || "",
    questionCount: (week.questions || []).length
  }));
  res.json(weeks);
});

app.get("/api/weeks/:weekId", (req, res) => {
  const data = loadQuestions();
  const week = (data.weeks || []).find((item) => item.id === req.params.weekId);
  if (!week) {
    return res.status(404).json({ error: "Week not found" });
  }
  res.json(week);
});

app.get("/api/questions", (req, res) => {
  const data = loadQuestions();
  res.json(data.weeks || []);
});

app.get("/api/submissions", (req, res) => {
  const { studentId, weekId } = req.query;
  if (!studentId) {
    return res.status(400).json({ error: "studentId is required" });
  }
  const data = loadData();
  const filtered = data.submissions.filter((entry) => {
    if (entry.studentId !== studentId) {
      return false;
    }
    if (weekId && entry.weekId !== weekId) {
      return false;
    }
    return true;
  });
  res.json(filtered);
});

app.get("/api/submissions/week/:weekId", (req, res) => {
  const data = loadData();
  const filtered = data.submissions.filter(
    (entry) => entry.weekId === req.params.weekId
  );
  res.json(filtered);
});

app.get("/api/submissions/all", (req, res) => {
  const data = loadData();
  res.json(data.submissions);
});

app.post("/api/submissions", (req, res) => {
  const {
    studentId,
    studentName,
    weekId,
    questionId,
    questionTitle,
    githubUrl,
    code,
    transcript
  } = req.body;

  if (!studentId || !studentName || !weekId || !questionId || !questionTitle) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const data = loadData();
  let entry = findSubmission(data.submissions, studentId, weekId, questionId);
  if (!entry) {
    entry = {
      id: `${studentId}-${weekId}-${questionId}`,
      studentId,
      studentName,
      weekId,
      questionId,
      questionTitle,
      githubUrl: "",
      code: "",
      transcript: "",
      status: "submitted",
      createdAt: new Date().toISOString()
    };
    data.submissions.push(entry);
  }

  entry.questionTitle = questionTitle || entry.questionTitle;
  entry.githubUrl = githubUrl || entry.githubUrl;
  entry.code = code || entry.code;
  entry.transcript = transcript || entry.transcript;
  entry.updatedAt = new Date().toISOString();
  entry.status = "submitted";

  saveData(data);
  res.json(entry);
});

// GitHub OAuth Login
app.get("/api/github/login", (req, res) => {
  const { studentId } = req.query;
  const url = `https://github.com/login/oauth/authorize?client_id=${GITHUB_CLIENT_ID}&redirect_uri=${encodeURIComponent(GITHUB_CALLBACK_URL)}&scope=repo&state=${encodeURIComponent(studentId)}&prompt=consent`;
  res.redirect(url);
});

// GitHub OAuth Callback
app.get("/auth/github/callback", async (req, res) => {
  const { code, state } = req.query; // state contains studentId
  try {
    const response = await axios.post("https://github.com/login/oauth/access_token", {
      client_id: GITHUB_CLIENT_ID,
      client_secret: GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: GITHUB_CALLBACK_URL
    }, {
      headers: { Accept: "application/json" }
    });

    if (state && response.data.access_token) {
      const token = response.data.access_token;
      userGithubTokens[state] = token;

      try {
        const userRes = await axios.get("https://api.github.com/user", {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (!global.userGithubNames) global.userGithubNames = {};
        global.userGithubNames[state] = userRes.data.login;
      } catch (e) {
        console.error("Could not fetch username", e.message);
      }
    }

    res.send("<script>window.close();</script>");
  } catch (err) {
    res.status(500).send("Error logging in with GitHub");
  }
});

app.get("/api/github/status/:studentId", (req, res) => {
  const studentId = req.params.studentId;
  const token = userGithubTokens[studentId];
  const username = (global.userGithubNames && global.userGithubNames[studentId]) ? global.userGithubNames[studentId] : null;
  res.json({ connected: !!token, username });
});

// GitHub Repo creation and push
app.post("/api/github/push", async (req, res) => {
  const { studentId, repoName, code, questionTitle } = req.body;
  const token = userGithubTokens[studentId];

  if (!token) return res.status(401).json({ error: "Not connected to GitHub" });
  if (!repoName || !code) return res.status(400).json({ error: "Missing repoName or code" });

  try {
    // 1. Get username
    const userRes = await axios.get("https://api.github.com/user", {
      headers: { Authorization: `Bearer ${token}` }
    });
    const username = userRes.data.login;

    // 2. Create repo
    try {
      await axios.post("https://api.github.com/user/repos", {
        name: repoName,
        description: "Student Code Review Task: " + questionTitle,
        private: false,
        auto_init: true
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
    } catch (e) {
      if (!(e.response && e.response.status === 422)) { // 422 means repo already exists
        throw e;
      }
    }

    // 3. Wait a moment to ensure repo is ready for commit
    await new Promise(r => setTimeout(r, 2000));

    // 4. Push file
    const base64Code = Buffer.from(code).toString("base64");
    let sha = undefined;
    try {
      const fileRes = await axios.get(`https://api.github.com/repos/${username}/${repoName}/contents/solution.js`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      sha = fileRes.data.sha;
    } catch (e) { } // file doesn't exist yet

    await axios.put(`https://api.github.com/repos/${username}/${repoName}/contents/solution.js`, {
      message: "Add/Update solution",
      content: base64Code,
      sha
    }, {
      headers: { Authorization: `Bearer ${token}` }
    });

    res.json({ url: `https://github.com/${username}/${repoName}` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to push to GitHub" });
  }
});

// Hugo Face Transcription (using HF Inference API via Direct Axios)
app.post("/api/transcribe", upload.single("audio"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No audio file provided" });
  const inputPath = path.resolve(req.file.path);

  try {
    const audioData = fs.readFileSync(inputPath);
    const token = process.env.HUGGING_FACE_API_KEY || process.env.HF_TOKEN;

    if (!token) throw new Error("HUGGING_FACE_API_KEY is missing in environment.");

    const response = await axios.post(
      "https://router.huggingface.co/hf-inference/models/openai/whisper-large-v3-turbo",
      audioData,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "audio/webm",
        },
      }
    );

    res.json({ transcript: response.data.text.trim() });
    if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
  } catch (err) {
    console.error("Transcription Error:", err.response?.data || err.message);
    res.status(500).json({ error: (err.response?.data?.error || err.message) });
    if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
  }
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
