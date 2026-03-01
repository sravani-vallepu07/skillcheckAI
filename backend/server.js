const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });
const express = require("express");
const multer = require("multer");
const axios = require("axios");
const FormData = require("form-data");
const fs = require("fs");
const mongoose = require("mongoose");
const cors = require("cors");
const { HfInference } = require("@huggingface/inference");

// Initialize later inside the route or with a check
let hf;
function getHf() {
    if (!hf) {
        const token = process.env.HUGGING_FACE_API_KEY || process.env.HF_TOKEN;
        console.log("Hugging Face Token Present:", !!token);
        if (!token) {
            throw new Error("HUGGING_FACE_API_KEY is missing in environment variables. Please add it to your Render dashboard.");
        }
        try {
            hf = new HfInference(token);
            console.log("Hugging Face client initialized successfully.");
        } catch (e) {
            console.error("Failed to initialize Hugging Face client:", e.message);
            throw e;
        }
    }
    return hf;
}

console.log("Server starting...");
console.log("Check Env - PORT:", process.env.PORT);
console.log("Check Env - MONGODB_URI:", process.env.MONGODB_URI ? "EXISTS" : "MISSING");
console.log("Check Env - HUGGING_FACE_API_KEY:", process.env.HUGGING_FACE_API_KEY ? "EXISTS" : "MISSING");

const app = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ──────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use(express.static(path.join(__dirname, "../frontend")));

// ── MongoDB ─────────────────────────────────────────────────────────────────
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/skillcheckai";

mongoose
    .connect(MONGODB_URI)
    .then(async () => {
        console.log("✅ MongoDB connected:", MONGODB_URI);
        // Migrate existing data.json on first boot
        await migrateFromJson();
    })
    .catch((err) => {
        console.error("❌ MongoDB connection error:", err.message);
        console.log("⚠️  Server will still start but data will not persist.");
    });

// ── Data Migration (data.json → MongoDB) ────────────────────────────────────
async function migrateFromJson() {
    const dataPath = path.join(__dirname, "../data.json");
    if (!fs.existsSync(dataPath)) return;
    try {
        const User = require("./models/User");
        const Submission = require("./models/Submission");
        const raw = JSON.parse(fs.readFileSync(dataPath, "utf-8"));

        if (raw.users?.length) {
            for (const u of raw.users) {
                const exists = await User.findOne({ email: u.email, role: u.role });
                if (!exists) {
                    await User.create({ email: u.email, password: u.password, role: u.role });
                }
            }
            console.log(`✅ Migrated ${raw.users.length} users from data.json`);
        }
        if (raw.submissions?.length) {
            for (const s of raw.submissions) {
                const exists = await Submission.findOne({
                    studentId: s.studentId, weekId: s.weekId, questionId: s.questionId,
                });
                if (!exists) {
                    await Submission.create(s);
                }
            }
            console.log(`✅ Migrated ${raw.submissions.length} submissions from data.json`);
        }
    } catch (err) {
        console.error("Migration error:", err.message);
    }
}

// ── Routes ───────────────────────────────────────────────────────────────────
const authRoutes = require("./routes/auth");
const submissionRoutes = require("./routes/submissions");
const { router: githubRouter } = require("./routes/github");

app.use("/api/auth", authRoutes);
app.use("/api/submissions", submissionRoutes);
app.use("/api/github", githubRouter);

// GitHub OAuth callback (legacy path)
app.use("/auth/github", githubRouter);

// Config
const QUESTIONS_PATH = path.join(__dirname, "../questions.json");
app.get("/api/config", (req, res) => {
    res.json({ codeTimeMinutes: 30, explainTimeMinutes: 5 });
});

// Questions / Weeks
function loadQuestions() {
    try {
        return JSON.parse(fs.readFileSync(QUESTIONS_PATH, "utf-8"));
    } catch {
        return { weeks: [] };
    }
}

app.get("/api/weeks", (req, res) => {
    const data = loadQuestions();
    const weeks = (data.weeks || []).map((week) => ({
        id: week.id,
        title: week.title,
        summary: week.summary || "",
        questionCount: (week.questions || []).length,
    }));
    res.json(weeks);
});

app.get("/api/weeks/:weekId", (req, res) => {
    const data = loadQuestions();
    const week = (data.weeks || []).find((w) => w.id === req.params.weekId);
    if (!week) return res.status(404).json({ error: "Week not found" });
    res.json(week);
});

// Whisper transcription
const upload = multer({ dest: path.join(__dirname, "../uploads/") });
app.post("/api/transcribe", upload.single("audio"), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "No audio file provided" });
    const inputPath = path.resolve(req.file.path);
    try {
        const audioBuffer = fs.readFileSync(inputPath);
        const token = process.env.HUGGING_FACE_API_KEY || process.env.HF_TOKEN;

        if (!token) throw new Error("HUGGING_FACE_API_KEY is missing.");

        console.log("--- TRANSCRIPTION ATTEMPT V4 (Distil-Whisper) ---");
        const response = await axios.post(
            "https://router.huggingface.co/hf-inference/models/distil-whisper/distil-large-v3",
            audioBuffer,
            {
                headers: {
                    "Authorization": `Bearer ${token}`,
                    "Content-Type": "audio/webm",
                },
            }
        );

        console.log("Response from HF:", response.status);
        const transcript = response.data.text || response.data.transcript || "";
        res.json({ transcript: transcript.trim(), _v: "v4" });
        if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
    } catch (err) {
        console.error("Transcription Error:", err.response?.data || err.message);
        res.status(500).json({ error: (err.response?.data?.error || err.message) });
        if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
    }
});

// SPA fallback – serves frontend for all non-API routes (including /reset-password)
app.get("*", (req, res) => {
    res.sendFile(path.join(__dirname, "../frontend/index.html"));
});

// ── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
    console.log(`🚀 SkillCheckAI [V4] server running at http://localhost:${PORT}`);
});
