const express = require("express");
const router = express.Router();
const Submission = require("../models/Submission");

// ALL submissions (no date filter) – faculty dashboard
router.get("/all", async (req, res) => {
    try {
        const submissions = await Submission.find({}).sort({ createdAt: -1 });
        res.json(submissions);
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch submissions" });
    }
});

// All submissions for a week
router.get("/week/:weekId", async (req, res) => {
    try {
        const submissions = await Submission.find({ weekId: req.params.weekId }).sort({ createdAt: -1 });
        res.json(submissions);
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch submissions" });
    }
});

// Submissions for a student (and optionally a week)
router.get("/", async (req, res) => {
    const { studentId, weekId } = req.query;
    if (!studentId) return res.status(400).json({ error: "studentId is required" });
    try {
        const query = { studentId };
        if (weekId) query.weekId = weekId;
        const submissions = await Submission.find(query).sort({ createdAt: -1 });
        res.json(submissions);
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch submissions" });
    }
});

// Save / update a submission
router.post("/", async (req, res) => {
    const { studentId, studentName, rollNo, weekId, questionId, questionTitle, githubUrl, code, report, transcript } = req.body;
    if (!studentId || !studentName || !weekId || !questionId || !questionTitle) {
        return res.status(400).json({ error: "Missing required fields" });
    }
    try {
        let entry = await Submission.findOne({ studentId, weekId, questionId });
        if (!entry) {
            entry = new Submission({ studentId, studentName, rollNo, weekId, questionId, questionTitle });
        }
        if (rollNo) entry.rollNo = rollNo;
        if (questionTitle) entry.questionTitle = questionTitle;
        if (githubUrl) entry.githubUrl = githubUrl;
        if (code) entry.code = code;
        if (report) entry.report = report;
        if (transcript) entry.transcript = transcript;
        entry.updatedAt = new Date();
        entry.status = "submitted";
        await entry.save();
        res.json(entry);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to save submission" });
    }
});

module.exports = router;
