const { useEffect, useMemo, useRef, useState } = React;

function formatTime(msRemaining) {
  const totalSeconds = Math.max(0, Math.floor(msRemaining / 1000));
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function App() {
  const [mode, setMode] = useState("student");
  const [config, setConfig] = useState({ codeTimeMinutes: 20, explainTimeMinutes: 5 });
  const [questions, setQuestions] = useState([]);
  const [selectedQuestionId, setSelectedQuestionId] = useState("");

  const [studentId, setStudentId] = useState("");
  const [studentName, setStudentName] = useState("");
  const [code, setCode] = useState("");
  const [transcript, setTranscript] = useState("");

  const [studentSubmissions, setStudentSubmissions] = useState([]);
  const [facultySubmissions, setFacultySubmissions] = useState([]);
  const [currentSubmission, setCurrentSubmission] = useState(null);

  const [hasStartedCoding, setHasStartedCoding] = useState(false);
  const [codeDeadline, setCodeDeadline] = useState(null);
  const [codeRemaining, setCodeRemaining] = useState(0);
  const [codeExpired, setCodeExpired] = useState(false);

  const [explainDeadline, setExplainDeadline] = useState(null);
  const [explainRemaining, setExplainRemaining] = useState(0);
  const [explainExpired, setExplainExpired] = useState(false);

  const [isRecording, setIsRecording] = useState(false);
  const [recordStatus, setRecordStatus] = useState("Not recording");
  const [recognitionSupported, setRecognitionSupported] = useState(true);
  const recognitionRef = useRef(null);

  const selectedQuestion = useMemo(
    () => questions.find((item) => item.id === selectedQuestionId) || null,
    [questions, selectedQuestionId]
  );

  const isFinal = currentSubmission?.status === "final_submitted";
  const isCodeSubmitted = currentSubmission?.status === "code_submitted";

  const canEditCode = hasStartedCoding && !isCodeSubmitted && !isFinal && !codeExpired;
  const canSubmitCode = hasStartedCoding && !isCodeSubmitted && !isFinal;
  const canExplain = isCodeSubmitted && !isFinal;
  const transcriptEnabled = canExplain && !explainExpired;
  const recordEnabled = transcriptEnabled && recognitionSupported && !isRecording;
  const stopEnabled = transcriptEnabled && recognitionSupported && isRecording;

  useEffect(() => {
    async function fetchConfig() {
      const response = await fetch("/api/config");
      const data = await response.json();
      setConfig(data);
    }

    async function fetchQuestions() {
      const response = await fetch("/api/questions");
      const data = await response.json();
      setQuestions(data);
      if (data.length > 0) {
        setSelectedQuestionId(data[0].id);
      }
    }

    fetchConfig();
    fetchQuestions();
  }, []);

  useEffect(() => {
    if (mode === "faculty") {
      loadFacultySubmissions();
    }
  }, [mode]);

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setRecognitionSupported(false);
      setRecordStatus("Speech recognition not supported in this browser.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (event) => {
      let finalTranscript = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        if (result.isFinal) {
          finalTranscript += result[0].transcript;
        }
      }
      if (finalTranscript) {
        setTranscript((prev) => `${prev} ${finalTranscript}`.trim());
      }
    };

    recognition.onstart = () => {
      setIsRecording(true);
      setRecordStatus("Recording...");
    };

    recognition.onend = () => {
      setIsRecording(false);
      setRecordStatus("Not recording");
    };

    recognitionRef.current = recognition;
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
        return;
      }
      setCodeRemaining(remaining);
    };

    update();
    const intervalId = setInterval(update, 1000);
    return () => clearInterval(intervalId);
  }, [codeDeadline]);

  useEffect(() => {
    if (!explainDeadline) {
      setExplainRemaining(0);
      return;
    }

    const update = () => {
      const remaining = explainDeadline - Date.now();
      if (remaining <= 0) {
        setExplainRemaining(0);
        setExplainDeadline(null);
        setExplainExpired(true);
        stopRecord();
        return;
      }
      setExplainRemaining(remaining);
    };

    update();
    const intervalId = setInterval(update, 1000);
    return () => clearInterval(intervalId);
  }, [explainDeadline]);

  function resetSessionState() {
    setCurrentSubmission(null);
    setCode("");
    setTranscript("");
    setHasStartedCoding(false);
    setCodeDeadline(null);
    setCodeRemaining(0);
    setCodeExpired(false);
    setExplainDeadline(null);
    setExplainRemaining(0);
    setExplainExpired(false);
    setRecordStatus("Not recording");
    stopRecord();
  }

  function ensureStudentInfo() {
    if (!studentId.trim() || !studentName.trim()) {
      alert("Please enter Student ID and Name.");
      return false;
    }
    return true;
  }

  async function loadStudentSubmissions() {
    if (!studentId.trim()) {
      setStudentSubmissions([]);
      return;
    }
    const response = await fetch(`/api/submissions?studentId=${encodeURIComponent(studentId.trim())}`);
    const submissions = await response.json();
    setStudentSubmissions(submissions);
  }

  async function loadFacultySubmissions() {
    const response = await fetch("/api/submissions/all");
    const submissions = await response.json();
    setFacultySubmissions(submissions);
  }

  async function loadExistingSubmission() {
    if (!studentId.trim() || !selectedQuestion) {
      resetSessionState();
      return;
    }
    const response = await fetch(`/api/submissions?studentId=${encodeURIComponent(studentId.trim())}`);
    const submissions = await response.json();
    const entry = submissions.find((item) => item.questionId === selectedQuestion.id) || null;
    if (!entry) {
      resetSessionState();
      return;
    }
    setCurrentSubmission(entry);
    setCode(entry.code || "");
    setTranscript(entry.transcript || "");
    setHasStartedCoding(false);
    setCodeDeadline(null);
    setCodeExpired(false);
    setExplainDeadline(null);
    setExplainExpired(false);
    setRecordStatus("Not recording");
  }

  function startCodeTimer() {
    if (!ensureStudentInfo()) {
      return;
    }
    if (!selectedQuestion) {
      alert("Please select a question.");
      return;
    }
    setHasStartedCoding(true);
    setCodeExpired(false);
    setCodeDeadline(Date.now() + config.codeTimeMinutes * 60 * 1000);
  }

  function startExplainTimer() {
    if (!canExplain) {
      return;
    }
    setExplainExpired(false);
    setExplainDeadline(Date.now() + config.explainTimeMinutes * 60 * 1000);
  }

  function startRecord() {
    if (!recognitionSupported || isRecording || !transcriptEnabled) {
      return;
    }
    recognitionRef.current?.start();
  }

  function stopRecord() {
    if (!recognitionRef.current || !isRecording) {
      return;
    }
    recognitionRef.current.stop();
  }

  async function submitCode() {
    if (!ensureStudentInfo()) {
      return;
    }
    if (!selectedQuestion) {
      alert("Please select a question.");
      return;
    }

    const response = await fetch("/api/submissions/code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        studentId: studentId.trim(),
        studentName: studentName.trim(),
        questionId: selectedQuestion.id,
        questionTitle: selectedQuestion.title,
        code
      })
    });

    if (!response.ok) {
      const error = await response.json();
      alert(error.error || "Unable to submit code.");
      return;
    }

    const entry = await response.json();
    setCurrentSubmission(entry);
    setHasStartedCoding(false);
    setCodeExpired(false);
    await loadStudentSubmissions();
  }

  async function submitFinal() {
    if (!ensureStudentInfo()) {
      return;
    }
    if (!selectedQuestion) {
      alert("Please select a question.");
      return;
    }
    if (!transcript.trim()) {
      alert("Please provide an explanation.");
      return;
    }

    const response = await fetch("/api/submissions/final", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        studentId: studentId.trim(),
        studentName: studentName.trim(),
        questionId: selectedQuestion.id,
        questionTitle: selectedQuestion.title,
        transcript: transcript.trim()
      })
    });

    if (!response.ok) {
      const error = await response.json();
      alert(error.error || "Unable to submit final.");
      return;
    }

    const entry = await response.json();
    setCurrentSubmission(entry);
    setExplainDeadline(null);
    setExplainExpired(false);
    setIsRecording(false);
    setRecordStatus("Not recording");
    await loadStudentSubmissions();
  }

  function handleStudentIdBlur() {
    loadStudentSubmissions();
    loadExistingSubmission();
  }

  function handleStudentNameBlur() {
    loadExistingSubmission();
  }

  function handleQuestionChange(event) {
    setSelectedQuestionId(event.target.value);
    setTimeout(() => {
      loadExistingSubmission();
    }, 0);
  }

  return (
    <div className="page">
      <header className="app-header">
        <div className="header-text">
          <h1>Student Code Review</h1>
          <p>Submit code and voice explanation for each question.</p>
        </div>
        <div className="role-switch">
          <button
            className={mode === "student" ? "primary" : "ghost"}
            onClick={() => setMode("student")}
            type="button"
          >
            Student
          </button>
          <button
            className={mode === "faculty" ? "primary" : "ghost"}
            onClick={() => setMode("faculty")}
            type="button"
          >
            Faculty
          </button>
        </div>
      </header>

      <main className="app-main">
        {mode === "student" && (
          <section className="card">
            <h2>Student Workspace</h2>
            <div className="grid two">
              <label>
                Student ID
                <input
                  type="text"
                  placeholder="e.g. 21CS101"
                  value={studentId}
                  onChange={(event) => setStudentId(event.target.value)}
                  onBlur={handleStudentIdBlur}
                />
              </label>
              <label>
                Student Name
                <input
                  type="text"
                  placeholder="e.g. Priya"
                  value={studentName}
                  onChange={(event) => setStudentName(event.target.value)}
                  onBlur={handleStudentNameBlur}
                />
              </label>
            </div>

            <div className="question-area">
              <label>
                Select Question
                <select value={selectedQuestionId} onChange={handleQuestionChange}>
                  {questions.map((question) => (
                    <option key={question.id} value={question.id}>
                      {question.title}
                    </option>
                  ))}
                </select>
              </label>
              <div className="question-detail">
                {selectedQuestion ? (
                  <>
                    <strong>{selectedQuestion.title}</strong>
                    <div>{selectedQuestion.description}</div>
                  </>
                ) : (
                  "No question selected."
                )}
              </div>
            </div>

            <div className="timers">
              <div className="timer-card">
                <h3>Code Timer</h3>
                <div className="timer">{formatTime(codeRemaining)}</div>
                <button className="primary" onClick={startCodeTimer} type="button">
                  Start Coding
                </button>
                <button
                  className="ghost"
                  onClick={submitCode}
                  disabled={!canSubmitCode}
                  type="button"
                >
                  Submit Code
                </button>
              </div>
              <div className="timer-card">
                <h3>Explain Timer</h3>
                <div className="timer">{formatTime(explainRemaining)}</div>
                <button
                  className="primary"
                  onClick={startExplainTimer}
                  disabled={!canExplain}
                  type="button"
                >
                  Start Explanation
                </button>
                <button
                  className="ghost"
                  onClick={submitFinal}
                  disabled={!canExplain}
                  type="button"
                >
                  Submit Final
                </button>
              </div>
            </div>

            <div className="editor-area">
              <label>
                Code Editor
                <textarea
                  rows="10"
                  placeholder="Write your code here..."
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  disabled={!canEditCode}
                />
              </label>
            </div>

            <div className="explain-area">
              <h3>Voice Explanation</h3>
              <div className="record-controls">
                <button className="primary" onClick={startRecord} disabled={!recordEnabled} type="button">
                  Start Recording
                </button>
                <button className="ghost" onClick={stopRecord} disabled={!stopEnabled} type="button">
                  Stop Recording
                </button>
                <span className="status">{recordStatus}</span>
              </div>
              <textarea
                rows="6"
                placeholder="Speech to text will appear here..."
                value={transcript}
                onChange={(event) => setTranscript(event.target.value)}
                disabled={!transcriptEnabled}
              />
            </div>

            <div className="submissions-area">
              <h3>Your Submissions</h3>
              {studentSubmissions.length === 0 ? (
                <em>{studentId.trim() ? "No submissions yet." : "Enter Student ID to view submissions."}</em>
              ) : (
                <div id="studentSubmissions">
                  {studentSubmissions.map((entry) => (
                    <SubmissionCard key={entry.id} entry={entry} compact />
                  ))}
                </div>
              )}
            </div>
          </section>
        )}

        {mode === "faculty" && (
          <section className="card">
            <h2>Faculty Dashboard</h2>
            <p>View all student submissions and explanations.</p>
            <div className="controls">
              <button className="primary" onClick={loadFacultySubmissions} type="button">
                Refresh
              </button>
            </div>
            <div className="faculty-list">
              {facultySubmissions.length === 0 ? (
                <em>No submissions yet.</em>
              ) : (
                facultySubmissions.map((entry) => <SubmissionCard key={entry.id} entry={entry} />)
              )}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

function SubmissionCard({ entry, compact }) {
  const statusLabel = entry.status === "final_submitted" ? "Final submitted" : "In progress";
  const submittedAt = entry.finalSubmittedAt || entry.codeSubmittedAt || entry.createdAt;

  return (
    <div className="submission-card">
      <h4>
        {entry.studentName} ({entry.studentId})
      </h4>
      <div className="submission-meta">
        {entry.questionTitle || entry.questionId} • {statusLabel}
      </div>
      {!compact && <div className="submission-meta">Submitted: {submittedAt}</div>}
      <strong>Code</strong>
      {entry.code ? <pre>{entry.code}</pre> : <em>No code submitted yet.</em>}
      <strong>Explanation</strong>
      {entry.transcript ? <p>{entry.transcript}</p> : <em>No explanation submitted yet.</em>}
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<App />);
  const totalSeconds = Math.max(0, Math.floor(msRemaining / 1000));
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function App() {
  const [mode, setMode] = useState("student");
  const [config, setConfig] = useState({ codeTimeMinutes: 20, explainTimeMinutes: 5 });
  const [questions, setQuestions] = useState([]);
  const [selectedQuestionId, setSelectedQuestionId] = useState("");

  const [studentId, setStudentId] = useState("");
  const [studentName, setStudentName] = useState("");
  const [code, setCode] = useState("");
  const [transcript, setTranscript] = useState("");

  const [studentSubmissions, setStudentSubmissions] = useState([]);
  const [facultySubmissions, setFacultySubmissions] = useState([]);
  const [currentSubmission, setCurrentSubmission] = useState(null);

  const [hasStartedCoding, setHasStartedCoding] = useState(false);
  const [codeDeadline, setCodeDeadline] = useState(null);
  const [codeRemaining, setCodeRemaining] = useState(0);
  const [codeExpired, setCodeExpired] = useState(false);

  const [explainDeadline, setExplainDeadline] = useState(null);
  const [explainRemaining, setExplainRemaining] = useState(0);
  const [explainExpired, setExplainExpired] = useState(false);

  const [isRecording, setIsRecording] = useState(false);
  const [recordStatus, setRecordStatus] = useState("Not recording");
  const [recognitionSupported, setRecognitionSupported] = useState(true);
  const recognitionRef = useRef(null);

  const selectedQuestion = useMemo(
    () => questions.find((item) => item.id === selectedQuestionId) || null,
    [questions, selectedQuestionId]
  );

  const isFinal = currentSubmission?.status === "final_submitted";
  const isCodeSubmitted = currentSubmission?.status === "code_submitted";

  const canEditCode = hasStartedCoding && !isCodeSubmitted && !isFinal && !codeExpired;
  const canSubmitCode = hasStartedCoding && !isCodeSubmitted && !isFinal;
  const canExplain = isCodeSubmitted && !isFinal;
  const transcriptEnabled = canExplain && !explainExpired;
  const recordEnabled = transcriptEnabled && recognitionSupported && !isRecording;
  const stopEnabled = transcriptEnabled && recognitionSupported && isRecording;

  useEffect(() => {
    async function fetchConfig() {
      const response = await fetch("/api/config");
      const data = await response.json();
      setConfig(data);
    }

    async function fetchQuestions() {
      const response = await fetch("/api/questions");
      const data = await response.json();
      setQuestions(data);
      if (data.length > 0) {
        setSelectedQuestionId(data[0].id);
      }
    }

    fetchConfig();
    fetchQuestions();
  }, []);

  useEffect(() => {
    if (mode === "faculty") {
      loadFacultySubmissions();
    }
  }, [mode]);

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setRecognitionSupported(false);
      setRecordStatus("Speech recognition not supported in this browser.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (event) => {
      let finalTranscript = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        if (result.isFinal) {
          finalTranscript += result[0].transcript;
        }
      }
      if (finalTranscript) {
        setTranscript((prev) => `${prev} ${finalTranscript}`.trim());
      }
    };

    recognition.onstart = () => {
      setIsRecording(true);
      setRecordStatus("Recording...");
    };

    recognition.onend = () => {
      setIsRecording(false);
      setRecordStatus("Not recording");
    };

    recognitionRef.current = recognition;
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
        return;
      }
      setCodeRemaining(remaining);
    };

    update();
    const intervalId = setInterval(update, 1000);
    return () => clearInterval(intervalId);
  }, [codeDeadline]);

  useEffect(() => {
    if (!explainDeadline) {
      setExplainRemaining(0);
      return;
    }

    const update = () => {
      const remaining = explainDeadline - Date.now();
      if (remaining <= 0) {
        setExplainRemaining(0);
        setExplainDeadline(null);
        setExplainExpired(true);
        stopRecord();
        return;
      }
      setExplainRemaining(remaining);
    };

    update();
    const intervalId = setInterval(update, 1000);
    return () => clearInterval(intervalId);
  }, [explainDeadline]);

  function resetSessionState() {
    setCurrentSubmission(null);
    setCode("");
    setTranscript("");
    setHasStartedCoding(false);
    setCodeDeadline(null);
    setCodeRemaining(0);
    setCodeExpired(false);
    setExplainDeadline(null);
    setExplainRemaining(0);
    setExplainExpired(false);
    setRecordStatus("Not recording");
    stopRecord();
  }

  function ensureStudentInfo() {
    if (!studentId.trim() || !studentName.trim()) {
      alert("Please enter Student ID and Name.");
      return false;
    }
    return true;
  }

  async function loadStudentSubmissions() {
    if (!studentId.trim()) {
      setStudentSubmissions([]);
      return;
    }
    const response = await fetch(`/api/submissions?studentId=${encodeURIComponent(studentId.trim())}`);
    const submissions = await response.json();
    setStudentSubmissions(submissions);
  }

  async function loadFacultySubmissions() {
    const response = await fetch("/api/submissions/all");
    const submissions = await response.json();
    setFacultySubmissions(submissions);
  }

  async function loadExistingSubmission() {
    if (!studentId.trim() || !selectedQuestion) {
      resetSessionState();
      return;
    }
    const response = await fetch(`/api/submissions?studentId=${encodeURIComponent(studentId.trim())}`);
    const submissions = await response.json();
    const entry = submissions.find((item) => item.questionId === selectedQuestion.id) || null;
    if (!entry) {
      resetSessionState();
      return;
    }
    setCurrentSubmission(entry);
    setCode(entry.code || "");
    setTranscript(entry.transcript || "");
    setHasStartedCoding(false);
    setCodeDeadline(null);
    setCodeExpired(false);
    setExplainDeadline(null);
    setExplainExpired(false);
    setRecordStatus("Not recording");
  }

  function startCodeTimer() {
    if (!ensureStudentInfo()) {
      return;
    }
    if (!selectedQuestion) {
      alert("Please select a question.");
      return;
    }
    setHasStartedCoding(true);
    setCodeExpired(false);
    setCodeDeadline(Date.now() + config.codeTimeMinutes * 60 * 1000);
  }

  function startExplainTimer() {
    if (!canExplain) {
      return;
    }
    setExplainExpired(false);
    setExplainDeadline(Date.now() + config.explainTimeMinutes * 60 * 1000);
  }

  function startRecord() {
    if (!recognitionSupported || isRecording || !transcriptEnabled) {
      return;
    }
    recognitionRef.current?.start();
  }

  function stopRecord() {
    if (!recognitionRef.current || !isRecording) {
      return;
    }
    recognitionRef.current.stop();
  }

  async function submitCode() {
    if (!ensureStudentInfo()) {
      return;
    }
    if (!selectedQuestion) {
      alert("Please select a question.");
      return;
    }

    const response = await fetch("/api/submissions/code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        studentId: studentId.trim(),
        studentName: studentName.trim(),
        questionId: selectedQuestion.id,
        questionTitle: selectedQuestion.title,
        code
      })
    });

    if (!response.ok) {
      const error = await response.json();
      alert(error.error || "Unable to submit code.");
      return;
    }

    const entry = await response.json();
    setCurrentSubmission(entry);
    setHasStartedCoding(false);
    setCodeExpired(false);
    await loadStudentSubmissions();
  }

  async function submitFinal() {
    if (!ensureStudentInfo()) {
      return;
    }
    if (!selectedQuestion) {
      alert("Please select a question.");
      return;
    }
    if (!transcript.trim()) {
      alert("Please provide an explanation.");
      return;
    }

    const response = await fetch("/api/submissions/final", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        studentId: studentId.trim(),
        studentName: studentName.trim(),
        questionId: selectedQuestion.id,
        questionTitle: selectedQuestion.title,
        transcript: transcript.trim()
      })
    });

    if (!response.ok) {
      const error = await response.json();
      alert(error.error || "Unable to submit final.");
      return;
    }

    const entry = await response.json();
    setCurrentSubmission(entry);
    setExplainDeadline(null);
    setExplainExpired(false);
    setIsRecording(false);
    setRecordStatus("Not recording");
    await loadStudentSubmissions();
  }

  function handleStudentIdBlur() {
    loadStudentSubmissions();
    loadExistingSubmission();
  }

  function handleStudentNameBlur() {
    loadExistingSubmission();
  }

  function handleQuestionChange(event) {
    setSelectedQuestionId(event.target.value);
    setTimeout(() => {
      loadExistingSubmission();
    }, 0);
  }

  return (
    <div className="page">
      <header className="app-header">
        <div className="header-text">
          <h1>Student Code Review</h1>
          <p>Submit code and voice explanation for each question.</p>
        </div>
        <div className="role-switch">
          <button
            className={mode === "student" ? "primary" : "ghost"}
            onClick={() => setMode("student")}
            type="button"
          >
            Student
          </button>
          <button
            className={mode === "faculty" ? "primary" : "ghost"}
            onClick={() => setMode("faculty")}
            type="button"
          >
            Faculty
          </button>
        </div>
      </header>

      <main className="app-main">
        {mode === "student" && (
          <section className="card">
            <h2>Student Workspace</h2>
            <div className="grid two">
              <label>
                Student ID
                <input
                  type="text"
                  placeholder="e.g. 21CS101"
                  value={studentId}
                  onChange={(event) => setStudentId(event.target.value)}
                  onBlur={handleStudentIdBlur}
                />
              </label>
              <label>
                Student Name
                <input
                  type="text"
                  placeholder="e.g. Priya"
                  value={studentName}
                  onChange={(event) => setStudentName(event.target.value)}
                  onBlur={handleStudentNameBlur}
                />
              </label>
            </div>

            <div className="question-area">
              <label>
                Select Question
                <select value={selectedQuestionId} onChange={handleQuestionChange}>
                  {questions.map((question) => (
                    <option key={question.id} value={question.id}>
                      {question.title}
                    </option>
                  ))}
                </select>
              </label>
              <div className="question-detail">
                {selectedQuestion ? (
                  <>
                    <strong>{selectedQuestion.title}</strong>
                    <div>{selectedQuestion.description}</div>
                  </>
                ) : (
                  "No question selected."
                )}
              </div>
            </div>

            <div className="timers">
              <div className="timer-card">
                <h3>Code Timer</h3>
                <div className="timer">{formatTime(codeRemaining)}</div>
                <button className="primary" onClick={startCodeTimer} type="button">
                  Start Coding
                </button>
                <button
                  className="ghost"
                  onClick={submitCode}
                  disabled={!canSubmitCode}
                  type="button"
                >
                  Submit Code
                </button>
              </div>
              <div className="timer-card">
                <h3>Explain Timer</h3>
                <div className="timer">{formatTime(explainRemaining)}</div>
                <button
                  className="primary"
                  onClick={startExplainTimer}
                  disabled={!canExplain}
                  type="button"
                >
                  Start Explanation
                </button>
                <button
                  className="ghost"
                  onClick={submitFinal}
                  disabled={!canExplain}
                  type="button"
                >
                  Submit Final
                </button>
              </div>
            </div>

            <div className="editor-area">
              <label>
                Code Editor
                <textarea
                  rows="10"
                  placeholder="Write your code here..."
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  disabled={!canEditCode}
                />
              </label>
            </div>

            <div className="explain-area">
              <h3>Voice Explanation</h3>
              <div className="record-controls">
                <button className="primary" onClick={startRecord} disabled={!recordEnabled} type="button">
                  Start Recording
                </button>
                <button className="ghost" onClick={stopRecord} disabled={!stopEnabled} type="button">
                  Stop Recording
                </button>
                <span className="status">{recordStatus}</span>
              </div>
              <textarea
                rows="6"
                placeholder="Speech to text will appear here..."
                value={transcript}
                onChange={(event) => setTranscript(event.target.value)}
                disabled={!transcriptEnabled}
              />
            </div>

            <div className="submissions-area">
              <h3>Your Submissions</h3>
              {studentSubmissions.length === 0 ? (
                <em>{studentId.trim() ? "No submissions yet." : "Enter Student ID to view submissions."}</em>
              ) : (
                <div id="studentSubmissions">
                  {studentSubmissions.map((entry) => (
                    <SubmissionCard key={entry.id} entry={entry} compact />
                  ))}
                </div>
              )}
            </div>
          </section>
        )}

        {mode === "faculty" && (
          <section className="card">
            <h2>Faculty Dashboard</h2>
            <p>View all student submissions and explanations.</p>
            <div className="controls">
              <button className="primary" onClick={loadFacultySubmissions} type="button">
                Refresh
              </button>
            </div>
            <div className="faculty-list">
              {facultySubmissions.length === 0 ? (
                <em>No submissions yet.</em>
              ) : (
                facultySubmissions.map((entry) => <SubmissionCard key={entry.id} entry={entry} />)
              )}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

function SubmissionCard({ entry, compact }) {
  const statusLabel = entry.status === "final_submitted" ? "Final submitted" : "In progress";
  const submittedAt = entry.finalSubmittedAt || entry.codeSubmittedAt || entry.createdAt;

  return (
    <div className="submission-card">
      <h4>
        {entry.studentName} ({entry.studentId})
      </h4>
      <div className="submission-meta">
        {entry.questionTitle || entry.questionId} • {statusLabel}
      </div>
      {!compact && <div className="submission-meta">Submitted: {submittedAt}</div>}
      <strong>Code</strong>
      {entry.code ? <pre>{entry.code}</pre> : <em>No code submitted yet.</em>}
      <strong>Explanation</strong>
      {entry.transcript ? <p>{entry.transcript}</p> : <em>No explanation submitted yet.</em>}
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<App />);
const { useEffect, useMemo, useRef, useState } = React;

function formatTime(msRemaining) {
  const totalSeconds = Math.max(0, Math.floor(msRemaining / 1000));
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function App() {
  const [mode, setMode] = useState("student");
  const [config, setConfig] = useState({ codeTimeMinutes: 20, explainTimeMinutes: 5 });
  const [questions, setQuestions] = useState([]);
  const [selectedQuestionId, setSelectedQuestionId] = useState("");

  const [studentId, setStudentId] = useState("");
  const [studentName, setStudentName] = useState("");
  const [code, setCode] = useState("");
  const [transcript, setTranscript] = useState("");

  const [studentSubmissions, setStudentSubmissions] = useState([]);
  const [facultySubmissions, setFacultySubmissions] = useState([]);
  const [currentSubmission, setCurrentSubmission] = useState(null);

  const [hasStartedCoding, setHasStartedCoding] = useState(false);
  const [codeDeadline, setCodeDeadline] = useState(null);
  const [codeRemaining, setCodeRemaining] = useState(0);
  const [codeExpired, setCodeExpired] = useState(false);

  const [explainDeadline, setExplainDeadline] = useState(null);
  const [explainRemaining, setExplainRemaining] = useState(0);
  const [explainExpired, setExplainExpired] = useState(false);

  const [isRecording, setIsRecording] = useState(false);
  const [recordStatus, setRecordStatus] = useState("Not recording");
  const [recognitionSupported, setRecognitionSupported] = useState(true);
  const recognitionRef = useRef(null);

  const selectedQuestion = useMemo(
    () => questions.find((item) => item.id === selectedQuestionId) || null,
    [questions, selectedQuestionId]
  );

  const isFinal = currentSubmission?.status === "final_submitted";
  const isCodeSubmitted = currentSubmission?.status === "code_submitted";

  const canEditCode = hasStartedCoding && !isCodeSubmitted && !isFinal && !codeExpired;
  const canSubmitCode = hasStartedCoding && !isCodeSubmitted && !isFinal;
  const canExplain = isCodeSubmitted && !isFinal;
  const transcriptEnabled = canExplain && !explainExpired;
  const recordEnabled = transcriptEnabled && recognitionSupported && !isRecording;
  const stopEnabled = transcriptEnabled && recognitionSupported && isRecording;

  useEffect(() => {
    async function fetchConfig() {
      const response = await fetch("/api/config");
      const data = await response.json();
      setConfig(data);
    }

    async function fetchQuestions() {
      const response = await fetch("/api/questions");
      const data = await response.json();
      setQuestions(data);
      if (data.length > 0) {
        setSelectedQuestionId(data[0].id);
      }
    }

    fetchConfig();
    fetchQuestions();
  }, []);

  useEffect(() => {
    if (mode === "faculty") {
      loadFacultySubmissions();
    }
  }, [mode]);

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setRecognitionSupported(false);
      setRecordStatus("Speech recognition not supported in this browser.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (event) => {
      let finalTranscript = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        if (result.isFinal) {
          finalTranscript += result[0].transcript;
        }
      }
      if (finalTranscript) {
        setTranscript((prev) => `${prev} ${finalTranscript}`.trim());
      }
    };

    recognition.onstart = () => {
      setIsRecording(true);
      setRecordStatus("Recording...");
    };

    recognition.onend = () => {
      setIsRecording(false);
      setRecordStatus("Not recording");
    };

    recognitionRef.current = recognition;
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
        return;
      }
      setCodeRemaining(remaining);
    };

    update();
    const intervalId = setInterval(update, 1000);
    return () => clearInterval(intervalId);
  }, [codeDeadline]);

  useEffect(() => {
    if (!explainDeadline) {
      setExplainRemaining(0);
      return;
    }

    const update = () => {
      const remaining = explainDeadline - Date.now();
      if (remaining <= 0) {
        setExplainRemaining(0);
        setExplainDeadline(null);
        setExplainExpired(true);
        stopRecord();
        return;
      }
      setExplainRemaining(remaining);
    };

    update();
    const intervalId = setInterval(update, 1000);
    return () => clearInterval(intervalId);
  }, [explainDeadline]);

  function resetSessionState() {
    setCurrentSubmission(null);
    setCode("");
    setTranscript("");
    setHasStartedCoding(false);
    setCodeDeadline(null);
    setCodeRemaining(0);
    setCodeExpired(false);
    setExplainDeadline(null);
    setExplainRemaining(0);
    setExplainExpired(false);
    setRecordStatus("Not recording");
    stopRecord();
  }

  function ensureStudentInfo() {
    if (!studentId.trim() || !studentName.trim()) {
      alert("Please enter Student ID and Name.");
      return false;
    }
    return true;
  }

  async function loadStudentSubmissions() {
    if (!studentId.trim()) {
      setStudentSubmissions([]);
      return;
    }
    const response = await fetch(`/api/submissions?studentId=${encodeURIComponent(studentId.trim())}`);
    const submissions = await response.json();
    setStudentSubmissions(submissions);
  }

  async function loadFacultySubmissions() {
    const response = await fetch("/api/submissions/all");
    const submissions = await response.json();
    setFacultySubmissions(submissions);
  }

  async function loadExistingSubmission() {
    if (!studentId.trim() || !selectedQuestion) {
      resetSessionState();
      return;
    }
    const response = await fetch(`/api/submissions?studentId=${encodeURIComponent(studentId.trim())}`);
    const submissions = await response.json();
    const entry = submissions.find((item) => item.questionId === selectedQuestion.id) || null;
    if (!entry) {
      resetSessionState();
      return;
    }
    setCurrentSubmission(entry);
    setCode(entry.code || "");
    setTranscript(entry.transcript || "");
    setHasStartedCoding(false);
    setCodeDeadline(null);
    setCodeExpired(false);
    setExplainDeadline(null);
    setExplainExpired(false);
    setRecordStatus("Not recording");
  }

  function startCodeTimer() {
    if (!ensureStudentInfo()) {
      return;
    }
    if (!selectedQuestion) {
      alert("Please select a question.");
      return;
    }
    setHasStartedCoding(true);
    setCodeExpired(false);
    setCodeDeadline(Date.now() + config.codeTimeMinutes * 60 * 1000);
  }

  function startExplainTimer() {
    if (!canExplain) {
      return;
    }
    setExplainExpired(false);
    setExplainDeadline(Date.now() + config.explainTimeMinutes * 60 * 1000);
  }

  function startRecord() {
    if (!recognitionSupported || isRecording || !transcriptEnabled) {
      return;
    }
    recognitionRef.current?.start();
  }

  function stopRecord() {
    if (!recognitionRef.current || !isRecording) {
      return;
    }
    recognitionRef.current.stop();
  }

  async function submitCode() {
    if (!ensureStudentInfo()) {
      return;
    }
    if (!selectedQuestion) {
      alert("Please select a question.");
      return;
    }

    const response = await fetch("/api/submissions/code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        studentId: studentId.trim(),
        studentName: studentName.trim(),
        questionId: selectedQuestion.id,
        questionTitle: selectedQuestion.title,
        code
      })
    });

    if (!response.ok) {
      const error = await response.json();
      alert(error.error || "Unable to submit code.");
      return;
    }

    const entry = await response.json();
    setCurrentSubmission(entry);
    setHasStartedCoding(false);
    setCodeExpired(false);
    await loadStudentSubmissions();
  }

  async function submitFinal() {
    if (!ensureStudentInfo()) {
      return;
    }
    if (!selectedQuestion) {
      alert("Please select a question.");
      return;
    }
    if (!transcript.trim()) {
      alert("Please provide an explanation.");
      return;
    }

    const response = await fetch("/api/submissions/final", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        studentId: studentId.trim(),
        studentName: studentName.trim(),
        questionId: selectedQuestion.id,
        questionTitle: selectedQuestion.title,
        transcript: transcript.trim()
      })
    });

    if (!response.ok) {
      const error = await response.json();
      alert(error.error || "Unable to submit final.");
      return;
    }

    const entry = await response.json();
    setCurrentSubmission(entry);
    setExplainDeadline(null);
    setExplainExpired(false);
    setIsRecording(false);
    setRecordStatus("Not recording");
    await loadStudentSubmissions();
  }

  function handleStudentIdBlur() {
    loadStudentSubmissions();
    loadExistingSubmission();
  }

  function handleStudentNameBlur() {
    loadExistingSubmission();
  }

  function handleQuestionChange(event) {
    setSelectedQuestionId(event.target.value);
    setTimeout(() => {
      loadExistingSubmission();
    }, 0);
  }

  return (
    <div className="page">
      <header className="app-header">
        <div className="header-text">
          <h1>Student Code Review</h1>
          <p>Submit code and voice explanation for each question.</p>
        </div>
        <div className="role-switch">
          <button
            className={mode === "student" ? "primary" : "ghost"}
            onClick={() => setMode("student")}
            type="button"
          >
            Student
          </button>
          <button
            className={mode === "faculty" ? "primary" : "ghost"}
            onClick={() => setMode("faculty")}
            type="button"
          >
            Faculty
          </button>
        </div>
      </header>

      <main className="app-main">
        {mode === "student" && (
          <section className="card">
            <h2>Student Workspace</h2>
            <div className="grid two">
              <label>
                Student ID
                <input
                  type="text"
                  placeholder="e.g. 21CS101"
                  value={studentId}
                  onChange={(event) => setStudentId(event.target.value)}
                  onBlur={handleStudentIdBlur}
                />
              </label>
              <label>
                Student Name
                <input
                  type="text"
                  placeholder="e.g. Priya"
                  value={studentName}
                  onChange={(event) => setStudentName(event.target.value)}
                  onBlur={handleStudentNameBlur}
                />
              </label>
            </div>

            <div className="question-area">
              <label>
                Select Question
                <select value={selectedQuestionId} onChange={handleQuestionChange}>
                  {questions.map((question) => (
                    <option key={question.id} value={question.id}>
                      {question.title}
                    </option>
                  ))}
                </select>
              </label>
              <div className="question-detail">
                {selectedQuestion ? (
                  <>
                    <strong>{selectedQuestion.title}</strong>
                    <div>{selectedQuestion.description}</div>
                  </>
                ) : (
                  "No question selected."
                )}
              </div>
            </div>

            <div className="timers">
              <div className="timer-card">
                <h3>Code Timer</h3>
                <div className="timer">{formatTime(codeRemaining)}</div>
                <button className="primary" onClick={startCodeTimer} type="button">
                  Start Coding
                </button>
                <button
                  className="ghost"
                  onClick={submitCode}
                  disabled={!canSubmitCode}
                  type="button"
                >
                  Submit Code
                </button>
              </div>
              <div className="timer-card">
                <h3>Explain Timer</h3>
                <div className="timer">{formatTime(explainRemaining)}</div>
                <button
                  className="primary"
                  onClick={startExplainTimer}
                  disabled={!canExplain}
                  type="button"
                >
                  Start Explanation
                </button>
                <button
                  className="ghost"
                  onClick={submitFinal}
                  disabled={!canExplain}
                  type="button"
                >
                  Submit Final
                </button>
              </div>
            </div>

            <div className="editor-area">
              <label>
                Code Editor
                <textarea
                  rows="10"
                  placeholder="Write your code here..."
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  disabled={!canEditCode}
                />
              </label>
            </div>

            <div className="explain-area">
              <h3>Voice Explanation</h3>
              <div className="record-controls">
                <button className="primary" onClick={startRecord} disabled={!recordEnabled} type="button">
                  Start Recording
                </button>
                <button className="ghost" onClick={stopRecord} disabled={!stopEnabled} type="button">
                  Stop Recording
                </button>
                <span className="status">{recordStatus}</span>
              </div>
              <textarea
                rows="6"
                placeholder="Speech to text will appear here..."
                value={transcript}
                onChange={(event) => setTranscript(event.target.value)}
                disabled={!transcriptEnabled}
              />
            </div>

            <div className="submissions-area">
              <h3>Your Submissions</h3>
              {studentSubmissions.length === 0 ? (
                <em>{studentId.trim() ? "No submissions yet." : "Enter Student ID to view submissions."}</em>
              ) : (
                <div id="studentSubmissions">
                  {studentSubmissions.map((entry) => (
                    <SubmissionCard key={entry.id} entry={entry} compact />
                  ))}
                </div>
              )}
            </div>
          </section>
        )}

        {mode === "faculty" && (
          <section className="card">
            <h2>Faculty Dashboard</h2>
            <p>View all student submissions and explanations.</p>
            <div className="controls">
              <button className="primary" onClick={loadFacultySubmissions} type="button">
                Refresh
              </button>
            </div>
            <div className="faculty-list">
              {facultySubmissions.length === 0 ? (
                <em>No submissions yet.</em>
              ) : (
                facultySubmissions.map((entry) => <SubmissionCard key={entry.id} entry={entry} />)
              )}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

function SubmissionCard({ entry, compact }) {
  const statusLabel = entry.status === "final_submitted" ? "Final submitted" : "In progress";
  const submittedAt = entry.finalSubmittedAt || entry.codeSubmittedAt || entry.createdAt;

  return (
    <div className="submission-card">
      <h4>
        {entry.studentName} ({entry.studentId})
      </h4>
      <div className="submission-meta">
        {entry.questionTitle || entry.questionId} • {statusLabel}
      </div>
      {!compact && <div className="submission-meta">Submitted: {submittedAt}</div>}
      <strong>Code</strong>
      {entry.code ? (
        <pre>{entry.code}</pre>
      ) : (
        <em>No code submitted yet.</em>
      )}
      <strong>Explanation</strong>
      {entry.transcript ? <p>{entry.transcript}</p> : <em>No explanation submitted yet.</em>}
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<App />);
const studentSection = document.getElementById("studentSection");
const facultySection = document.getElementById("facultySection");
const studentModeBtn = document.getElementById("studentModeBtn");
const facultyModeBtn = document.getElementById("facultyModeBtn");

const studentIdInput = document.getElementById("studentIdInput");
const studentNameInput = document.getElementById("studentNameInput");
const questionSelect = document.getElementById("questionSelect");
const questionDetail = document.getElementById("questionDetail");
const codeInput = document.getElementById("codeInput");
const transcriptOutput = document.getElementById("transcriptOutput");

const startCodeBtn = document.getElementById("startCodeBtn");
const submitCodeBtn = document.getElementById("submitCodeBtn");
const startExplainBtn = document.getElementById("startExplainBtn");
const submitFinalBtn = document.getElementById("submitFinalBtn");
const codeTimerEl = document.getElementById("codeTimer");
const explainTimerEl = document.getElementById("explainTimer");

const recordBtn = document.getElementById("recordBtn");
const stopRecordBtn = document.getElementById("stopRecordBtn");
const recordStatus = document.getElementById("recordStatus");

const studentSubmissions = document.getElementById("studentSubmissions");
const facultyList = document.getElementById("facultyList");
const refreshFacultyBtn = document.getElementById("refreshFacultyBtn");

let config = { codeTimeMinutes: 20, explainTimeMinutes: 5 };
let questions = [];
let codeTimer = null;
let explainTimer = null;
let codeDeadline = null;
let explainDeadline = null;
let currentSubmission = null;

let recognition = null;
let isRecording = false;

function setMode(mode) {
  const isStudent = mode === "student";
  studentSection.classList.toggle("hidden", !isStudent);
  facultySection.classList.toggle("hidden", isStudent);
  studentModeBtn.classList.toggle("ghost", !isStudent);
  studentModeBtn.classList.toggle("primary", isStudent);
  facultyModeBtn.classList.toggle("ghost", isStudent);
  facultyModeBtn.classList.toggle("primary", !isStudent);
}

function formatTime(msRemaining) {
  const totalSeconds = Math.max(0, Math.floor(msRemaining / 1000));
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function updateTimer(element, deadline) {
  if (!deadline) {
    element.textContent = "00:00";
    return 0;
  }
  const remaining = deadline - Date.now();
  element.textContent = formatTime(remaining);
  return remaining;
}

function stopTimer(timerRef, element) {
  if (timerRef) {
    clearInterval(timerRef);
  }
  element.textContent = "00:00";
}

function resetSessionState() {
  stopTimer(codeTimer, codeTimerEl);
  stopTimer(explainTimer, explainTimerEl);
  codeDeadline = null;
  explainDeadline = null;
  currentSubmission = null;
  codeInput.disabled = true;
  transcriptOutput.disabled = true;
  submitCodeBtn.disabled = true;
  startExplainBtn.disabled = true;
  submitFinalBtn.disabled = true;
  recordBtn.disabled = true;
  stopRecordBtn.disabled = true;
  recordStatus.textContent = "Not recording";
  transcriptOutput.value = "";
}

function ensureStudentInfo() {
  const studentId = studentIdInput.value.trim();
  const studentName = studentNameInput.value.trim();
  if (!studentId || !studentName) {
    alert("Please enter Student ID and Name.");
    return null;
  }
  return { studentId, studentName };
}

function getSelectedQuestion() {
  const questionId = questionSelect.value;
  const question = questions.find((item) => item.id === questionId);
  return question || null;
}

async function fetchConfig() {
  const response = await fetch("/api/config");
  config = await response.json();
}

async function fetchQuestions() {
  const response = await fetch("/api/questions");
  questions = await response.json();
  questionSelect.innerHTML = "";
  questions.forEach((question) => {
    const option = document.createElement("option");
    option.value = question.id;
    option.textContent = question.title;
    questionSelect.appendChild(option);
  });
  updateQuestionDetail();
}

function updateQuestionDetail() {
  const question = getSelectedQuestion();
  if (!question) {
    questionDetail.textContent = "No question selected.";
    return;
  }
  questionDetail.innerHTML = `<strong>${question.title}</strong><br />${question.description}`;
}

async function loadStudentSubmissions() {
  const studentId = studentIdInput.value.trim();
  if (!studentId) {
    studentSubmissions.innerHTML = "<em>Enter Student ID to view submissions.</em>";
    return;
  }
  const response = await fetch(`/api/submissions?studentId=${encodeURIComponent(studentId)}`);
  const submissions = await response.json();
  if (!submissions.length) {
    studentSubmissions.innerHTML = "<em>No submissions yet.</em>";
    return;
  }
  studentSubmissions.innerHTML = submissions
    .map((entry) => buildSubmissionCard(entry, true))
    .join("");
}

function buildSubmissionCard(entry, compact = false) {
  const statusLabel = entry.status === "final_submitted" ? "Final submitted" : "In progress";
  const codeBlock = entry.code
    ? `<pre>${escapeHtml(entry.code)}</pre>`
    : "<em>No code submitted yet.</em>";
  const transcriptBlock = entry.transcript
    ? `<p>${escapeHtml(entry.transcript)}</p>`
    : "<em>No explanation submitted yet.</em>";

  return `
    <div class="submission-card">
      <h4>${entry.studentName} (${entry.studentId})</h4>
      <div class="submission-meta">${entry.questionTitle || entry.questionId} • ${statusLabel}</div>
      ${compact ? "" : `<div class="submission-meta">Submitted: ${entry.finalSubmittedAt || entry.codeSubmittedAt || entry.createdAt}</div>`}
      <strong>Code</strong>
      ${codeBlock}
      <strong>Explanation</strong>
      ${transcriptBlock}
    </div>
  `;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

async function loadFacultySubmissions() {
  const response = await fetch("/api/submissions/all");
  const submissions = await response.json();
  if (!submissions.length) {
    facultyList.innerHTML = "<em>No submissions yet.</em>";
    return;
  }
  facultyList.innerHTML = submissions.map((entry) => buildSubmissionCard(entry)).join("");
}

async function loadExistingSubmission() {
  const studentId = studentIdInput.value.trim();
  const question = getSelectedQuestion();
  if (!studentId || !question) {
    resetSessionState();
    return;
  }

  const response = await fetch(`/api/submissions?studentId=${encodeURIComponent(studentId)}`);
  const submissions = await response.json();
  currentSubmission = submissions.find((entry) => entry.questionId === question.id) || null;

  if (!currentSubmission) {
    codeInput.value = "";
    transcriptOutput.value = "";
    codeInput.disabled = true;
    transcriptOutput.disabled = true;
    submitCodeBtn.disabled = true;
    startExplainBtn.disabled = true;
    submitFinalBtn.disabled = true;
    recordBtn.disabled = true;
    stopRecordBtn.disabled = true;
    return;
  }

  codeInput.value = currentSubmission.code || "";
  transcriptOutput.value = currentSubmission.transcript || "";

  if (currentSubmission.status === "final_submitted") {
    codeInput.disabled = true;
    transcriptOutput.disabled = true;
    submitCodeBtn.disabled = true;
    startExplainBtn.disabled = true;
    submitFinalBtn.disabled = true;
    recordBtn.disabled = true;
    stopRecordBtn.disabled = true;
  } else {
    codeInput.disabled = false;
    submitCodeBtn.disabled = false;
    startExplainBtn.disabled = currentSubmission.status !== "code_submitted";
    transcriptOutput.disabled = currentSubmission.status !== "code_submitted";
    submitFinalBtn.disabled = currentSubmission.status !== "code_submitted";
    recordBtn.disabled = currentSubmission.status !== "code_submitted";
  }
}

function initSpeechRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    recordStatus.textContent = "Speech recognition not supported in this browser.";
    recordBtn.disabled = true;
    stopRecordBtn.disabled = true;
    return;
  }
  recognition = new SpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = "en-US";

  recognition.onresult = (event) => {
    let finalTranscript = "";
    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const result = event.results[i];
      if (result.isFinal) {
        finalTranscript += result[0].transcript;
      }
    }
    if (finalTranscript) {
      transcriptOutput.value = `${transcriptOutput.value} ${finalTranscript}`.trim();
    }
  };

  recognition.onstart = () => {
    isRecording = true;
    recordStatus.textContent = "Recording...";
    recordBtn.disabled = true;
    stopRecordBtn.disabled = false;
  };

  recognition.onend = () => {
    isRecording = false;
    recordStatus.textContent = "Not recording";
    if (transcriptOutput.disabled) {
      recordBtn.disabled = true;
    } else {
      recordBtn.disabled = false;
    }
    stopRecordBtn.disabled = true;
  };
}

function startCodeTimer() {
  codeDeadline = Date.now() + config.codeTimeMinutes * 60 * 1000;
  codeInput.disabled = false;
  submitCodeBtn.disabled = false;
  codeTimer = setInterval(() => {
    const remaining = updateTimer(codeTimerEl, codeDeadline);
    if (remaining <= 0) {
      clearInterval(codeTimer);
      codeInput.disabled = true;
      submitCodeBtn.disabled = false;
    }
  }, 1000);
}

function startExplainTimer() {
  explainDeadline = Date.now() + config.explainTimeMinutes * 60 * 1000;
  transcriptOutput.disabled = false;
  submitFinalBtn.disabled = false;
  recordBtn.disabled = false;
  stopRecordBtn.disabled = true;
  explainTimer = setInterval(() => {
    const remaining = updateTimer(explainTimerEl, explainDeadline);
    if (remaining <= 0) {
      clearInterval(explainTimer);
      transcriptOutput.disabled = true;
      recordBtn.disabled = true;
      stopRecord();
    }
  }, 1000);
}

function startRecord() {
  if (!recognition || isRecording || transcriptOutput.disabled) {
    return;
  }
  recognition.start();
}

function stopRecord() {
  if (!recognition || !isRecording) {
    return;
  }
  recognition.stop();
}

async function submitCode() {
  const studentInfo = ensureStudentInfo();
  if (!studentInfo) {
    return;
  }
  const question = getSelectedQuestion();
  if (!question) {
    alert("Please select a question.");
    return;
  }

  const response = await fetch("/api/submissions/code", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      studentId: studentInfo.studentId,
      studentName: studentInfo.studentName,
      questionId: question.id,
      questionTitle: question.title,
      code: codeInput.value
    })
  });

  if (!response.ok) {
    const error = await response.json();
    alert(error.error || "Unable to submit code.");
    return;
  }

  currentSubmission = await response.json();
  codeInput.disabled = true;
  submitCodeBtn.disabled = true;
  startExplainBtn.disabled = false;
  transcriptOutput.disabled = false;
  recordBtn.disabled = false;
  await loadStudentSubmissions();
}

