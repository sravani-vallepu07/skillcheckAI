const { useEffect, useMemo, useRef, useState, useCallback } = React;

const STUDENT_EMAIL_PATTERN = /^n\d+@rguktn\.ac\.in$|^vallepus39@gmail\.com$/i;
const FACULTY_EMAIL_PATTERN = /rguktn\.ac\.in$|^sravanivallepu07@gmail\.com$/i;

// ── Helpers ──────────────────────────────────────────────────────────────────
function formatTime(msRemaining) {
    const totalSeconds = Math.max(0, Math.floor(msRemaining / 1000));
    const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
    const seconds = String(totalSeconds % 60).padStart(2, "0");
    return `${minutes}:${seconds}`;
}

function getDifficultyClass(level) {
    if (!level) return "easy";
    const n = level.toLowerCase();
    if (n.includes("hard")) return "hard";
    if (n.includes("medium")) return "medium";
    return "easy";
}

// Check if URL is reset-password page
function isResetRoute() {
    return window.location.pathname === "/reset-password";
}

function getResetToken() {
    return new URLSearchParams(window.location.search).get("token");
}

// ── Reset Password Page ──────────────────────────────────────────────────────
function ResetPasswordPage() {
    const token = getResetToken();
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [status, setStatus] = useState("");
    const [error, setError] = useState("");
    const [done, setDone] = useState(false);
    const [loading, setLoading] = useState(false);

    async function handleReset() {
        setError("");
        if (!newPassword.trim()) { setError("Please enter a new password."); return; }
        if (newPassword.length < 6) { setError("Password must be at least 6 characters."); return; }
        if (newPassword !== confirmPassword) { setError("Passwords do not match."); return; }
        setLoading(true);
        try {
            const res = await fetch("/api/auth/reset-password", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ token, newPassword }),
            });
            const data = await res.json();
            if (res.ok) {
                setStatus(data.message || "Password reset successful!");
                setDone(true);
            } else {
                setError(data.error || "Failed to reset password.");
            }
        } catch (e) {
            setError("Server error. Please try again.");
        }
        setLoading(false);
    }

    if (!token) {
        return (
            <div className="login-page-wrap">
                <div className="reset-card">
                    <h2 style={{ textAlign: "center", color: "var(--text)", marginTop: 0 }}>Invalid Link</h2>
                    <p style={{ textAlign: "center", color: "var(--muted)" }}>This password reset link is invalid or has expired.</p>
                    <a href="/" style={{ display: "block", textAlign: "center", marginTop: "20px", color: "var(--primary)", fontWeight: 600 }}>← Back to SkillCheckAI</a>
                </div>
            </div>
        );
    }

    if (done) {
        return (
            <div className="login-page-wrap">
                <div className="reset-card">
                    <h2 style={{ textAlign: "center", color: "var(--text)", marginTop: 0 }}>Password Updated!</h2>
                    <div className="notice success" style={{ textAlign: "center", marginBottom: "20px" }}>{status}</div>
                    <a href="/" className="primary auth-btn" style={{ display: "block", textAlign: "center", textDecoration: "none" }}>Login to SkillCheckAI →</a>
                </div>
            </div>
        );
    }

    return (
        <div className="login-page-wrap">
            <div className="login-brand">
                <div className="login-logo">
                    <span className="login-logo-name">SkillCheckAI</span>
                </div>
                <p className="login-tagline">Set your new password below</p>
            </div>
            <div className="reset-card">
                <h2 style={{ textAlign: "center", color: "var(--text)", margin: "0 0 24px", fontSize: "20px" }}>Reset Your Password</h2>

                <div style={{ display: "grid", gap: "16px" }}>
                    <label>
                        <span className="field-label">New Password</span>
                        <input
                            type="password"
                            placeholder="Enter new password (min 6 chars)"
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                        />
                    </label>
                    <label>
                        <span className="field-label">Confirm Password</span>
                        <input
                            type="password"
                            placeholder="Re-enter your new password"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && handleReset()}
                        />
                    </label>
                    {error && <div className="notice danger">{error}</div>}
                    <button className="primary auth-btn" type="button" onClick={handleReset} disabled={loading}>
                        {loading ? "Updating..." : "Update Password"}
                    </button>
                </div>

                <div style={{ textAlign: "center", marginTop: "20px" }}>
                    <a href="/" style={{ color: "var(--muted)", fontSize: "13px", textDecoration: "none" }}>← Back to SkillCheckAI</a>
                </div>
            </div>
        </div>
    );
}

