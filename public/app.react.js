const { useEffect, useMemo, useRef, useState } = React;

const STUDENT_EMAIL_PATTERN = /^n\d+@rguktn\.ac\.in$/i;
const FACULTY_EMAIL_PATTERN = /^[a-z0-9._%+-]+@rguktn\.ac\.in$/i;

function formatTime(msRemaining) {
  const totalSeconds = Math.max(0, Math.floor(msRemaining / 1000));
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function getDifficultyClass(level) {
  if (!level) return "easy";
  const normalized = level.toLowerCase();
  if (normalized.includes("hard")) return "hard";
  if (normalized.includes("medium")) return "medium";
  return "easy";
}

function App() {
  const [config, setConfig] = useState({ codeTimeMinutes: 30, explainTimeMinutes: 5 });
  const [weeks, setWeeks] = useState([]);

  const [session, setSession] = useState(() => {
    const raw = sessionStorage.getItem("scr_session");
    return raw ? JSON.parse(raw) : null;
  });

  const [loginRole, setLoginRole] = useState("student");
  const [authMode, setAuthMode] = useState("login");
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginConfirmPassword, setLoginConfirmPassword] = useState("");
  const [loginError, setLoginError] = useState("");

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
  const [githubConnected, setGithubConnected] = useState(false);
  const [githubUsername, setGithubUsername] = useState("");
  const [isPushing, setIsPushing] = useState(false);

  const [recordStatus, setRecordStatus] = useState("Not recording");
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  const [facultyWeekId, setFacultyWeekId] = useState("");
  const [facultyStudents, setFacultyStudents] = useState([]);
  const [facultyStudentId, setFacultyStudentId] = useState("");
  const [facultyQuestions, setFacultyQuestions] = useState([]);
  const [facultyQuestion, setFacultyQuestion] = useState(null);

  const isStudent = session?.role === "student";
  const isFaculty = session?.role === "faculty";

  useEffect(() => {
    async function fetchConfig() {
      const response = await fetch("/api/config");
      const data = await response.json();
      setConfig(data);
    }

    async function fetchWeeks() {
      const response = await fetch("/api/weeks");
      const data = await response.json();
      setWeeks(data);
    }

    fetchConfig();
    fetchWeeks();
  }, []);

  useEffect(() => {
    sessionStorage.setItem("scr_session", session ? JSON.stringify(session) : "");
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
        } catch (e) { }
      }, 3000);
      return () => clearInterval(interval);
    }
  }, [session, studentStep]);

  useEffect(() => {
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
        const mediaRecorder = new MediaRecorder(stream);
        mediaRecorder.ondataavailable = (e) => {
          if (e.data.size > 0) audioChunksRef.current.push(e.data);
        };
        mediaRecorder.onstart = () => {
          setIsRecording(true);
          setRecordStatus("Recording...");
          audioChunksRef.current = [];
        };
        mediaRecorder.onstop = async () => {
          setIsRecording(false);
          setIsTranscribing(true);
          setRecordStatus("Transcribing with Whisper...");

          const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
          const formData = new FormData();
          formData.append("audio", audioBlob, "audio.webm");

          try {
            const res = await fetch("/api/transcribe", {
              method: "POST",
              body: formData
            });
            const data = await res.json();
            if (data.transcript) {
              setStudentTranscript(data.transcript);
              setRecordStatus("Transcription complete.");
            } else {
              setRecordStatus("Transcription failed.");
            }
          } catch (err) {
            setRecordStatus("Transcription error.");
          }
          setIsTranscribing(false);
        };
        mediaRecorderRef.current = mediaRecorder;
      }).catch(err => {
        setRecordStatus("Microphone access denied.");
      });
    } else {
      setRecordStatus("MediaRecorder not supported.");
    }
  }, []);

  useEffect(() => {
    if (!codeDeadline) {
      setCodeRemaining(0);
      return;
    }
    const update = () => {
      const remaining = codeDeadline - Date.now();
      if (remaining <= 0) {
        setCodeRemaining(0);
        setCodeDeadline(null);
        setCodeExpired(true);
        alert("Time is up! You have reached the 30-minute limit. Please submit your work now.");
        return;
      }
      setCodeRemaining(remaining);
    };
    update();
    const intervalId = setInterval(update, 1000);
    return () => clearInterval(intervalId);
  }, [codeDeadline]);

  const selectedWeekTitle = useMemo(() => {
    return activeWeek?.title || "";
  }, [activeWeek]);

  function validateLogin() {
    if (!loginEmail.trim() || !loginPassword.trim()) {
      setLoginError("Please enter email and password.");
      return false;
    }
    if (authMode === "register" && loginPassword !== loginConfirmPassword) {
      setLoginError("Passwords do not match.");
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
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: loginEmail.trim(), password: loginPassword, role: loginRole })
      });
      const data = await response.json();
      if (response.ok) {
        setSession({ role: data.role, email: data.email, name: data.name });
        alert(`Successfully logged in as ${data.role === 'faculty' ? 'Faculty' : 'Student'} (${data.email})`);
      } else {
        setLoginError(data.error);
      }
    } catch (e) {
      setLoginError("Server error. Could not login.");
    }
  }

  async function handleRegister() {
    if (!validateLogin()) return;
    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: loginEmail.trim(), password: loginPassword, role: loginRole })
      });
      const data = await response.json();
      if (response.ok) {
        setSession({ role: data.role, email: data.email, name: data.name });
        alert(`Successfully created account and logged in as ${data.role === 'faculty' ? 'Faculty' : 'Student'} (${data.email})`);
      } else {
        setLoginError(data.error);
      }
    } catch (e) {
      setLoginError("Server error. Could not register.");
    }
  }

  function handleLogout() {
    setSession(null);
    setActiveWeek(null);
    setActiveQuestion(null);
    setStudentStep("weeks");
    setStudentCode("");
    setStudentReport("");
    setStudentTranscript("");
    setStudentGithubUrl("");
    setCodingStarted(false);
    setCodeDeadline(null);
    setCodeExpired(false);
    setRecordStatus("Not recording");
    setIsRecording(false);
    setFacultyWeekId("");
    setFacultyStudents([]);
    setFacultyStudentId("");
    setFacultyQuestions([]);
    setFacultyQuestion(null);
  }

  async function openWeek(weekId) {
    const response = await fetch(`/api/weeks/${weekId}`);
    const data = await response.json();
    setActiveWeek(data);
    setStudentStep("questions");
  }

  function openQuestion(question) {
    setActiveQuestion(question);
    setStudentStep("question");
  }

  function startCoding() {
    setStudentStep("coding");
    setCodeExpired(false);
    setCodingStarted(true);
    setCodeDeadline(Date.now() + config.codeTimeMinutes * 60 * 1000);
  }

  function stopRecord() {
    if (!mediaRecorderRef.current || !isRecording) {
      return;
    }
    mediaRecorderRef.current.stop();
  }

  function startRecord() {
    if (!mediaRecorderRef.current || isRecording) {
      return;
    }
    mediaRecorderRef.current.start();
  }

  function handleGithubConnect() {
    const url = `/api/github/login?studentId=${encodeURIComponent(session.email)}`;
    window.open(url, "githubLogin", "width=600,height=700");
  }

  async function handleGithubPush() {
    setIsPushing(true);
    try {
      const repoName = `task-${activeWeek.id}-${activeQuestion.id}`;
      const res = await fetch("/api/github/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId: session.email,
          repoName,
          code: studentCode,
          questionTitle: activeQuestion.title
        })
      });
      const data = await res.json();
      if (data.url) {
        setStudentGithubUrl(data.url);
        setStudentStatus("Code pushed to GitHub successfully!");
      } else {
        setStudentStatus(data.error || "Failed to push.");
      }
    } catch (e) {
      setStudentStatus("Error pushing to GitHub.");
    }
    setIsPushing(false);
  }

  async function submitStudentWork() {
    if (!studentGithubUrl.trim()) {
      setStudentStatus("Please paste your GitHub link before submitting.");
      return;
    }
    if (!activeWeek || !activeQuestion) {
      return;
    }
    const payload = {
      studentId: session.email,
      studentName: session.name,
      weekId: activeWeek.id,
      questionId: activeQuestion.id,
      questionTitle: activeQuestion.title,
      githubUrl: studentGithubUrl.trim(),
      code: studentCode.trim(),
      report: studentReport.trim(),
      transcript: studentTranscript.trim()
    };
    const response = await fetch("/api/submissions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      const error = await response.json();
      setStudentStatus(error.error || "Unable to submit.");
      return;
    }
    setStudentStatus("Submitted to faculty successfully.");
  }

  async function loadFacultyWeek(weekId) {
    setFacultyWeekId(weekId);
    setFacultyStudentId("");
    setFacultyQuestion(null);
    const response = await fetch(`/api/submissions/week/${weekId}`);
    const submissions = await response.json();
    const unique = Array.from(new Set(submissions.map((item) => item.studentId)));
    setFacultyStudents(unique);
  }

  async function loadFacultyStudent(studentId) {
    setFacultyStudentId(studentId);
    setFacultyQuestion(null);
    const response = await fetch(
      `/api/submissions?studentId=${encodeURIComponent(studentId)}&weekId=${facultyWeekId}`
    );
    const submissions = await response.json();
    setFacultyQuestions(submissions);
  }

  function resetStudentQuestion() {
    setActiveQuestion(null);
    setStudentStep("questions");
    setStudentCode("");
    setStudentReport("");
    setStudentTranscript("");
    setStudentGithubUrl("");
    setStudentStatus("");
    setCodingStarted(false);
    setIsCodingCompleted(false);
    setCodeDeadline(null);
    setCodeExpired(false);
    setRecordStatus("Not recording");
    stopRecord();
  }

  function resetStudentWeek() {
    setActiveWeek(null);
    setActiveQuestion(null);
    setStudentStep("weeks");
  }

  if (!session) {
    return (
      <div className="page narrow" style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', justifyContent: 'center' }}>
        <div className="login-shell" style={{ width: '100%', maxWidth: '440px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '32px' }}>
            <h1 style={{ fontSize: '32px', margin: '0 0 8px 0', color: 'var(--text)', letterSpacing: '-0.5px' }}>CodeReview Pro</h1>
            <p style={{ margin: 0, color: 'var(--muted)', fontSize: '16px' }}>Secure portal for students and faculty</p>
          </div>

          <div className="card" style={{ padding: '40px', borderRadius: '24px', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.1)' }}>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', background: '#f1f5f9', padding: '4px', borderRadius: '12px' }}>
              <button
                style={{ flex: 1, padding: '10px', borderRadius: '8px', border: 'none', background: loginRole === 'student' ? '#fff' : 'transparent', color: loginRole === 'student' ? 'var(--primary-dark)' : 'var(--muted)', fontWeight: loginRole === 'student' ? '700' : '500', boxShadow: loginRole === 'student' ? '0 2px 4px rgba(0,0,0,0.05)' : 'none', cursor: 'pointer', transition: 'all 0.2s' }}
                type="button"
                onClick={() => setLoginRole("student")}
              >
                Student
              </button>
              <button
                style={{ flex: 1, padding: '10px', borderRadius: '8px', border: 'none', background: loginRole === 'faculty' ? '#fff' : 'transparent', color: loginRole === 'faculty' ? 'var(--primary-dark)' : 'var(--muted)', fontWeight: loginRole === 'faculty' ? '700' : '500', boxShadow: loginRole === 'faculty' ? '0 2px 4px rgba(0,0,0,0.05)' : 'none', cursor: 'pointer', transition: 'all 0.2s' }}
                type="button"
                onClick={() => setLoginRole("faculty")}
              >
                Faculty
              </button>
            </div>

            <div className="login-actions" style={{ gap: '20px' }}>
              <label style={{ gap: '6px' }}>
                <span style={{ fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--muted)', fontWeight: '700' }}>Email Address</span>
                <input
                  type="email"
                  placeholder={loginRole === "student" ? "n210577@rguktn.ac.in" : "name@rguktn.ac.in"}
                  value={loginEmail}
                  onChange={(event) => setLoginEmail(event.target.value)}
                  style={{ padding: '12px 16px', fontSize: '15px' }}
                />
              </label>
              <label style={{ gap: '6px' }}>
                <span style={{ fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--muted)', fontWeight: '700' }}>Password</span>
                <input
                  type="password"
                  placeholder="Enter your password"
                  value={loginPassword}
                  onChange={(event) => setLoginPassword(event.target.value)}
                  style={{ padding: '12px 16px', fontSize: '15px' }}
                />
              </label>
              {authMode === "register" && (
                <label style={{ gap: '6px' }}>
                  <span style={{ fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--muted)', fontWeight: '700' }}>Confirm Password</span>
                  <input
                    type="password"
                    placeholder="Confirm your password"
                    value={loginConfirmPassword}
                    onChange={(event) => setLoginConfirmPassword(event.target.value)}
                    style={{ padding: '12px 16px', fontSize: '15px' }}
                  />
                </label>
              )}
              {loginError && <div className="notice warn" style={{ borderRadius: '8px', padding: '10px 14px' }}>{loginError}</div>}

              <button
                className="primary"
                type="button"
                onClick={authMode === "login" ? handleLogin : handleRegister}
                style={{ marginTop: '8px', padding: '14px', fontSize: '16px', borderRadius: '12px', background: 'var(--primary-dark)' }}
              >
                {authMode === "login" ? "Sign In" : "Sign Up"}
              </button>

              <div style={{ textAlign: 'center', marginTop: '16px' }}>
                {authMode === "login" ? (
                  <>
                    <span style={{ color: 'var(--muted)', fontSize: '14px' }}>First time here? </span>
                    <button
                      type="button"
                      onClick={() => { setAuthMode("register"); setLoginError(""); }}
                      style={{ background: 'none', border: 'none', color: 'var(--primary)', fontWeight: '600', cursor: 'pointer', padding: 0, fontSize: '14px' }}
                    >
                      Sign Up
                    </button>
                  </>
                ) : (
                  <>
                    <span style={{ color: 'var(--muted)', fontSize: '14px' }}>Already have an account? </span>
                    <button
                      type="button"
                      onClick={() => { setAuthMode("login"); setLoginError(""); }}
                      style={{ background: 'none', border: 'none', color: 'var(--primary)', fontWeight: '600', cursor: 'pointer', padding: 0, fontSize: '14px' }}
                    >
                      Sign In
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <header className="app-header">
        <div className="header-text">
          <h1>Student Code Review Portal</h1>
          <p>Weekly DSA practice, GitHub submissions, and voice explanations.</p>
        </div>
        <div className="role-switch">
          <span className="pill">{isStudent ? "Student" : "Faculty"}</span>
          <button className="ghost" type="button" onClick={handleLogout}>
            Logout
          </button>
        </div>
      </header>

      <main className="app-main">
        {isStudent && (
          <section className="card">
            <div className="section-header">
              <div>
                <h2>Student Dashboard</h2>
                <p className="input-hint">Logged in as {session.email}</p>
              </div>
              <span className="pill">{selectedWeekTitle || "Select a week"}</span>
            </div>

            {studentStep === "weeks" && (
              <div className="list">
                {weeks.map((week) => (
                  <div className="list-card" key={week.id}>
                    <div>
                      <strong>{week.title}</strong>
                      <p>{week.summary || `${week.questionCount} questions`}</p>
                    </div>
                    <button className="primary" type="button" onClick={() => openWeek(week.id)}>
                      Open
                    </button>
                  </div>
                ))}
              </div>
            )}

            {studentStep === "questions" && activeWeek && (
              <>
                <div className="breadcrumb">
                  <button className="ghost back-btn" type="button" onClick={resetStudentWeek}>
                    ← Back to weeks
                  </button>
                </div>
                <div className="list">
                  {activeWeek.questions.map((question) => (
                    <div className="list-card" key={question.id}>
                      <div>
                        <strong>{question.title}</strong>
                        <p>{question.summary}</p>
                      </div>
                      <div className="grid two" style={{ alignItems: "center" }}>
                        <span className={`pill ${getDifficultyClass(question.difficulty)}`}>
                          {question.difficulty}
                        </span>
                        <button className="primary" type="button" onClick={() => openQuestion(question)}>
                          View
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {studentStep === "question" && activeWeek && activeQuestion && (
              <>
                <div className="breadcrumb">
                  <button className="ghost back-btn" type="button" onClick={() => setStudentStep("questions")}>
                    ← Back to questions
                  </button>
                </div>
                <div className="question-block">
                  <div>
                    <h3>{activeQuestion.title}</h3>
                    <span className={`pill ${getDifficultyClass(activeQuestion.difficulty)}`}>
                      {activeQuestion.difficulty}
                    </span>
                  </div>
                  <p>{activeQuestion.description}</p>
                  <div className="examples">
                    {activeQuestion.examples.map((example, index) => (
                      <div className="example-card" key={index}>
                        Input: {example.input}
                        {"\n"}
                        Output: {example.output}
                      </div>
                    ))}
                  </div>
                  <button className="primary" type="button" onClick={startCoding}>
                    Start Coding
                  </button>
                </div>
              </>
            )}

            {studentStep === "coding" && activeWeek && activeQuestion && (
              <>
                <div className="breadcrumb">
                  <button className="ghost back-btn" type="button" onClick={resetStudentQuestion}>
                    ← Back to questions
                  </button>
                </div>
                <div className="code-panel">
                  <div className="question-block">
                    <div>
                      <h3>{activeQuestion.title}</h3>
                      <span className={`pill ${getDifficultyClass(activeQuestion.difficulty)}`}>
                        {activeQuestion.difficulty}
                      </span>
                    </div>
                    <p>{activeQuestion.description}</p>
                    <div className="examples">
                      {activeQuestion.examples.map((example, index) => (
                        <div className="example-card" key={index}>
                          Input: {example.input}
                          {"\n"}
                          Output: {example.output}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="code-columns">
                    {/* Column 1: Code */}
                    <div className="code-column">
                      <div className="timer-card">
                        <h3>Code & GitHub</h3>
                        <div className="timer">{formatTime(codeRemaining)}</div>
                        <span className={`status ${codeExpired ? "warning" : "success"}`}>
                          {codeExpired ? "Time over - stop working" : "Timer running"}
                        </span>
                      </div>
                      <label style={{ display: 'flex', flexDirection: 'column', flex: 1, gap: '8px' }}>
                        Code Editor
                        <textarea
                          value={studentCode}
                          onChange={(event) => setStudentCode(event.target.value)}
                          disabled={!codingStarted || codeExpired || isCodingCompleted}
                          placeholder="Write your solution here..."
                        />
                      </label>
                    </div>

                    {/* Column 2: Report */}
                    <div className="code-column">
                      <h3>Written Report</h3>
                      <p className="input-hint">Summarize your approach.</p>
                      <textarea
                        placeholder="Explain your logic, edge cases, and complexity..."
                        value={studentReport}
                        onChange={(event) => setStudentReport(event.target.value)}
                        disabled={!codingStarted || codeExpired || isCodingCompleted}
                      />

                      {!isCodingCompleted && (
                        <button className="primary" type="button" onClick={() => setIsCodingCompleted(true)} disabled={codeExpired}>
                          Complete Code & Report
                        </button>
                      )}
                    </div>

                    {/* Column 3: Voice */}
                    <div className="code-column">
                      <h3>Voice Explanation & Push</h3>
                      {isCodingCompleted ? (
                        <>
                          <div className="record-controls">
                            <button
                              className="primary"
                              type="button"
                              onClick={startRecord}
                              disabled={isRecording || isTranscribing}
                            >
                              Start Rec
                            </button>
                            <button className="ghost" type="button" onClick={stopRecord} disabled={!isRecording}>
                              Stop
                            </button>
                            <span className="status">{recordStatus}</span>
                          </div>
                          <textarea
                            placeholder="Speech to text will appear here after transcribing via Whisper..."
                            value={studentTranscript}
                            onChange={(event) => setStudentTranscript(event.target.value)}
                          />

                          <div style={{ marginTop: 'auto' }}>
                            <h3 style={{ marginTop: '16px' }}>GitHub Output</h3>
                            {githubConnected ? (
                              <>
                                <p className="notice success" style={{ margin: '8px 0' }}>GitHub Connected{githubUsername ? ` as ${githubUsername}` : ""}</p>
                                <button className="primary" type="button" style={{ width: '100%' }} onClick={handleGithubPush} disabled={isPushing}>
                                  {isPushing ? "Pushing..." : "Push Code"}
                                </button>
                              </>
                            ) : (
                              <button className="primary alt" type="button" style={{ width: '100%', margin: '8px 0' }} onClick={handleGithubConnect}>
                                Connect GitHub account
                              </button>
                            )}

                            <label style={{ display: 'flex', flexDirection: 'column', marginTop: "10px" }}>
                              GitHub Repo Link
                              <input
                                type="url"
                                readOnly
                                placeholder="Link will appear after push..."
                                value={studentGithubUrl}
                              />
                            </label>

                            <button className="primary build" type="button" onClick={submitStudentWork} style={{ marginTop: "16px", width: '100%' }}>
                              Submit All to Faculty
                            </button>
                          </div>
                        </>
                      ) : (
                        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', color: '#64748b', padding: '20px' }}>
                          <p>Please complete your Code & Report to unlock Voice Explanation.</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {studentStatus && (
                    <div className={`notice ${studentStatus.includes("success") ? "success" : "warn"}`}>
                      {studentStatus}
                    </div>
                  )}
                </div>
              </>
            )}
          </section>
        )}

        {isFaculty && (
          <section className="card">
            <div className="section-header">
              <div>
                <h2>Faculty Dashboard</h2>
                <p className="input-hint">Logged in as {session.email}</p>
              </div>
              <span className="pill">Review submissions</span>
            </div>

            {!facultyWeekId && (
              <div className="list">
                {weeks.map((week) => (
                  <div className="list-card" key={week.id}>
                    <div>
                      <strong>{week.title}</strong>
                      <p>{week.summary || `${week.questionCount} questions`}</p>
                    </div>
                    <button className="primary" type="button" onClick={() => loadFacultyWeek(week.id)}>
                      View Students
                    </button>
                  </div>
                ))}
              </div>
            )}

            {facultyWeekId && !facultyStudentId && (
              <>
                <div className="breadcrumb">
                  <button className="ghost back-btn" type="button" onClick={() => setFacultyWeekId("")}>
                    ← Back to weeks
                  </button>
                </div>
                <div className="list">
                  {facultyStudents.length === 0 && <div className="notice">No submissions yet.</div>}
                  {facultyStudents.map((student) => (
                    <div className="list-card" key={student}>
                      <div>
                        <strong>{student}</strong>
                        <p>Click to review attempts</p>
                      </div>
                      <button className="primary" type="button" onClick={() => loadFacultyStudent(student)}>
                        Open
                      </button>
                    </div>
                  ))}
                </div>
              </>
            )}

            {facultyWeekId && facultyStudentId && !facultyQuestion && (
              <>
                <div className="breadcrumb">
                  <button className="ghost back-btn" type="button" onClick={() => setFacultyStudentId("")}>
                    ← Back to students
                  </button>
                </div>
                <div className="list">
                  {facultyQuestions.length === 0 && <div className="notice">No questions submitted yet.</div>}
                  {facultyQuestions.map((item) => (
                    <div className="list-card" key={item.id}>
                      <div>
                        <strong>{item.questionTitle}</strong>
                        <p>{item.githubUrl || "No GitHub link yet"}</p>
                      </div>
                      <button className="primary" type="button" onClick={() => setFacultyQuestion(item)}>
                        View
                      </button>
                    </div>
                  ))}
                </div>
              </>
            )}

            {facultyQuestion && (
              <>
                <div className="breadcrumb">
                  <button className="ghost back-btn" type="button" onClick={() => setFacultyQuestion(null)}>
                    ← Back to questions
                  </button>
                </div>
                <div className="question-block">
                  <h3>{facultyQuestion.questionTitle}</h3>
                  <div className="notice">
                    GitHub Link:{" "}
                    {facultyQuestion.githubUrl ? (
                      <a href={facultyQuestion.githubUrl} target="_blank" rel="noreferrer">
                        {facultyQuestion.githubUrl}
                      </a>
                    ) : (
                      "Not provided"
                    )}
                  </div>
                  <div className="card light">
                    <h4>Code</h4>
                    <pre className="example-card">{facultyQuestion.code || "No code submitted."}</pre>
                  </div>
                  <div className="card light">
                    <h4>Explanation Transcript</h4>
                    <p>{facultyQuestion.transcript || "No transcript submitted."}</p>
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