async function submitFinal() {
  const studentInfo = ensureStudentInfo();
  if (!studentInfo) {
    return;
  }
  const question = getSelectedQuestion();
  if (!question) {
    alert("Please select a question.");
    return;
  }
  if (!transcriptOutput.value.trim()) {
    alert("Please provide an explanation.");
    return;
  }

  const response = await fetch("/api/submissions/final", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      studentId: studentInfo.studentId,
      studentName: studentInfo.studentName,
      questionId: question.id,
      questionTitle: question.title,
      transcript: transcriptOutput.value.trim()
    })
  });

  if (!response.ok) {
    const error = await response.json();
    alert(error.error || "Unable to submit final.");
    return;
  }

  currentSubmission = await response.json();
  codeInput.disabled = true;
  transcriptOutput.disabled = true;
  submitFinalBtn.disabled = true;
  recordBtn.disabled = true;
  stopRecordBtn.disabled = true;
  await loadStudentSubmissions();
}

studentModeBtn.addEventListener("click", () => setMode("student"));
facultyModeBtn.addEventListener("click", () => {
  setMode("faculty");
  loadFacultySubmissions();
});

questionSelect.addEventListener("change", async () => {
  updateQuestionDetail();
  await loadExistingSubmission();
});

studentIdInput.addEventListener("blur", async () => {
  await loadStudentSubmissions();
  await loadExistingSubmission();
});

studentNameInput.addEventListener("blur", async () => {
  await loadExistingSubmission();
});

startCodeBtn.addEventListener("click", () => {
  const studentInfo = ensureStudentInfo();
  if (!studentInfo) {
    return;
  }
  startCodeTimer();
});

submitCodeBtn.addEventListener("click", submitCode);

startExplainBtn.addEventListener("click", () => {
  if (submitCodeBtn.disabled && !currentSubmission) {
    alert("Submit code first.");
    return;
  }
  startExplainTimer();
});

submitFinalBtn.addEventListener("click", submitFinal);

recordBtn.addEventListener("click", startRecord);
stopRecordBtn.addEventListener("click", stopRecord);

refreshFacultyBtn.addEventListener("click", loadFacultySubmissions);

async function init() {
  setMode("student");
  resetSessionState();
  await fetchConfig();
  await fetchQuestions();
  initSpeechRecognition();
  await loadStudentSubmissions();
}

init();
