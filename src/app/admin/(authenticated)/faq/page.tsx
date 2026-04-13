'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

interface FAQ {
  id: string;
  question: string;
  answer: string;
  order: number;
}

export default function FAQPage() {
  const [faqs, setFaqs] = useState<FAQ[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<FAQ | null>(null);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const fetchFaqs = useCallback(async () => {
    try {
      const res = await fetch('/api/faq');
      if (res.ok) {
        const data = await res.json();
        setFaqs(data);
      }
    } catch (error) {
      console.error('Failed to fetch FAQs:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFaqs();
  }, [fetchFaqs]);

  const openAdd = () => {
    setEditing(null);
    setQuestion('');
    setAnswer('');
    setModalOpen(true);
  };

  const openEdit = (faq: FAQ) => {
    setEditing(faq);
    setQuestion(faq.question);
    setAnswer(faq.answer);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditing(null);
    setQuestion('');
    setAnswer('');
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (editing) {
        const res = await fetch(`/api/faq/${editing.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ question, answer }),
        });
        if (res.ok) {
          await fetchFaqs();
          closeModal();
        }
      } else {
        const res = await fetch('/api/faq', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ question, answer, order: faqs.length }),
        });
        if (res.ok) {
          await fetchFaqs();
          closeModal();
        }
      }
    } catch (error) {
      console.error('Failed to save FAQ:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/faq/${id}`, { method: 'DELETE' });
      if (res.ok) {
        await fetchFaqs();
      }
    } catch (error) {
      console.error('Failed to delete FAQ:', error);
    } finally {
      setDeleteConfirm(null);
    }
  };

  const handleReorder = async (index: number, direction: 'up' | 'down') => {
    const sorted = [...faqs].sort((a, b) => a.order - b.order);
    const swapIndex = direction === 'up' ? index - 1 : index + 1;
    if (swapIndex < 0 || swapIndex >= sorted.length) return;

    const itemA = sorted[index];
    const itemB = sorted[swapIndex];

    try {
      await Promise.all([
        fetch(`/api/faq/${itemA.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ question: itemA.question, answer: itemA.answer, order: itemB.order }),
        }),
        fetch(`/api/faq/${itemB.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ question: itemB.question, answer: itemB.answer, order: itemA.order }),
        }),
      ]);
      await fetchFaqs();
    } catch (error) {
      console.error('Failed to reorder FAQs:', error);
    }
  };

  if (loading) return <div className="flex justify-center py-12"><p className="text-gray-500">Loading FAQs...</p></div>;

  const sorted = [...faqs].sort((a, b) => a.order - b.order);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">FAQ Management</h1>
        <Button onClick={openAdd}>Add FAQ</Button>
      </div>

      {sorted.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-gray-500">No FAQs added yet. Click &quot;Add FAQ&quot; to create one.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {sorted.map((faq, index) => (
            <Card key={faq.id}>
              <CardHeader>
                <div className="flex justify-between items-start">
                  <CardTitle className="text-lg">{faq.question}</CardTitle>
                  <div className="flex gap-1 shrink-0 ml-4">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleReorder(index, 'up')}
                      disabled={index === 0}
                    >
                      Up
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleReorder(index, 'down')}
                      disabled={index === sorted.length - 1}
                    >
                      Down
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => openEdit(faq)}>Edit</Button>
                    {deleteConfirm === faq.id ? (
                      <>
                        <Button size="sm" variant="danger" onClick={() => handleDelete(faq.id)}>Confirm</Button>
                        <Button size="sm" variant="outline" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
                      </>
                    ) : (
                      <Button size="sm" variant="danger" onClick={() => setDeleteConfirm(faq.id)}>Delete</Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-gray-600 whitespace-pre-wrap">{faq.answer}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="w-full max-w-lg mx-4">
            <CardHeader>
              <CardTitle>{editing ? 'Edit FAQ' : 'Add FAQ'}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Question</label>
                <Input
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  placeholder="Enter the question"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Answer</label>
                <Textarea
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  placeholder="Enter the answer"
                  rows={4}
                />
              </div>
            </CardContent>
            <div className="flex justify-end gap-2 p-6 pt-0">
              <Button variant="outline" onClick={closeModal}>Cancel</Button>
              <Button onClick={handleSave} disabled={saving || !question.trim() || !answer.trim()}>
                {saving ? 'Saving...' : editing ? 'Update' : 'Add'}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
