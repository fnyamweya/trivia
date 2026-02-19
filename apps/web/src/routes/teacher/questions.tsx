import { createFileRoute, Link } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useAuthStore } from '@/stores/auth';
import { api } from '@/lib/api';

export const Route = createFileRoute('/teacher/questions')({
  component: QuestionsPage,
});

function QuestionsPage() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const [showCreateModal, setShowCreateModal] = useState(false);

  const { data: questions, isLoading } = useQuery({
    queryKey: ['questions'],
    queryFn: async () => {
      const res = await api.get('/questions');
      return res.data;
    },
    enabled: !!user && user.role === 'teacher',
  });

  const { data: topics } = useQuery({
    queryKey: ['topics'],
    queryFn: async () => {
      const res = await api.get('/topics');
      return res.data;
    },
    enabled: !!user && user.role === 'teacher',
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/questions/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['questions'] });
    },
  });

  // Redirect if not logged in
  if (!user || user.role !== 'teacher') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Link to="/teacher/login" className="btn-primary">
          Login Required
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <header className="bg-white shadow">
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Question Bank</h1>
            <p className="text-sm text-gray-500">
              {questions?.items?.length ?? 0} questions
            </p>
          </div>
          <div className="flex gap-4">
            <Link to="/teacher/dashboard" className="btn-secondary">
              ← Back
            </Link>
            <button
              onClick={() => setShowCreateModal(true)}
              className="btn-primary"
            >
              + Add Question
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {isLoading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto" />
          </div>
        ) : questions?.items?.length === 0 ? (
          <div className="card text-center py-12">
            <p className="text-gray-500 mb-4">No questions yet</p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="btn-primary"
            >
              Create Your First Question
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {questions?.items?.map((question: any) => (
              <div key={question.id} className="card">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <h3 className="font-medium text-lg">{question.stem}</h3>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      {question.choices.map((choice: any, i: number) => (
                        <div
                          key={choice.id}
                          className={`p-2 rounded text-sm ${
                            choice.isCorrect
                              ? 'bg-green-100 text-green-800 font-medium'
                              : 'bg-gray-100'
                          }`}
                        >
                          {String.fromCharCode(65 + i)}. {choice.text}
                        </div>
                      ))}
                    </div>
                    <div className="mt-3 flex gap-2">
                      {question.tags?.map((tag: any) => (
                        <span
                          key={tag.id}
                          className="px-2 py-0.5 bg-gray-200 rounded text-xs"
                        >
                          {tag.name}
                        </span>
                      ))}
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      if (confirm('Delete this question?')) {
                        deleteMutation.mutate(question.id);
                      }
                    }}
                    className="text-red-600 hover:text-red-800 text-sm ml-4"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Create Modal */}
      {showCreateModal && (
        <CreateQuestionModal
          topics={topics?.items ?? []}
          onClose={() => setShowCreateModal(false)}
          onCreated={() => {
            setShowCreateModal(false);
            queryClient.invalidateQueries({ queryKey: ['questions'] });
          }}
        />
      )}
    </div>
  );
}

function CreateQuestionModal({
  topics,
  onClose,
  onCreated,
}: {
  topics: any[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [stem, setStem] = useState('');
  const [choices, setChoices] = useState([
    { text: '', isCorrect: true },
    { text: '', isCorrect: false },
    { text: '', isCorrect: false },
    { text: '', isCorrect: false },
  ]);
  const [topicId, setTopicId] = useState('');
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium');
  const [error, setError] = useState('');

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post('/questions', {
        stem,
        choices: choices.filter((c) => c.text.trim()),
        topicId: topicId || undefined,
        difficulty,
      });
      return res.data;
    },
    onSuccess: () => {
      onCreated();
    },
    onError: (err: any) => {
      setError(err.response?.data?.error?.message || 'Failed to create question');
    },
  });

  const setCorrectChoice = (index: number) => {
    setChoices(
      choices.map((c, i) => ({
        ...c,
        isCorrect: i === index,
      }))
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const validChoices = choices.filter((c) => c.text.trim());
    if (validChoices.length < 2) {
      setError('At least 2 choices required');
      return;
    }
    if (!validChoices.some((c) => c.isCorrect)) {
      setError('Select the correct answer');
      return;
    }
    createMutation.mutate();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <h2 className="text-xl font-bold mb-4">Create Question</h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Question</label>
              <textarea
                value={stem}
                onChange={(e) => setStem(e.target.value)}
                className="input min-h-[80px]"
                placeholder="Enter your question..."
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                Choices (click to mark correct)
              </label>
              <div className="space-y-2">
                {choices.map((choice, i) => (
                  <div key={i} className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setCorrectChoice(i)}
                      className={`w-8 h-10 rounded flex items-center justify-center ${
                        choice.isCorrect
                          ? 'bg-green-500 text-white'
                          : 'bg-gray-200 hover:bg-gray-300'
                      }`}
                    >
                      {String.fromCharCode(65 + i)}
                    </button>
                    <input
                      type="text"
                      value={choice.text}
                      onChange={(e) => {
                        const newChoices = [...choices];
                        newChoices[i].text = e.target.value;
                        setChoices(newChoices);
                      }}
                      className="input flex-1"
                      placeholder={`Choice ${String.fromCharCode(65 + i)}`}
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Topic</label>
                <select
                  value={topicId}
                  onChange={(e) => setTopicId(e.target.value)}
                  className="input"
                >
                  <option value="">No topic</option>
                  {topics.map((topic) => (
                    <option key={topic.id} value={topic.id}>
                      {topic.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Difficulty</label>
                <select
                  value={difficulty}
                  onChange={(e) => setDifficulty(e.target.value as any)}
                  className="input"
                >
                  <option value="easy">Easy</option>
                  <option value="medium">Medium</option>
                  <option value="hard">Hard</option>
                </select>
              </div>
            </div>

            {error && (
              <div className="p-3 bg-red-50 text-red-600 rounded text-sm">
                {error}
              </div>
            )}

            <div className="flex justify-end gap-4 pt-4">
              <button type="button" onClick={onClose} className="btn-secondary">
                Cancel
              </button>
              <button
                type="submit"
                disabled={createMutation.isPending}
                className="btn-primary"
              >
                {createMutation.isPending ? 'Creating...' : 'Create Question'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
