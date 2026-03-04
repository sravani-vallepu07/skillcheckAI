const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", "backend", ".env") });
const { sendWelcomeEmail } = require("../backend/email");

const testEmail = "sravanivallepu07@gmail.com"; // Testing with your own email

console.log("Starting email test to:", testEmail);
console.log("Using EMAIL_USER:", process.env.EMAIL_USER);

sendWelcomeEmail(testEmail, "Test User")
    .then(() => console.log("Test email sent success signal received."))
    .catch((err) => console.error("Test email FAILED:", err));
