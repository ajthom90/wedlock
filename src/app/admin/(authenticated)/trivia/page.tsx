'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';

interface Question {
  id: string;
  question: string;
  choices: string[];
  correctIndex: number;
  explanation: string | null;
  order: number;
}

const emptyForm = {
  question: '',
  choices: ['', ''],
  correctIndex: 0,
  explanation: '',
};

export default function TriviaAdminPage() {
  const [items, setItems] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Question | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const fetchItems = useCallback(async () => {
    try {
      const res = await fetch('/api/trivia');
      if (res.ok) setItems(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const openAdd = () => {
    setEditing(null);
    setForm(emptyForm);
    setModalOpen(true);
  };

  const openEdit = (q: Question) => {
    setEditing(q);
    setForm({
      question: q.question,
      choices: q.choices.length >= 2 ? [...q.choices] : [...q.choices, ''],
      correctIndex: q.correctIndex,
      explanation: q.explanation || '',
    });
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditing(null);
    setForm(emptyForm);
  };

  const updateChoice = (idx: number, value: string) => {
    const choices = [...form.choices];
    choices[idx] = value;
    setForm({ ...form, choices });
  };

  const addChoice = () => {
    if (form.choices.length >= 6) return;
    setForm({ ...form, choices: [...form.choices, ''] });
  };

  const removeChoice = (idx: number) => {
    if (form.choices.length <= 2) return;
    const choices = form.choices.filter((_, i) => i !== idx);
    let correctIndex = form.correctIndex;
    if (correctIndex === idx) correctIndex = 0;
    else if (correctIndex > idx) correctIndex -= 1;
    setForm({ ...form, choices, correctIndex });
  };

  const handleSave = async () => {
    const nonEmptyChoices = form.choices.map((c) => c.trim()).filter((c) => c);
    if (!form.question.trim() || nonEmptyChoices.length < 2) return;
    if (form.correctIndex >= nonEmptyChoices.length) return;
    setSaving(true);
    try {
      const body = {
        question: form.question.trim(),
        choices: nonEmptyChoices,
        correctIndex: form.correctIndex,
        explanation: form.explanation.trim() || null,
      };
      const url = editing ? `/api/trivia/${editing.id}` : '/api/trivia';
      const method = editing ? 'PUT' : 'POST';
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (res.ok) { await fetchItems(); closeModal(); }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    await fetch(`/api/trivia/${id}`, { method: 'DELETE' });
    await fetchItems();
    setDeleteConfirm(null);
  };

  if (loading) return <div className="flex justify-center py-12"><p className="text-gray-500">Loading trivia...</p></div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Trivia</h1>
          <p className="text-sm text-gray-500 mt-1">Questions about the couple. Guests play on their phones during the reception.</p>
        </div>
        <div className="flex gap-2">
          <a
            href="/trivia"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center px-4 py-2 rounded-md border border-primary text-primary text-sm font-medium hover:bg-primary/10"
          >
            Preview
          </a>
          <Button onClick={openAdd}>Add Question</Button>
        </div>
      </div>

      {items.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-gray-500">
            No questions yet. Click &quot;Add Question&quot; to start building the trivia game.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((q, i) => (
            <Card key={q.id}>
              <CardContent className="py-4">
                <div className="flex justify-between items-start gap-4">
                  <div className="flex-1">
                    <p className="text-xs text-gray-500">Question {i + 1}</p>
                    <p className="font-medium mt-1">{q.question}</p>
                    <ul className="mt-2 space-y-1 text-sm">
                      {q.choices.map((c, ci) => (
                        <li key={ci} className={ci === q.correctIndex ? 'text-green-700 font-medium' : 'text-gray-700'}>
                          {ci === q.correctIndex && '✓ '}
                          {c}
                        </li>
                      ))}
                    </ul>
                    {q.explanation && <p className="text-xs text-gray-500 mt-2 italic">{q.explanation}</p>}
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Button size="sm" variant="outline" onClick={() => openEdit(q)}>Edit</Button>
                    {deleteConfirm === q.id ? (
                      <>
                        <Button size="sm" variant="danger" onClick={() => handleDelete(q.id)}>Confirm</Button>
                        <Button size="sm" variant="outline" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
                      </>
                    ) : (
                      <Button size="sm" variant="danger" onClick={() => setDeleteConfirm(q.id)}>Delete</Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <CardHeader><CardTitle>{editing ? 'Edit Question' : 'Add Question'}</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Question *</label>
                <Textarea
                  value={form.question}
                  onChange={(e) => setForm({ ...form, question: e.target.value })}
                  placeholder="How did the couple meet?"
                  rows={2}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Choices *</label>
                <div className="space-y-2">
                  {form.choices.map((choice, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <label className="flex items-center gap-2 shrink-0">
                        <input
                          type="radio"
                          name="correctIndex"
                          checked={form.correctIndex === idx}
                          onChange={() => setForm({ ...form, correctIndex: idx })}
                          className="h-4 w-4"
                        />
                      </label>
                      <Input
                        value={choice}
                        onChange={(e) => updateChoice(idx, e.target.value)}
                        placeholder={`Choice ${idx + 1}`}
                        className="flex-1"
                      />
                      {form.choices.length > 2 && (
                        <Button size="sm" variant="danger" onClick={() => removeChoice(idx)}>✕</Button>
                      )}
                    </div>
                  ))}
                </div>
                {form.choices.length < 6 && (
                  <Button size="sm" variant="outline" onClick={addChoice} className="mt-2">
                    + Add choice
                  </Button>
                )}
                <p className="text-xs text-gray-500 mt-2">Select the radio next to the correct answer.</p>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Explanation (optional)</label>
                <Textarea
                  value={form.explanation}
                  onChange={(e) => setForm({ ...form, explanation: e.target.value })}
                  placeholder="Shown to the guest after they answer."
                  rows={2}
                />
              </div>
            </CardContent>
            <CardFooter className="gap-2 justify-end">
              <Button variant="outline" onClick={closeModal} disabled={saving}>Cancel</Button>
              <Button
                onClick={handleSave}
                disabled={saving || !form.question.trim() || form.choices.filter((c) => c.trim()).length < 2}
              >
                {saving ? 'Saving...' : editing ? 'Update' : 'Add'}
              </Button>
            </CardFooter>
          </Card>
        </div>
      )}
    </div>
  );
}
