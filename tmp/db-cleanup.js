const mongoose = require("mongoose");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../backend/.env") });

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/skillcheckai";

async function cleanup() {
    try {
        console.log("Connecting to MongoDB for cleanup...");
        await mongoose.connect(MONGODB_URI);
        console.log("Connected.");

        console.log("Deleting all users...");
        const UserResult = await mongoose.connection.collection("users").deleteMany({});
        console.log(`Deleted ${UserResult.deletedCount} users.`);

        console.log("Deleting all submissions...");
        const SubmissionResult = await mongoose.connection.collection("submissions").deleteMany({});
        console.log(`Deleted ${SubmissionResult.deletedCount} submissions.`);

        await mongoose.disconnect();
        console.log("Cleanup complete. Disconnected from MongoDB.");
    } catch (err) {
        console.error("Cleanup failed:", err);
    }
}

cleanup();
