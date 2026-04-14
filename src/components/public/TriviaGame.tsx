'use client';

import { useState, useEffect } from 'react';

interface Question {
  id: string;
  question: string;
  choices: string[];
  order: number;
}

interface CheckedResult {
  id: string;
  correctIndex: number;
  explanation: string | null;
  userAnswer: number | null;
  isCorrect: boolean;
}

interface CheckResponse {
  score: number;
  total: number;
  results: CheckedResult[];
}

export function TriviaGame() {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [current, setCurrent] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<CheckResponse | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/trivia');
        if (res.ok) {
          const data: Question[] = await res.json();
          setQuestions(data);
        }
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const submit = async () => {
    setSubmitting(true);
    try {
      const res = await fetch('/api/trivia/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers }),
      });
      if (res.ok) setResult(await res.json());
    } finally {
      setSubmitting(false);
    }
  };

  const reset = () => {
    setAnswers({});
    setCurrent(0);
    setResult(null);
  };

  if (loading) return <p className="text-center text-foreground/60">Loading...</p>;

  if (questions.length === 0) {
    return (
      <p className="text-center text-foreground/60 py-8">
        No trivia questions yet. Check back during the reception!
      </p>
    );
  }

  if (result) {
    const pct = Math.round((result.score / result.total) * 100);
    return (
      <div className="space-y-6">
        <div className="text-center p-8 border border-primary/30 bg-primary/5 rounded-lg">
          <p className="text-5xl font-bold text-primary mb-2">
            {result.score}<span className="text-2xl text-foreground/50"> / {result.total}</span>
          </p>
          <p className="text-lg text-foreground/70">{pct}% — {pctMessage(pct)}</p>
        </div>
        <div className="space-y-3">
          {questions.map((q) => {
            const r = result.results.find((x) => x.id === q.id);
            if (!r) return null;
            return (
              <div key={q.id} className={`p-4 rounded-lg border ${r.isCorrect ? 'border-green-300 bg-green-50' : 'border-red-300 bg-red-50'}`}>
                <p className="font-medium mb-2">{q.question}</p>
                <p className="text-sm">
                  <span className="text-foreground/60">Your answer: </span>
                  <span className={r.isCorrect ? 'text-green-700 font-medium' : 'text-red-700'}>
                    {r.userAnswer !== null ? q.choices[r.userAnswer] : '(skipped)'}
                  </span>
                </p>
                {!r.isCorrect && (
                  <p className="text-sm text-green-700">
                    <span className="text-foreground/60">Correct answer: </span>
                    <span className="font-medium">{q.choices[r.correctIndex]}</span>
                  </p>
                )}
                {r.explanation && <p className="text-xs text-foreground/60 mt-1 italic">{r.explanation}</p>}
              </div>
            );
          })}
        </div>
        <button
          type="button"
          onClick={reset}
          className="w-full rounded-md bg-primary px-4 py-3 text-white font-medium hover:bg-primary/90"
        >
          Play Again
        </button>
      </div>
    );
  }

  const q = questions[current];
  const allAnswered = questions.every((qq) => qq.id in answers);
  const isLast = current === questions.length - 1;

  return (
    <div className="space-y-6">
      <p className="text-center text-sm text-foreground/60">
        Question {current + 1} of {questions.length}
      </p>
      <div className="p-6 border border-foreground/10 rounded-lg">
        <p className="text-xl font-medium mb-6">{q.question}</p>
        <div className="space-y-2">
          {q.choices.map((choice, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => setAnswers({ ...answers, [q.id]: idx })}
              className={`w-full text-left px-4 py-3 rounded-md border transition-colors ${
                answers[q.id] === idx
                  ? 'border-primary bg-primary/10 font-medium'
                  : 'border-foreground/10 hover:border-foreground/30'
              }`}
            >
              {choice}
            </button>
          ))}
        </div>
      </div>
      <div className="flex justify-between items-center">
        <button
          type="button"
          onClick={() => setCurrent(current - 1)}
          disabled={current === 0}
          className="px-4 py-2 rounded-md border border-foreground/20 disabled:opacity-40"
        >
          ← Back
        </button>
        {isLast ? (
          <button
            type="button"
            onClick={submit}
            disabled={!allAnswered || submitting}
            className="rounded-md bg-primary px-6 py-2.5 text-white font-medium disabled:opacity-50 hover:bg-primary/90"
          >
            {submitting ? 'Checking...' : 'See my score'}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setCurrent(current + 1)}
            disabled={!(q.id in answers)}
            className="rounded-md bg-primary px-6 py-2.5 text-white font-medium disabled:opacity-50 hover:bg-primary/90"
          >
            Next →
          </button>
        )}
      </div>
    </div>
  );
}

function pctMessage(pct: number): string {
  if (pct === 100) return 'Perfect score! 💯';
  if (pct >= 80) return 'Impressive! You know them well.';
  if (pct >= 50) return 'Not bad — a solid effort.';
  if (pct > 0) return 'You\u2019ll know them better after tonight!';
  return 'Come on, you can do better!';
}
