require("dotenv").config();
const express = require("express");
const path = require("path");
const multer = require("multer");
const axios = require("axios");
const FormData = require("form-data");
const fs = require("fs");
const mongoose = require("mongoose");
const cors = require("cors");

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
        const formData = new FormData();
        // Use the original filename or default to .webm if missing
        const filename = req.file.originalname || "audio.webm";
        const contentType = req.file.mimetype || "audio/webm";

        formData.append("file", fs.createReadStream(inputPath), {
            filename: filename,
            contentType: contentType,
        });
        formData.append("model", "whisper-1");

        const response = await axios.post("https://api.openai.com/v1/audio/transcriptions", formData, {
            headers: {
                ...formData.getHeaders(),
                Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
            },
        });

        res.json({ transcript: response.data.text.trim() });
        if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
    } catch (err) {
        const errorMsg = err.response?.data?.error?.message || err.message || "Transcription failed";
        console.error("Whisper error detail:", errorMsg);
        res.status(500).json({ error: errorMsg });
        if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
    }
});

// SPA fallback – serves frontend for all non-API routes (including /reset-password)
app.get("*", (req, res) => {
    res.sendFile(path.join(__dirname, "../frontend/index.html"));
});

// ── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
    console.log(`🚀 SkillCheckAI server running at http://localhost:${PORT}`);
});
