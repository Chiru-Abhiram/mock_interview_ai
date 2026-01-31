"use client";

import { useState, useEffect, useCallback, type DragEvent, type ChangeEvent } from "react";
import Link from "next/link";
import { Upload, CheckCircle2, ArrowRight, Mic, MicOff, Volume2, VolumeX, Home, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";


export default function ResumeUploadPage() {
    const [isDragging, setIsDragging] = useState(false);
    const [file, setFile] = useState<File | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    interface Question {
        id: number;
        text: string;
        type: "technical" | "behavioral" | "coding";
        difficulty: "easy" | "medium" | "hard";
        context: string;
        initial_code?: string;
    }

    const [questions, setQuestions] = useState<Question[]>([]);
    const [showConfig, setShowConfig] = useState(false);
    const [extractedText, setExtractedText] = useState("");
    const [difficulty, setDifficulty] = useState<"easy" | "medium" | "hard" | "mixed">("mixed");
    const [numQuestions, setNumQuestions] = useState(5);
    const [autoSelectCount, setAutoSelectCount] = useState(false);
    const [jobDescription, setJobDescription] = useState("");
    const [isTimerEnabled, setIsTimerEnabled] = useState(false);
    const [timePerQuestion, setTimePerQuestion] = useState(120); // 2 minutes default
    const [timeLeft, setTimeLeft] = useState(120);

    const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
    const [answers, setAnswers] = useState<Record<number, string>>({});
    const [evaluations, setEvaluations] = useState<Record<number, any>>({});
    const [isEvaluating, setIsEvaluating] = useState(false);
    const [isInterviewComplete, setIsInterviewComplete] = useState(false);

    const [isVoiceMode, setIsVoiceMode] = useState(false);
    const [isListening, setIsListening] = useState(false);
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [lastTranscript, setLastTranscript] = useState("");

    // --- Voice Mode Logic (Web Speech API) ---

    // TTS: Speak the question
    const speakQuestion = useCallback((text: string) => {
        if (!isVoiceMode || typeof window === 'undefined') return;

        // Stop any current speech
        window.speechSynthesis.cancel();

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.onstart = () => setIsSpeaking(true);
        utterance.onend = () => setIsSpeaking(false);
        utterance.onerror = () => setIsSpeaking(false);

        // Optional: Customize voice
        const voices = window.speechSynthesis.getVoices();
        const preferredVoice = voices.find(v => v.name.includes('Google') && v.lang.startsWith('en')) || voices[0];
        if (preferredVoice) utterance.voice = preferredVoice;

        window.speechSynthesis.speak(utterance);
    }, [isVoiceMode]);

    // STT: Recognize user speech
    const startListening = () => {
        if (typeof window === 'undefined') return;

        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (!SpeechRecognition) {
            alert("Speech recognition is not supported in this browser.");
            return;
        }

        const recognition = new SpeechRecognition();
        recognition.lang = 'en-US';
        recognition.continuous = false;
        recognition.interimResults = false;

        recognition.onstart = () => {
            setIsListening(true);
            setLastTranscript("Listening...");
        };
        recognition.onend = () => setIsListening(false);
        recognition.onerror = (event: any) => {
            console.error("Speech recognition error", event.error);
            setIsListening(false);
            setLastTranscript("Error recognizing speech.");
        };

        recognition.onresult = (event: any) => {
            const transcript = event.results[0][0].transcript;
            setLastTranscript(transcript);
            setAnswers(prev => ({
                ...prev,
                [currentQuestionIndex]: (prev[currentQuestionIndex] || "") + (prev[currentQuestionIndex] ? " " : "") + transcript
            }));
        };

        recognition.start();
    };

    // Auto-speak and Reset Timer when question changes
    useEffect(() => {
        if (questions.length > 0 && !isInterviewComplete) {
            const currentQuestion = questions[currentQuestionIndex];
            speakQuestion(currentQuestion?.text || "");
            if (isTimerEnabled) {
                setTimeLeft(timePerQuestion);
            }

            // Populate initial code for coding questions if the answer is empty
            if (currentQuestion?.type === 'coding' && currentQuestion.initial_code && !answers[currentQuestionIndex]) {
                setAnswers(prev => ({
                    ...prev,
                    [currentQuestionIndex]: currentQuestion.initial_code || ""
                }));
            }
        }
    }, [currentQuestionIndex, questions, isInterviewComplete, speakQuestion, isTimerEnabled, timePerQuestion]);

    // Timer Countdown Logic
    useEffect(() => {
        if (!isTimerEnabled || isInterviewComplete || questions.length === 0 || isEvaluating) return;

        const timer = setInterval(() => {
            setTimeLeft((prev) => {
                if (prev <= 1) {
                    clearInterval(timer);
                    // Auto-advance logic
                    if (currentQuestionIndex < questions.length - 1) {
                        setCurrentQuestionIndex(prevIndex => prevIndex + 1);
                    } else {
                        handleSubmitAllAnswers();
                    }
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);

        return () => clearInterval(timer);
    }, [isTimerEnabled, currentQuestionIndex, questions.length, isInterviewComplete, isEvaluating]);

    const handleUpload = async () => {
        if (!file) return;
        setIsLoading(true);

        try {
            const formData = new FormData();
            formData.append("file", file);

            // 1. Upload Resume
            const uploadRes = await fetch("http://localhost:8000/upload_resume", {
                method: "POST",
                body: formData,
            });

            if (!uploadRes.ok) {
                const errorData = await uploadRes.json().catch(() => ({}));
                throw new Error(errorData.detail || "Upload failed");
            }

            const data = await uploadRes.json();
            setExtractedText(data.extracted_text);
            setShowConfig(true); // Show configuration screen

        } catch (error: any) {
            console.error(error);
            alert("Error processing resume: " + error.message);
        } finally {
            setIsLoading(false);
        }
    };

    const handleGenerateQuestions = async () => {
        setIsLoading(true);

        try {
            // 2. Generate Questions with custom parameters
            const qcRes = await fetch("http://localhost:8000/generate_questions", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    resume_text: extractedText,
                    difficulty: difficulty,
                    num_questions: numQuestions,
                    job_description: jobDescription,
                    auto_select_count: autoSelectCount
                })
            });

            if (!qcRes.ok) {
                const errData = await qcRes.json();
                throw new Error(errData.detail || "Failed to generate questions");
            }

            const qData = await qcRes.json();

            if (qData.questions && qData.questions.length > 0) {
                setQuestions(qData.questions);
                setShowConfig(false); // Only hide config if we have questions
            } else {
                throw new Error("No questions were generated. Please try again.");
            }

        } catch (error) {
            console.error(error);
            alert("Error generating questions: " + error);
            setShowConfig(true); // Ensure config stays visible on error
        } finally {
            setIsLoading(false);
        }
    };

    const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setIsDragging(false);
    };

    const handleDrop = (e: DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setIsDragging(false);

        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            setFile(e.dataTransfer.files[0]);
        }
    };

    const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setFile(e.target.files[0]);
        }
    };


    const handleNext = () => {
        // Stop any ongoing speech when moving to next question
        if (typeof window !== 'undefined') {
            window.speechSynthesis.cancel();
        }
        if (currentQuestionIndex < questions.length - 1) {
            setCurrentQuestionIndex(prev => prev + 1);
        }
    };

    const handlePrevious = () => {
        // Stop any ongoing speech when moving to previous question
        if (typeof window !== 'undefined') {
            window.speechSynthesis.cancel();
        }
        if (currentQuestionIndex > 0) {
            setCurrentQuestionIndex(prev => prev - 1);
        }
    };

    const handleSubmitAllAnswers = async () => {
        setIsEvaluating(true);
        const newEvaluations: Record<number, any> = {};

        try {
            // Evaluate all answers in parallel or sequence
            // Using sequence to avoid overloading or order issues, 
            // but parallel would be faster. Let's do parallel for better speed.
            const evaluationPromises = questions.map(async (q, index) => {
                const answer = answers[index] || "No answer provided.";
                const res = await fetch("http://localhost:8000/evaluate_answer", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ question: q.text, answer })
                });
                if (res.ok) {
                    const result = await res.json();
                    newEvaluations[index] = result;
                }
            });

            await Promise.all(evaluationPromises);
            setEvaluations(newEvaluations);

            // Stop any ongoing speech before showing results
            if (typeof window !== 'undefined') {
                window.speechSynthesis.cancel();
            }

            setIsInterviewComplete(true);
        } catch (err) {
            alert("Failed to evaluate all answers. Please try again.");
        } finally {
            setIsEvaluating(false);
        }
    };

    return (
        <div className="min-h-screen flex flex-col items-center justify-center p-4 py-20 bg-background text-foreground transition-colors duration-500 relative">
            {/* Immersive Voice Overlay */}

            <div className="w-full max-w-2xl space-y-8">
                {isLoading ? (
                    <div className="flex flex-col items-center justify-center space-y-6 py-20 animate-in fade-in duration-500">
                        <div className="relative w-24 h-24">
                            <div className="absolute inset-0 border-4 border-primary/20 rounded-full"></div>
                            <div className="absolute inset-0 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
                        </div>
                        <div className="text-center space-y-2">
                            <h2 className="text-2xl font-bold animate-pulse">AI is working...</h2>
                            <p className="text-muted-foreground">Tailoring questions to your background</p>
                        </div>
                    </div>
                ) : questions.length === 0 && !showConfig ? (
                    <>
                        <div className="text-center space-y-2">
                            <h1 className="text-3xl font-bold tracking-tight">Upload Your Resume</h1>
                            <p className="text-muted-foreground">
                                We'll analyze your experience to generate tailored interview questions.
                            </p>
                        </div>
                        {/* Drag and Drop UI (Keep existing) */}
                        <div
                            className={cn(
                                "relative group cursor-pointer flex flex-col items-center justify-center w-full h-64 rounded-3xl border-2 border-dashed transition-all duration-300",
                                isDragging
                                    ? "border-primary bg-primary/10 scale-[1.02]"
                                    : "border-muted-foreground/25 bg-secondary/30 hover:bg-secondary/50 hover:border-primary/50",
                                file && "border-primary/50 bg-primary/5"
                            )}
                            onDragOver={handleDragOver}
                            onDragLeave={handleDragLeave}
                            onDrop={handleDrop}
                            onClick={() => document.getElementById("file-upload")?.click()}
                        >
                            <input
                                id="file-upload"
                                type="file"
                                className="hidden"
                                accept=".pdf,.docx,.txt"
                                onChange={handleFileChange}
                            />

                            <div className="flex flex-col items-center justify-center space-y-4 text-center p-8">
                                <div className={cn(
                                    "p-4 rounded-full transition-all duration-300",
                                    file ? "bg-green-500/20 text-green-500" : "bg-primary/10 text-primary group-hover:scale-110"
                                )}>
                                    {file ? <CheckCircle2 className="w-8 h-8" /> : <Upload className="w-8 h-8" />}
                                </div>

                                <div className="space-y-1">
                                    {file ? (
                                        <>
                                            <p className="text-lg font-medium text-foreground">{file.name}</p>
                                            <p className="text-sm text-muted-foreground">
                                                {(file.size / 1024 / 1024).toFixed(2)} MB
                                            </p>
                                        </>
                                    ) : (
                                        <>
                                            <p className="text-lg font-medium text-foreground">
                                                Click to upload or drag and drop
                                            </p>
                                            <p className="text-sm text-muted-foreground">
                                                PDF, DOCX, or TXT (Max 10MB)
                                            </p>
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="flex justify-end">
                            <button
                                onClick={handleUpload}
                                disabled={!file || isLoading}
                                className="w-full sm:w-auto inline-flex h-12 items-center justify-center rounded-full bg-primary px-8 text-base font-medium text-white shadow-lg transition-all hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isLoading ? "Analyzing..." : "Continue"} <ArrowRight className="ml-2 h-4 w-4" />
                            </button>
                        </div>
                    </>
                ) : showConfig ? (
                    <div className="space-y-6 animate-in fade-in zoom-in-95 duration-500">
                        <div className="text-center space-y-2">
                            <h1 className="text-3xl font-bold tracking-tight">Customize Your Interview</h1>
                            <p className="text-muted-foreground">
                                Configure the difficulty and number of questions
                            </p>
                        </div>

                        <div className="p-8 rounded-3xl border bg-card shadow-2xl space-y-6">
                            {/* Difficulty Selector */}
                            <div className="space-y-3">
                                <label className="text-sm font-semibold text-foreground">Difficulty Level</label>
                                <div className="grid grid-cols-4 gap-3">
                                    {(["easy", "medium", "hard", "mixed"] as const).map((level) => (
                                        <button
                                            key={level}
                                            onClick={() => setDifficulty(level)}
                                            className={cn(
                                                "px-4 py-3 rounded-xl font-medium text-sm transition-all capitalize",
                                                difficulty === level
                                                    ? "bg-primary text-white shadow-lg scale-105"
                                                    : "bg-secondary/50 hover:bg-secondary text-foreground"
                                            )}
                                        >
                                            {level}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Number of Questions */}
                            <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <label className="text-sm font-semibold text-foreground">
                                        Number of Questions {autoSelectCount ? "" : "(1-20)"}
                                    </label>
                                    <button
                                        onClick={() => setAutoSelectCount(!autoSelectCount)}
                                        className={cn(
                                            "flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all",
                                            autoSelectCount
                                                ? "bg-primary text-white shadow-md shadow-primary/20"
                                                : "bg-secondary text-muted-foreground hover:bg-secondary/80"
                                        )}
                                    >
                                        <Sparkles className={cn("h-3 w-3", autoSelectCount ? "animate-pulse" : "")} />
                                        AI Optimized
                                    </button>
                                </div>
                                {autoSelectCount ? (
                                    <div className="p-4 rounded-xl bg-primary/5 border border-primary/10 flex items-center gap-3">
                                        <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center">
                                            <Sparkles className="h-4 w-4 text-primary animate-pulse" />
                                        </div>
                                        <div>
                                            <p className="text-xs font-bold text-primary italic">AI will determine the length</p>
                                            <p className="text-[10px] text-muted-foreground">Tailored based on resume depth & JD</p>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        <input
                                            type="number"
                                            min="1"
                                            max="20"
                                            value={numQuestions}
                                            onChange={(e) => setNumQuestions(Math.min(20, Math.max(1, parseInt(e.target.value) || 1)))}
                                            className="w-full px-4 py-3 rounded-xl bg-secondary/30 border border-input focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all text-lg"
                                        />
                                        <input
                                            type="range"
                                            min="1"
                                            max="20"
                                            value={numQuestions}
                                            onChange={(e) => setNumQuestions(parseInt(e.target.value))}
                                            className="w-full h-1.5 bg-secondary rounded-lg appearance-none cursor-pointer accent-primary"
                                        />
                                    </div>
                                )}
                            </div>

                            {/* Job Description */}
                            <div className="space-y-3">
                                <label className="text-sm font-semibold text-foreground">Job Description (Optional)</label>
                                <textarea
                                    value={jobDescription}
                                    onChange={(e) => setJobDescription(e.target.value)}
                                    placeholder="Paste the job description here to get more targeted questions..."
                                    className="w-full min-h-[120px] px-4 py-3 rounded-xl bg-secondary/30 border border-input focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all resize-none"
                                />
                            </div>

                            {/* Timer Toggle */}
                            <div className="flex flex-col space-y-4 p-4 rounded-xl bg-secondary/20 border border-white/5">
                                <div className="flex items-center justify-between">
                                    <div className="space-y-0.5">
                                        <p className="text-sm font-semibold">Enable Timer</p>
                                        <p className="text-xs text-muted-foreground">Limit your answer time per question</p>
                                    </div>
                                    <button
                                        onClick={() => setIsTimerEnabled(!isTimerEnabled)}
                                        className={cn(
                                            "relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none",
                                            isTimerEnabled ? "bg-primary" : "bg-muted"
                                        )}
                                    >
                                        <span
                                            className={cn(
                                                "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
                                                isTimerEnabled ? "translate-x-6" : "translate-x-1"
                                            )}
                                        />
                                    </button>
                                </div>

                                {isTimerEnabled && (
                                    <div className="space-y-2 animate-in slide-in-from-top-2 duration-300">
                                        <div className="flex justify-between text-xs font-medium">
                                            <span>Time per question</span>
                                            <span className="text-primary">{Math.floor(timePerQuestion / 60)}m {timePerQuestion % 60}s</span>
                                        </div>
                                        <input
                                            type="range"
                                            min="30"
                                            max="600"
                                            step="30"
                                            value={timePerQuestion}
                                            onChange={(e) => setTimePerQuestion(parseInt(e.target.value))}
                                            className="w-full h-1.5 bg-secondary rounded-lg appearance-none cursor-pointer accent-primary"
                                        />
                                    </div>
                                )}
                            </div>

                            {/* Voice Mode Toggle */}
                            <div className="flex items-center justify-between p-4 rounded-xl bg-secondary/20 border border-white/5">
                                <div className="space-y-0.5">
                                    <p className="text-sm font-semibold">Enable Voice Mode</p>
                                    <p className="text-xs text-muted-foreground">Hear questions and speak your answers</p>
                                </div>
                                <button
                                    onClick={() => setIsVoiceMode(!isVoiceMode)}
                                    className={cn(
                                        "relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none",
                                        isVoiceMode ? "bg-primary" : "bg-muted"
                                    )}
                                >
                                    <span
                                        className={cn(
                                            "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
                                            isVoiceMode ? "translate-x-6" : "translate-x-1"
                                        )}
                                    />
                                </button>
                            </div>

                            <button
                                onClick={handleGenerateQuestions}
                                disabled={isLoading}
                                className="w-full inline-flex h-12 items-center justify-center rounded-full bg-primary px-8 text-base font-medium text-white shadow-lg transition-all hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isLoading ? "Generating Questions..." : "Generate Questions"} <ArrowRight className="ml-2 h-4 w-4" />
                            </button>
                        </div>
                    </div>
                ) : isInterviewComplete ? (
                    <div className="space-y-6 animate-in fade-in zoom-in-95 duration-500">
                        <div className="text-center space-y-2">
                            <h1 className="text-4xl font-bold tracking-tight">🎉 Interview Complete!</h1>
                            <p className="text-muted-foreground">
                                Great job! Here's how you performed.
                            </p>
                        </div>

                        <div className="p-8 rounded-3xl border bg-card shadow-2xl space-y-6">
                            {/* Overall Score */}
                            <div className="text-center p-6 bg-gradient-to-br from-primary/20 to-blue-500/10 rounded-2xl">
                                <p className="text-sm font-semibold text-muted-foreground mb-2">Average Score</p>
                                <p className="text-6xl font-black text-primary">
                                    {(Object.values(evaluations).length > 0
                                        ? Object.values(evaluations).reduce((sum: number, e: any) => sum + e.score, 0) / Object.values(evaluations).length
                                        : 0).toFixed(1)}
                                </p>
                                <p className="text-sm text-muted-foreground mt-2">out of 10</p>
                            </div>

                            {/* Stats */}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="p-4 bg-secondary/30 rounded-xl text-center">
                                    <p className="text-2xl font-bold">{questions.length}</p>
                                    <p className="text-sm text-muted-foreground">Questions Answered</p>
                                </div>
                                <div className="p-4 bg-secondary/30 rounded-xl text-center">
                                    <p className="text-2xl font-bold">
                                        {Object.values(evaluations).filter((e: any) => e.score >= 7).length}
                                    </p>
                                    <p className="text-sm text-muted-foreground">Strong Answers (7+)</p>
                                </div>
                            </div>

                            {/* Individual Question Scores */}
                            <div className="space-y-3">
                                <h3 className="font-semibold text-lg">Question Breakdown</h3>
                                {questions.map((q, idx) => (
                                    <div key={idx} className="space-y-4 p-6 bg-secondary/20 rounded-2xl border border-white/5">
                                        <div className="flex items-start justify-between gap-4">
                                            <div className="flex-1">
                                                <p className="font-bold text-lg mb-1">{q.text}</p>
                                                <div className="flex gap-2">
                                                    <span className="text-xs text-muted-foreground capitalize font-medium">{q.type}</span>
                                                    <span className="text-xs text-muted-foreground">•</span>
                                                    <span className="text-xs text-muted-foreground capitalize font-medium">{q.difficulty}</span>
                                                </div>
                                            </div>
                                            <span className={cn(
                                                "text-2xl font-black shrink-0",
                                                evaluations[idx]?.score >= 7 ? "text-green-500" :
                                                    evaluations[idx]?.score >= 5 ? "text-yellow-500" : "text-red-500"
                                            )}>
                                                {evaluations[idx]?.score || 0}/10
                                            </span>
                                        </div>

                                        {/* Original Answer Display */}
                                        <div className="p-4 bg-background/50 rounded-xl border border-white/5">
                                            <p className="text-xs font-bold uppercase text-muted-foreground mb-2">Your Answer</p>
                                            <p className="text-sm text-foreground/90 leading-relaxed italic">
                                                "{answers[idx] || "No answer provided."}"
                                            </p>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div className="p-4 bg-primary/5 rounded-xl">
                                                <p className="text-xs font-bold uppercase text-primary/70 mb-1">Feedback</p>
                                                <p className="text-sm text-foreground/90">
                                                    {evaluations[idx]?.feedback || "No feedback available."}
                                                </p>
                                            </div>
                                            <div className="p-4 bg-green-500/5 rounded-xl">
                                                <p className="text-xs font-bold uppercase text-green-500/70 mb-1">Improvements</p>
                                                <p className="text-sm text-foreground/90">
                                                    {evaluations[idx]?.improvements || "No specific improvements."}
                                                </p>
                                            </div>
                                        </div>

                                        {/* Ideal Answer Display */}
                                        <div className="p-4 bg-blue-500/5 rounded-xl border border-blue-500/10">
                                            <p className="text-xs font-bold uppercase text-blue-500/70 mb-2">Ideal Answer (Sample)</p>
                                            <p className="text-sm text-foreground/90 leading-relaxed italic">
                                                {evaluations[idx]?.ideal_answer || "No ideal answer provided."}
                                            </p>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Action Buttons */}
                            <div className="flex flex-col sm:flex-row gap-4 pt-4">
                                <button
                                    onClick={() => {
                                        setQuestions([]);
                                        setAnswers({});
                                        setEvaluations({});
                                        setCurrentQuestionIndex(0);
                                        setIsInterviewComplete(false);
                                        setFile(null);
                                        setExtractedText("");
                                    }}
                                    className="flex-1 inline-flex h-12 items-center justify-center rounded-full bg-primary px-8 text-base font-medium text-white shadow-lg transition-all hover:bg-primary/90 hover:scale-105"
                                >
                                    Start New Interview
                                </button>
                                <button
                                    onClick={() => {
                                        setCurrentQuestionIndex(0);
                                        setIsInterviewComplete(false);
                                    }}
                                    className="flex-1 inline-flex h-12 items-center justify-center rounded-full border border-primary/20 bg-primary/10 px-8 text-base font-medium text-primary transition-all hover:bg-primary/20"
                                >
                                    Review Answers
                                </button>
                                <Link
                                    href="/"
                                    className="flex-1 inline-flex h-12 items-center justify-center rounded-full border border-white/10 bg-white/5 backdrop-blur-sm px-8 text-base font-medium transition-colors hover:bg-white/10"
                                >
                                    <Home className="mr-2 h-4 w-4" /> Home
                                </Link>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-6 animate-in fade-in zoom-in-95 duration-500">
                        {/* Progress Bar */}
                        <div className="w-full bg-secondary rounded-full h-2.5 mb-6">
                            <div
                                className="bg-primary h-2.5 rounded-full transition-all duration-500"
                                style={{ width: `${((currentQuestionIndex + 1) / questions.length) * 100}%` }}
                            ></div>
                        </div>

                        <div className="flex items-center justify-between">
                            <div className="flex flex-col">
                                <span className="text-sm font-medium text-muted-foreground">
                                    Question {currentQuestionIndex + 1} of {questions.length}
                                </span>
                                {isTimerEnabled && (
                                    <span className={cn(
                                        "text-lg font-bold tabular-nums",
                                        timeLeft <= 10 ? "text-red-500 animate-pulse" : "text-primary"
                                    )}>
                                        {Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')}
                                    </span>
                                )}
                            </div>
                            <div className="flex gap-2">
                                <span className={cn(
                                    "px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider",
                                    questions[currentQuestionIndex]?.type === 'coding' ? "bg-purple-500/10 text-purple-500" :
                                        questions[currentQuestionIndex]?.type === 'technical' ? "bg-blue-500/10 text-blue-500" :
                                            "bg-orange-500/10 text-orange-500"
                                )}>
                                    {questions[currentQuestionIndex]?.type || "N/A"}
                                </span>
                                <span className={cn(
                                    "px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider",
                                    questions[currentQuestionIndex]?.difficulty === 'easy' ? "bg-green-500/10 text-green-500" :
                                        questions[currentQuestionIndex]?.difficulty === 'medium' ? "bg-yellow-500/10 text-yellow-500" :
                                            "bg-red-500/10 text-red-500"
                                )}>
                                    {questions[currentQuestionIndex]?.difficulty || "N/A"}
                                </span>
                            </div>
                        </div>

                        <div className="p-8 rounded-3xl border bg-card text-card-foreground shadow-2xl relative overflow-hidden">

                            {/* Question Card */}
                            <h2 className="text-2xl font-bold leading-relaxed mb-4">
                                {questions[currentQuestionIndex]?.text}
                            </h2>

                            <div className="mb-6 p-4 bg-secondary/30 rounded-xl text-sm text-muted-foreground italic border-l-4 border-primary/50">
                                💡 {questions[currentQuestionIndex]?.context}
                            </div>

                            {questions[currentQuestionIndex]?.type === 'coding' ? (
                                <div className="relative group">
                                    <div className="absolute -inset-0.5 bg-gradient-to-r from-primary to-purple-600 rounded-xl blur opacity-25 group-focus-within:opacity-50 transition duration-500"></div>
                                    <textarea
                                        className="relative w-full min-h-[300px] p-4 rounded-xl bg-secondary/80 border border-white/10 focus:border-primary outline-none transition-all resize-y text-sm font-mono leading-relaxed"
                                        placeholder="// Write your code here..."
                                        spellCheck={false}
                                        value={answers[currentQuestionIndex] || ""}
                                        onChange={(e) => setAnswers(prev => ({ ...prev, [currentQuestionIndex]: e.target.value }))}
                                    />
                                    <div className="absolute top-3 right-3 px-2 py-1 rounded-md bg-white/5 border border-white/10 text-[10px] uppercase font-bold text-muted-foreground backdrop-blur-sm">
                                        Editor Mode
                                    </div>
                                </div>
                            ) : (
                                <textarea
                                    className="w-full min-h-[150px] p-4 rounded-xl bg-secondary/30 border border-input focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all resize-none text-lg"
                                    placeholder={isListening ? "Listening..." : "Type or speak your answer here..."}
                                    value={answers[currentQuestionIndex] || ""}
                                    onChange={(e) => setAnswers(prev => ({ ...prev, [currentQuestionIndex]: e.target.value }))}
                                />
                            )}

                            {isVoiceMode && (
                                <div className="mt-4 flex gap-3">
                                    <button
                                        onClick={startListening}
                                        className={cn(
                                            "flex-1 inline-flex h-12 items-center justify-center rounded-xl font-medium transition-all text-sm",
                                            isListening
                                                ? "bg-red-500 text-white animate-pulse"
                                                : "bg-secondary hover:bg-secondary/80 text-foreground"
                                        )}
                                    >
                                        {isListening ? (
                                            <><MicOff className="mr-2 h-5 w-5" /> Recording...</>
                                        ) : (
                                            <><Mic className="mr-2 h-5 w-5" /> Speak Answer</>
                                        )}
                                    </button>
                                    <button
                                        onClick={() => speakQuestion(questions[currentQuestionIndex]?.text || "")}
                                        className="inline-flex w-12 h-12 items-center justify-center rounded-xl bg-secondary hover:bg-secondary/80 text-foreground transition-all"
                                        title="Repeat Question"
                                    >
                                        {isSpeaking ? <Volume2 className="h-5 w-5 text-primary animate-bounce" /> : <Volume2 className="h-5 w-5" />}
                                    </button>
                                </div>
                            )}


                            <div className="mt-8 flex items-center justify-between">
                                <button
                                    onClick={handlePrevious}
                                    disabled={currentQuestionIndex === 0 || isEvaluating}
                                    className="px-6 py-2 rounded-full text-muted-foreground hover:bg-secondary disabled:opacity-0 transition-colors"
                                >
                                    Previous
                                </button>

                                {currentQuestionIndex === questions.length - 1 ? (
                                    <button
                                        onClick={handleSubmitAllAnswers}
                                        disabled={isEvaluating}
                                        className="inline-flex h-12 items-center justify-center rounded-full bg-primary px-8 text-base font-medium text-white shadow-lg transition-all hover:bg-primary/90 hover:scale-105 disabled:opacity-50"
                                    >
                                        {isEvaluating ? "Analyzing All Answers..." : "Submit All Answers"} <CheckCircle2 className="ml-2 h-4 w-4" />
                                    </button>
                                ) : (
                                    <button
                                        onClick={handleNext}
                                        className="inline-flex h-12 items-center justify-center rounded-full bg-primary px-8 text-base font-medium text-white shadow-lg transition-all hover:bg-primary/90 hover:scale-105"
                                    >
                                        Next Question <ArrowRight className="ml-2 h-4 w-4" />
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                )
                }
            </div >
        </div >
    );
}