// ── Main App ──────────────────────────────────────────────────────────────────
function App() {
    const [config, setConfig] = useState({ codeTimeMinutes: 30, explainTimeMinutes: 5 });
    const [weeks, setWeeks] = useState([]);

    // Session from sessionStorage (persists across page refreshes, not across closes)
    const [session, setSession] = useState(() => {
        try {
            const raw = localStorage.getItem("scai_session");
            return raw ? JSON.parse(raw) : null;
        } catch { return null; }
    });

    // Auth state
    const [loginRole, setLoginRole] = useState("student");
    const [authMode, setAuthMode] = useState("login"); // "login" | "register"
    const [loginEmail, setLoginEmail] = useState("");
    const [loginPassword, setLoginPassword] = useState("");
    const [loginConfirmPassword, setLoginConfirmPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [loginError, setLoginError] = useState("");
    const [emailExists, setEmailExists] = useState(null); // null = unchecked, true/false

    // Forgot password
    const [showForgot, setShowForgot] = useState(false);
    const [forgotEmail, setForgotEmail] = useState("");
    const [forgotMsg, setForgotMsg] = useState("");
    const [forgotErr, setForgotErr] = useState("");
    const [forgotLoading, setForgotLoading] = useState(false);

    // Student state
    const [activeWeek, setActiveWeek] = useState(null);
    const [activeQuestion, setActiveQuestion] = useState(null);
    const [studentStep, setStudentStep] = useState("weeks");

    const [studentCode, setStudentCode] = useState("");
    const [studentReport, setStudentReport] = useState("");
    const [studentTranscript, setStudentTranscript] = useState("");
    const [studentGithubUrl, setStudentGithubUrl] = useState("");
    const [studentStatus, setStudentStatus] = useState("");

    const [codeDeadline, setCodeDeadline] = useState(null);
    const [codeRemaining, setCodeRemaining] = useState(0);
    const [codeExpired, setCodeExpired] = useState(false);
    const [codingStarted, setCodingStarted] = useState(false);
    const [isCodingCompleted, setIsCodingCompleted] = useState(false);

    // GitHub
    const [githubConnected, setGithubConnected] = useState(false);
    const [githubUsername, setGithubUsername] = useState("");
    const [githubLoading, setGithubLoading] = useState(false);
    const [isPushing, setIsPushing] = useState(false);

    // Recording
    const [recordStatus, setRecordStatus] = useState("Not recording");
    const [isRecording, setIsRecording] = useState(false);
    const [isTranscribing, setIsTranscribing] = useState(false);
    const mediaRecorderRef = useRef(null);
    const audioChunksRef = useRef([]);

    // Faculty state
    const [facultyWeekId, setFacultyWeekId] = useState("");
    const [facultyStudents, setFacultyStudents] = useState([]);
    const [facultyStudentId, setFacultyStudentId] = useState("");
    const [facultyQuestions, setFacultyQuestions] = useState([]);
    const [facultyQuestion, setFacultyQuestion] = useState(null);

    const isStudent = session?.role === "student";
    const isFaculty = session?.role === "faculty";

    // ── Bootstrap ─────────────────────────────────────────────────────────────
    useEffect(() => {
        fetch("/api/config").then(r => r.json()).then(setConfig).catch(() => { });
        fetch("/api/weeks").then(r => r.json()).then(setWeeks).catch(() => { });
    }, []);

    // Persist session to localStorage (survives refresh and reopen)
    useEffect(() => {
        if (session) {
            localStorage.setItem("scai_session", JSON.stringify(session));
        } else {
            localStorage.removeItem("scai_session");
        }
    }, [session]);

    // Poll GitHub status
    useEffect(() => {
        if (session && studentStep === "coding") {
            const interval = setInterval(async () => {
                try {
                    const res = await fetch(`/api/github/status/${encodeURIComponent(session.email)}`);
                    const data = await res.json();
                    setGithubConnected(data.connected);
                    if (data.username) setGithubUsername(data.username);
                    if (data.connected) setGithubLoading(false);
                } catch (_) { }
            }, 3000);
            return () => clearInterval(interval);
        }
    }, [session, studentStep]);

    // Microphone setup
    useEffect(() => {
        if (!navigator.mediaDevices?.getUserMedia) {
            setRecordStatus("Recording not supported in this browser.");
            return;
        }
        navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
            const options = { mimeType: MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/mp4" };
            const mediaRecorder = new MediaRecorder(stream, options);

            mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) {
                    audioChunksRef.current.push(e.data);
                }
            };

            mediaRecorder.onstart = () => {
                setIsRecording(true);
                setRecordStatus("Recording your explanation...");
                audioChunksRef.current = [];
            };

            mediaRecorder.onstop = async () => {
                setIsRecording(false);
                setIsTranscribing(true);
                setRecordStatus("Transcribing...");

                const blobType = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/mp4";
                const audioBlob = new Blob(audioChunksRef.current, { type: blobType });

                if (audioBlob.size < 100) {
                    setRecordStatus("Error: No audio captured. Check mic permissions.");
                    setIsTranscribing(false);
                    return;
                }

                const formData = new FormData();
                formData.append("audio", audioBlob, blobType.includes("webm") ? "audio.webm" : "audio.mp4");

                try {
                    const res = await fetch("/api/transcribe", { method: "POST", body: formData });
                    const data = await res.json();
                    if (data.transcript) {
                        setStudentTranscript(data.transcript);
                        setRecordStatus("Transcription complete.");
                    } else {
                        throw new Error(data.error || "Server returned an empty response.");
                    }
                } catch (err) {
                    console.error("Transcription Error:", err);
                    setRecordStatus("Error: " + (err.message || "Could not connect to server."));
                }
                setIsTranscribing(false);
            };
            mediaRecorderRef.current = mediaRecorder;
        }).catch((err) => {
            console.error("Mic Access Error:", err);
            setRecordStatus("Microphone access denied.");
        });
    }, []);

    // Countdown timer
    useEffect(() => {
        if (!codeDeadline) { setCodeRemaining(0); return; }
        const update = () => {
            const remaining = codeDeadline - Date.now();
            if (remaining <= 0) {
                setCodeRemaining(0);
                setCodeDeadline(null);
                setCodeExpired(true);
                alert("Time's up! You have reached the 30-minute limit. Please submit your work now.");
                return;
            }
            setCodeRemaining(remaining);
        };
        update();
        const id = setInterval(update, 1000);
        return () => clearInterval(id);
    }, [codeDeadline]);

    // ── Email check (for Sign In vs Login button) ─────────────────────────────
    const checkEmailExists = useCallback(async (email, role) => {
        if (!email || email.length < 5) { setEmailExists(null); return; }
        try {
            const res = await fetch("/api/auth/check-email", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: email.trim(), role }),
            });
            const data = await res.json();
            setEmailExists(data.exists);
            setAuthMode(data.exists ? "login" : "register");
        } catch (_) { setEmailExists(null); }
    }, []);

    // ── Validation ────────────────────────────────────────────────────────────
    function validateLogin() {
        if (!loginEmail.trim() || !loginPassword.trim()) {
            setLoginError("Please enter email and password.");
            return false;
        }
        if (authMode === "register" && loginPassword !== loginConfirmPassword) {
            setLoginError("Passwords do not match.");
            return false;
        }
        if (authMode === "register" && loginPassword.length < 6) {
            setLoginError("Password must be at least 6 characters.");
            return false;
        }
        const email = loginEmail.trim().toLowerCase();
        if (loginRole === "student" && !STUDENT_EMAIL_PATTERN.test(email)) {
            setLoginError("Student email must be like n210577@rguktn.ac.in.");
            return false;
        }
        if (loginRole === "faculty" && !FACULTY_EMAIL_PATTERN.test(email)) {
            setLoginError("Faculty email must be like name@rguktn.ac.in.");
            return false;
        }
        setLoginError("");
        return true;
    }

    async function handleLogin() {
        if (!validateLogin()) return;
        try {
            const res = await fetch("/api/auth/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: loginEmail.trim(), password: loginPassword, role: loginRole }),
            });
            const data = await res.json();
            if (res.ok) {
                setSession({ role: data.role, email: data.email, name: data.name, rollNo: data.rollNo });
            } else {
                setLoginError(data.error);
            }
        } catch (err) {
            console.error("Login Error:", err);
            setLoginError("Connection refused. Please check if the server is running.");
        }
    }

    async function handleRegister() {
        if (!validateLogin()) return;
        try {
            const res = await fetch("/api/auth/register", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: loginEmail.trim(), password: loginPassword, role: loginRole }),
            });
            const data = await res.json();
            if (res.ok) {
                if (data.needsVerification) {
                    setLoginError("Verification link sent! Check your mail.");
                    setAuthMode("login");
                    setLoginPassword("");
                } else {
                    setSession({ role: data.role, email: data.email, name: data.name, rollNo: data.rollNo });
                }
            } else {
                setLoginError(data.error);
            }
        } catch (err) {
            console.error("Registration Error:", err);
            setLoginError("Connection refused. Please check if the server is running.");
        }
    }

    async function handleForgotPassword() {
        setForgotErr("");
        setForgotMsg("");
        const email = forgotEmail.trim() || loginEmail.trim();
        if (!email) { setForgotErr("Please enter your email address."); return; }
        setForgotLoading(true);
        try {
            const res = await fetch("/api/auth/forgot-password", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, role: loginRole }),
            });
            const data = await res.json();
            if (res.ok) {
                setForgotMsg(data.message || "Reset email sent! Please check your inbox.");
            } else {
                setForgotErr(data.error || "Failed to send reset email.");
            }
        } catch (_) { setForgotErr("Server error. Please try again."); }
        setForgotLoading(false);
    }

    function handleLogout() {
        setSession(null);
        setActiveWeek(null); setActiveQuestion(null); setStudentStep("weeks");
        setStudentCode(""); setStudentReport(""); setStudentTranscript("");
        setStudentGithubUrl(""); setStudentStatus("");
        setCodingStarted(false); setCodeDeadline(null);
        setCodeExpired(false); setIsCodingCompleted(false);
        setRecordStatus("Not recording"); setIsRecording(false);
        setFacultyWeekId(""); setFacultyStudents([]);
        setFacultyStudentId(""); setFacultyQuestions([]); setFacultyQuestion(null);
    }

    // ── Student nav ───────────────────────────────────────────────────────────
    async function openWeek(weekId) {
        const data = await fetch(`/api/weeks/${weekId}`).then(r => r.json());
        setActiveWeek(data);
        setStudentStep("questions");
    }

    function openQuestion(question) { setActiveQuestion(question); setStudentStep("question"); }

    function startCoding() {
        setStudentStep("coding");
        setCodeExpired(false);
        setCodingStarted(true);
        setCodeDeadline(Date.now() + config.codeTimeMinutes * 60 * 1000);
    }

    function stopRecord() { if (mediaRecorderRef.current && isRecording) mediaRecorderRef.current.stop(); }
    function startRecord() { if (mediaRecorderRef.current && !isRecording) mediaRecorderRef.current.start(); }

    function handleGithubConnect() {
        setGithubLoading(true);
        window.open(`/api/github/login?studentId=${encodeURIComponent(session.email)}`, "githubLogin", "width=600,height=700");
    }

    async function handleGithubPush() {
        setIsPushing(true);
        try {
            const repoName = `task-${activeWeek.id}-${activeQuestion.id}`;
            const res = await fetch("/api/github/push", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ studentId: session.email, repoName, code: studentCode, questionTitle: activeQuestion.title }),
            });
            const data = await res.json();
            if (data.url) {
                setStudentGithubUrl(data.url);
                setStudentStatus("Code pushed to GitHub successfully! ✅");
            } else {
                setStudentStatus(data.error || "Failed to push.");
            }
        } catch (_) { setStudentStatus("Error pushing to GitHub."); }
        setIsPushing(false);
    }

    async function submitStudentWork() {
        if (!studentGithubUrl.trim()) { setStudentStatus("Please push your code to GitHub first."); return; }
        if (!activeWeek || !activeQuestion) return;
        const res = await fetch("/api/submissions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                studentId: session.email, studentName: session.name,
                rollNo: session.rollNo,
                weekId: activeWeek.id, questionId: activeQuestion.id,
                questionTitle: activeQuestion.title,
                githubUrl: studentGithubUrl.trim(),
                code: studentCode.trim(),
                report: studentReport.trim(),
                transcript: studentTranscript.trim(),
            }),
        });
        if (!res.ok) {
            const err = await res.json();
            setStudentStatus(err.error || "Unable to submit.");
            return;
        }
        setStudentStatus("Submitted to faculty successfully!");
    }

    // ── Faculty ───────────────────────────────────────────────────────────────
    async function loadFacultyWeek(weekId) {
        setFacultyWeekId(weekId);
        setFacultyStudentId(""); setFacultyQuestion(null);
        const submissions = await fetch(`/api/submissions/week/${weekId}`).then(r => r.json());
        const unique = submissions.filter((v, i, a) => a.findIndex(t => t.studentId === v.studentId) === i);
        setFacultyStudents(unique.map(s => ({ email: s.studentId, studentName: s.studentName, rollNo: s.rollNo })));
    }

    async function loadFacultyStudent(studentId) {
        setFacultyStudentId(studentId); setFacultyQuestion(null);
        const submissions = await fetch(`/api/submissions?studentId=${encodeURIComponent(studentId)}&weekId=${facultyWeekId}`).then(r => r.json());
        setFacultyQuestions(submissions);
    }

    function resetStudentQuestion() {
        setActiveQuestion(null); setStudentStep("questions");
        setStudentCode(""); setStudentReport(""); setStudentTranscript("");
        setStudentGithubUrl(""); setStudentStatus("");
        setCodingStarted(false); setIsCodingCompleted(false);
        setCodeDeadline(null); setCodeExpired(false);
        setRecordStatus("Not recording"); stopRecord();
    }

    const selectedWeekTitle = useMemo(() => activeWeek?.title || "", [activeWeek]);

    // ── Route: Reset Password ─────────────────────────────────────────────────
    if (isResetRoute()) return <ResetPasswordPage />;

    // ── Route: Login ──────────────────────────────────────────────────────────
    if (!session) {
        const isNewUser = emailExists === false;
        const isKnownUser = emailExists === true;
        const btnLabel = isNewUser ? "Sign In" : (isKnownUser ? "Login" : (authMode === "register" ? "Sign In" : "Login"));

        return (
            <div className="login-page-wrap">
                {/* Brand */}
                <div className="login-brand">
                    <div className="login-logo">
                        <span className="login-logo-name">SkillCheckAI</span>
                    </div>
                    <p className="login-tagline">AI-Powered Code Review &amp; DSA Practice Platform</p>
                </div>

                <div className="login-card">
                    {/* Role Tabs */}
                    <div className="login-role-tabs">
                        <button className={`role-tab ${loginRole === "student" ? "active" : ""}`} type="button"
                            onClick={() => { setLoginRole("student"); setLoginError(""); setEmailExists(null); setLoginEmail(""); }}>
                            Student
                        </button>
                        <button className={`role-tab ${loginRole === "faculty" ? "active" : ""}`} type="button"
                            onClick={() => { setLoginRole("faculty"); setLoginError(""); setEmailExists(null); setLoginEmail(""); }}>
                            Faculty
                        </button>
                    </div>

                    {!showForgot ? (
                        <div className="login-actions">
                            {/* Email */}
                            <label>
                                <span className="field-label">Email Address</span>
                                <input
                                    type="email"
                                    placeholder={loginRole === "student" ? "n210577@rguktn.ac.in" : "name@rguktn.ac.in"}
                                    value={loginEmail}
                                    onChange={(e) => {
                                        setLoginEmail(e.target.value);
                                        setEmailExists(null);
                                        setLoginError("");
                                    }}
                                    onBlur={() => checkEmailExists(loginEmail, loginRole)}
                                />
                                {emailExists === false && (
                                    <span className="input-hint" style={{ color: "var(--accent)" }}>New here? We'll create your account.</span>
                                )}
                                {emailExists === true && (
                                    <span className="input-hint" style={{ color: "var(--muted)" }}>Welcome back! Please enter your password.</span>
                                )}
                            </label>

                            {/* Password */}
                            <label>
                                <span className="field-label">Password</span>
                                <div className="password-input-wrap">
                                    <input
                                        type={showPassword ? "text" : "password"}
                                        placeholder="Enter your password"
                                        value={loginPassword}
                                        onChange={(e) => { setLoginPassword(e.target.value); setLoginError(""); }}
                                        onKeyDown={(e) => e.key === "Enter" && (authMode === "login" ? handleLogin() : handleRegister())}
                                    />
                                    <button
                                        type="button"
                                        className="password-toggle-btn"
                                        onClick={() => setShowPassword(!showPassword)}
                                        title={showPassword ? "Hide password" : "Show password"}
                                    >
                                        {showPassword ? "👁️" : "👁️‍🗨️"}
                                    </button>
                                </div>
                            </label>

                            {/* Confirm Password (only for new users) */}
                            {authMode === "register" && (
                                <label>
                                    <span className="field-label">Confirm Password</span>
                                    <div className="password-input-wrap">
                                        <input
                                            type={showConfirmPassword ? "text" : "password"}
                                            placeholder="Re-enter your password"
                                            value={loginConfirmPassword}
                                            onChange={(e) => { setLoginConfirmPassword(e.target.value); setLoginError(""); }}
                                            onKeyDown={(e) => e.key === "Enter" && handleRegister()}
                                        />
                                        <button
                                            type="button"
                                            className="password-toggle-btn"
                                            onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                            title={showConfirmPassword ? "Hide password" : "Show password"}
                                        >
                                            {showConfirmPassword ? "👁️" : "👁️‍🗨️"}
                                        </button>
                                    </div>
                                </label>
                            )}

                            {/* Forgot password */}
                            <div style={{ textAlign: "right", marginTop: "-6px" }}>
                                <button className="forgot-link" type="button" onClick={() => { setShowForgot(true); setForgotMsg(""); setForgotErr(""); setForgotEmail(loginEmail); }}>
                                    Forgot Password?
                                </button>
                            </div>

                            {loginError && <div className="notice danger">{loginError}</div>}

                            <button
                                className="primary auth-btn"
                                type="button"
                                onClick={authMode === "login" ? handleLogin : handleRegister}
                            >
                                {btnLabel}
                            </button>

                            <div style={{ textAlign: "center", color: "var(--muted)", fontSize: "13px" }}>
                                {authMode === "login" ? (
                                    <>First time here?{" "}
                                        <button className="link-btn" type="button" onClick={() => { setAuthMode("register"); setLoginError(""); }}>Sign In</button>
                                    </>
                                ) : (
                                    <>Already have an account?{" "}
                                        <button className="link-btn" type="button" onClick={() => { setAuthMode("login"); setLoginError(""); }}>Login</button>
                                    </>
                                )}
                            </div>
                        </div>
                    ) : (
                        /* Forgot Password Panel */
                        <div className="forgot-panel">
                            <h3 style={{ margin: "0 0 6px", color: "var(--text)", fontSize: "16px" }}>🔐 Reset Password</h3>
                            <p style={{ margin: "0 0 16px", color: "var(--muted)", fontSize: "13px" }}>
                                Enter your registered email. We'll send you a password reset link.
                            </p>
                            <div style={{ display: "grid", gap: "12px" }}>
                                <label>
                                    <span className="field-label">Email Address</span>
                                    <input
                                        type="email"
                                        placeholder={loginRole === "student" ? "n210577@rguktn.ac.in" : "name@rguktn.ac.in"}
                                        value={forgotEmail}
                                        onChange={(e) => { setForgotEmail(e.target.value); setForgotErr(""); }}
                                        onKeyDown={(e) => e.key === "Enter" && handleForgotPassword()}
                                    />
                                </label>
                                {forgotErr && <div className="notice danger">{forgotErr}</div>}
                                {forgotMsg && <div className="notice success">📧 {forgotMsg}</div>}
                                <div style={{ display: "flex", gap: "10px" }}>
                                    <button className="primary" type="button" onClick={handleForgotPassword} disabled={forgotLoading} style={{ flex: 1 }}>
                                        {forgotLoading ? "Sending..." : "Send Reset Link"}
                                    </button>
                                    <button className="ghost" type="button" onClick={() => { setShowForgot(false); setForgotMsg(""); setForgotErr(""); }}>
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                <p style={{ textAlign: "center", color: "var(--muted)", fontSize: "12px", marginTop: "24px", opacity: 0.6 }}>
                    SkillCheckAI &bull; RGUKT &bull; Powered by AI
                </p>
            </div>
        );
    }

    // ── Main App (logged in) ──────────────────────────────────────────────────
    return (
        <div className="page">
            {/* Header */}
            <header className="app-header">
                <div className="header-text">
                    <h1>SkillCheckAI</h1>
                    <p>Lab-wise DSA practice, GitHub submissions &amp; voice explanations</p>
                </div>
                <div className="role-switch">
                    <span className="pill">{isStudent ? "Student" : "Faculty"}</span>
                    <span style={{ color: "var(--muted)", fontSize: "13px" }}>{session.email}</span>
                    <button className="ghost" type="button" onClick={handleLogout}>Logout</button>
                </div>
            </header>

            <main className="app-main">
                {/* ── Student Dashboard ─────────────────────────────────────────── */}
                {isStudent && (
                    <section className="card">
                        <div className="section-header">
                            <div>
                                <h2>Student Dashboard</h2>
                                <p className="input-hint">Logged in as {session.email}</p>
                            </div>
                            <span className="pill">{selectedWeekTitle || "Select a lab"}</span>
                        </div>

                        {/* Week list */}
                        {studentStep === "weeks" && (
                            <div className="list">
                                {weeks.map((week) => (
                                    <div className="list-card" key={week.id}>
                                        <div>
                                            <strong>{week.title}</strong>
                                            <p>{week.summary || `${week.questionCount} questions`}</p>
                                        </div>
                                        <button className="primary" type="button" onClick={() => openWeek(week.id)}>Open Lab</button>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Question list */}
                        {studentStep === "questions" && activeWeek && (
                            <>
                                <div className="breadcrumb">
                                    <button className="ghost back-btn" onClick={() => { setActiveWeek(null); setStudentStep("weeks"); }}>← Labs</button>
                                    <span>/</span>
                                    <span>{activeWeek.title}</span>
                                </div>
                                <div className="list" style={{ marginTop: "14px" }}>
                                    {activeWeek.questions.map((q) => (
                                        <div className="list-card" key={q.id}>
                                            <div>
                                                <strong>{q.title}</strong>
                                                <p>{q.summary}</p>
                                            </div>
                                            <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                                                <span className={`pill ${getDifficultyClass(q.difficulty)}`}>{q.difficulty}</span>
                                                <button className="primary" type="button" onClick={() => openQuestion(q)}>View</button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </>
                        )}

                        {/* Question detail */}
                        {studentStep === "question" && activeWeek && activeQuestion && (
                            <>
                                <div className="breadcrumb">
                                    <button className="ghost back-btn" onClick={() => setStudentStep("questions")}>← Questions</button>
                                </div>
                                <div className="question-block" style={{ marginTop: "14px" }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
                                        <h3>{activeQuestion.title}</h3>
                                        <span className={`pill ${getDifficultyClass(activeQuestion.difficulty)}`}>{activeQuestion.difficulty}</span>
                                    </div>
                                    <p>{activeQuestion.description}</p>
                                    <div className="examples">
                                        {activeQuestion.examples.map((ex, i) => (
                                            <div className="example-card" key={i}>Input: {ex.input}{"\n"}Output: {ex.output}</div>
                                        ))}
                                    </div>
                                    <button className="primary" type="button" onClick={startCoding} style={{ width: "fit-content" }}>
                                        Copy Code
                                    </button>
                                </div>
                            </>
                        )}

                        {/* Coding workspace */}
                        {studentStep === "coding" && activeWeek && activeQuestion && (
                            <>
                                <div className="breadcrumb">
                                    <button className="ghost back-btn" onClick={resetStudentQuestion}>← Questions</button>
                                    <span>/</span>
                                    <span>{activeQuestion.title}</span>
                                </div>
                                <div className="code-panel" style={{ marginTop: "14px" }}>
                                    {/* Question summary */}
                                    <div className="question-block" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", padding: "16px" }}>
                                        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                                            <h3 style={{ fontSize: "16px" }}>{activeQuestion.title}</h3>
                                            <span className={`pill ${getDifficultyClass(activeQuestion.difficulty)}`}>{activeQuestion.difficulty}</span>
                                        </div>
                                        <p style={{ fontSize: "14px" }}>{activeQuestion.description}</p>
                                        <div className="examples">
                                            {activeQuestion.examples.map((ex, i) => (
                                                <div className="example-card" key={i}>Input: {ex.input}{"\n"}Output: {ex.output}</div>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="code-columns">
                                        {/* Column 1: Code */}
                                        <div className="code-column">
                                            <div className="timer-card">
                                                <h3 style={{ margin: 0, fontSize: "14px" }}>⏱ Code Timer</h3>
                                                <div className="timer">{formatTime(codeRemaining)}</div>
                                                <span className={`status ${codeExpired ? "warning" : "success"}`}>
                                                    {codeExpired ? "Time over – stop working" : "Timer running"}
                                                </span>
                                            </div>
                                            <label style={{ flex: 1, display: "flex", flexDirection: "column", gap: "8px" }}>
                                                <span className="field-label">Code Editor</span>
                                                <textarea
                                                    style={{ flex: 1, minHeight: "280px" }}
                                                    value={studentCode}
                                                    onChange={(e) => setStudentCode(e.target.value)}
                                                    disabled={!codingStarted || codeExpired || isCodingCompleted}
                                                    placeholder="// Write your solution here..."
                                                />
                                            </label>
                                        </div>

                                        {/* Column 2: Report */}
                                        <div className="code-column">
                                            <h3>Written Report</h3>
                                            <p className="input-hint">Summarize your approach, edge cases &amp; complexity.</p>
                                            <textarea
                                                style={{ flex: 1, minHeight: "280px" }}
                                                placeholder="Explain your logic, edge cases, time/space complexity..."
                                                value={studentReport}
                                                onChange={(e) => setStudentReport(e.target.value)}
                                                disabled={!codingStarted || codeExpired || isCodingCompleted}
                                            />
                                            {!isCodingCompleted && (
                                                <button className="primary build" type="button" onClick={() => setIsCodingCompleted(true)} disabled={codeExpired}>
                                                    Complete Code &amp; Report
                                                </button>
                                            )}
                                            {isCodingCompleted && (
                                                <div className="notice success" style={{ textAlign: "center" }}>Code & report locked</div>
                                            )}
                                        </div>

                                        {/* Column 3: Voice + GitHub */}
                                        <div className="code-column">
                                            <h3>Voice &amp; GitHub</h3>
                                            {isCodingCompleted ? (
                                                <>
                                                    <div className="record-controls">
                                                        <button className="primary" type="button" onClick={startRecord} disabled={isRecording || isTranscribing}>
                                                            {isRecording ? "Recording..." : "Start Recording"}
                                                        </button>
                                                        <button className="ghost" type="button" onClick={stopRecord} disabled={!isRecording}>Stop</button>
                                                        <span className="status">{recordStatus}</span>
                                                    </div>
                                                    <textarea
                                                        style={{ flex: 1, minHeight: "150px" }}
                                                        placeholder="Speech-to-text will appear here via Whisper..."
                                                        value={studentTranscript}
                                                        onChange={(e) => setStudentTranscript(e.target.value)}
                                                    />

                                                    <div style={{ marginTop: "auto", display: "grid", gap: "10px" }}>
                                                        <h3 style={{ margin: 0, fontSize: "14px" }}>GitHub Push</h3>
                                                        {githubConnected ? (
                                                            <>
                                                                <div className="notice success">Connected as {githubUsername || "GitHub User"}</div>
                                                                <button className="primary" type="button" onClick={handleGithubPush} disabled={isPushing}>
                                                                    {isPushing ? "Pushing..." : "⬆ Push Code"}
                                                                </button>
                                                            </>
                                                        ) : (
                                                            <button className="primary alt" type="button" onClick={handleGithubConnect} disabled={githubLoading}>
                                                                {githubLoading ? "Connecting..." : "Connect GitHub"}
                                                            </button>
                                                        )}
                                                        <label>
                                                            <span className="field-label">GitHub Repo Link</span>
                                                            <input type="url" readOnly placeholder="Link will appear after push..." value={studentGithubUrl} />
                                                        </label>
                                                        <button className="primary build" type="button" onClick={submitStudentWork}>
                                                            Submit All to Faculty
                                                        </button>
                                                    </div>
                                                </>
                                            ) : (
                                                <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", color: "var(--muted)", padding: "20px" }}>
                                                    <div>
                                                        <p>Complete your Code &amp; Report first to unlock Voice Explanation.</p>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {studentStatus && (
                                        <div className={`notice ${studentStatus.includes("successfully") ? "success" : "warn"}`}>
                                            {studentStatus}
                                        </div>
                                    )}
                                </div>
                            </>
                        )}
                    </section>
                )}

                {/* ── Faculty Dashboard ──────────────────────────────────────────── */}
                {isFaculty && (
                    <section className="card">
                        <div className="section-header">
                            <div>
                                <h2>Faculty Dashboard</h2>
                                <p className="input-hint">Viewing all student submissions – {session.email}</p>
                            </div>
                            <span className="pill">Review Submissions</span>
                        </div>

                        {/* Week selection */}
                        {!facultyWeekId && (
                            <div className="list">
                                {weeks.map((week) => (
                                    <div className="list-card" key={week.id}>
                                        <div>
                                            <strong>{week.title}</strong>
                                            <p>{week.summary || `${week.questionCount} questions`}</p>
                                        </div>
                                        <button className="primary" type="button" onClick={() => loadFacultyWeek(week.id)}>View Students</button>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Student list */}
                        {facultyWeekId && !facultyStudentId && (
                            <>
                                <div className="breadcrumb">
                                    <button className="ghost back-btn" onClick={() => setFacultyWeekId("")}>← Labs</button>
                                    <span>/</span>
                                    <span>{weeks.find(w => w.id === facultyWeekId)?.title}</span>
                                </div>
                                <div className="list" style={{ marginTop: "14px" }}>
                                    {facultyStudents.length === 0 && (
                                        <div className="notice">No submissions yet for this week.</div>
                                    )}
                                    {facultyStudents.map((student) => (
                                        <div className="list-card" key={student}>
                                            <div>
                                                <strong>{student.studentName || student.email} ({student.rollNo || "No Roll No"})</strong>
                                                <p>Click to review this student's attempts</p>
                                            </div>
                                            <button className="primary" type="button" onClick={() => loadFacultyStudent(student)}>Open</button>
                                        </div>
                                    ))}
                                </div>
                            </>
                        )}

                        {/* Questions list for student */}
                        {facultyWeekId && facultyStudentId && !facultyQuestion && (
                            <>
                                <div className="breadcrumb">
                                    <button className="ghost back-btn" onClick={() => setFacultyStudentId("")}>← Students</button>
                                    <span>/</span>
                                    <span>{facultyStudentId}</span>
                                </div>
                                <div className="list" style={{ marginTop: "14px" }}>
                                    {facultyQuestions.length === 0 && (
                                        <div className="notice">No questions submitted yet.</div>
                                    )}
                                    {facultyQuestions.map((item) => (
                                        <div className="list-card" key={item._id || item.id}>
                                            <div>
                                                <strong>{item.questionTitle}</strong>
                                                <p>{item.githubUrl || "No GitHub link yet"} &bull; {item.updatedAt ? new Date(item.updatedAt).toLocaleString() : ""}</p>
                                            </div>
                                            <button className="primary" type="button" onClick={() => setFacultyQuestion(item)}>View</button>
                                        </div>
                                    ))}
                                </div>
                            </>
                        )}

                        {/* Detailed submission view */}
                        {facultyQuestion && (
                            <>
                                <div className="breadcrumb">
                                    <button className="ghost back-btn" onClick={() => setFacultyQuestion(null)}>← Questions</button>
                                    <span>/</span>
                                    <span>{facultyQuestion.questionTitle}</span>
                                </div>
                                <div className="question-block" style={{ marginTop: "14px" }}>
                                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px" }}>
                                        <h3>{facultyQuestion.questionTitle}</h3>
                                        <span className="pill success">
                                            {facultyQuestion.status || "submitted"}
                                        </span>
                                    </div>

                                    {facultyQuestion.studentId && (
                                        <p style={{ margin: "0 0 10px", color: "var(--muted)" }}>Student: {facultyQuestion.studentName || facultyQuestion.studentId} ({facultyQuestion.rollNo || "No Roll No"})</p>
                                    )}

                                    {facultyQuestion.submittedAt && (
                                        <p className="input-hint">Submitted: {new Date(facultyQuestion.updatedAt || facultyQuestion.createdAt).toLocaleString()}</p>
                                    )}

                                    <div className="notice">
                                        🔗 GitHub:{" "}
                                        {facultyQuestion.githubUrl ? (
                                            <a href={facultyQuestion.githubUrl} target="_blank" rel="noreferrer" style={{ color: "var(--primary)" }}>
                                                {facultyQuestion.githubUrl}
                                            </a>
                                        ) : "Not provided"}
                                    </div>

                                    <div className="card light">
                                        <h4 style={{ margin: "0 0 10px", color: "var(--text)" }}>Code</h4>
                                        <pre className="example-card" style={{ margin: 0, overflowX: "auto" }}>
                                            {facultyQuestion.code || "No code submitted."}
                                        </pre>
                                    </div>

                                    <div className="card light">
                                        <h4 style={{ margin: "0 0 10px", color: "var(--text)" }}>Voice Explanation Transcript</h4>
                                        <p style={{ margin: 0, color: "var(--muted)", whiteSpace: "pre-wrap" }}>
                                            {facultyQuestion.transcript || "No transcript submitted."}
                                        </p>
                                    </div>
                                </div>
                            </>
                        )}
                    </section>
                )}
            </main>
        </div>
    );
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<App />);
