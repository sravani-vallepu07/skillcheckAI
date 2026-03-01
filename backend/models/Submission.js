const mongoose = require("mongoose");

const submissionSchema = new mongoose.Schema({
    studentId: { type: String, required: true },
    studentName: { type: String, required: true },
    weekId: { type: String, required: true },
    questionId: { type: String, required: true },
    questionTitle: { type: String, default: "" },
    githubUrl: { type: String, default: "" },
    code: { type: String, default: "" },
    transcript: { type: String, default: "" },
    status: { type: String, default: "submitted" },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
});

// Unique per student+week+question combo
submissionSchema.index(
    { studentId: 1, weekId: 1, questionId: 1 },
    { unique: true }
);

module.exports = mongoose.model("Submission", submissionSchema);
