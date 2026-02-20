import { createFileRoute, Link } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useAuthStore } from '@/stores/auth';
import { api } from '@/lib/api';

export const Route = createFileRoute('/teacher/questions')({
  component: QuestionsPage,
});

function QuestionsPage() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [successToast, setSuccessToast] = useState('');

  useEffect(() => {
    if (!successToast) {
      return;
    }

    const timer = window.setTimeout(() => {
      setSuccessToast('');
    }, 2500);

    return () => window.clearTimeout(timer);
  }, [successToast]);

  const { data: questions, isLoading } = useQuery({
    queryKey: ['questions'],
    queryFn: async () => {
      const res = await api.get('/questions');
      return res.data.data;
    },
    enabled: !!user && (user.role === 'teacher' || user.role === 'admin'),
  });

  const { data: topics } = useQuery({
    queryKey: ['topics'],
    queryFn: async () => {
      const res = await api.get('/topics');
      return res.data.data;
    },
    enabled: !!user && (user.role === 'teacher' || user.role === 'admin'),
  });

  const { data: levels } = useQuery({
    queryKey: ['levels'],
    queryFn: async () => {
      const res = await api.get('/levels');
      return res.data.data;
    },
    enabled: !!user && (user.role === 'teacher' || user.role === 'admin'),
  });

  const publishMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.post(`/questions/${id}/publish`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['questions'] });
    },
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
  if (!user || (user.role !== 'teacher' && user.role !== 'admin')) {
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
              {questions?.length ?? 0} questions
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
        ) : questions?.length === 0 ? (
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
            {questions?.map((question: any) => (
              <div key={question.id} className="card">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <h3 className="font-medium text-lg">{question.text}</h3>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      {question.answers.map((choice: any, i: number) => (
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
                      <span className={`px-2 py-0.5 rounded text-xs ${
                        question.status === 'published' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                      }`}>
                        {question.status}
                      </span>
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
                  <div className="ml-4 flex flex-col gap-2">
                    {question.status !== 'published' && (
                      <button
                        onClick={() => publishMutation.mutate(question.id)}
                        disabled={publishMutation.isPending}
                        className="text-emerald-600 hover:text-emerald-800 text-sm"
                      >
                        Publish
                      </button>
                    )}
                    <button
                      onClick={() => {
                        if (confirm('Delete this question?')) {
                          deleteMutation.mutate(question.id);
                        }
                      }}
                      className="text-red-600 hover:text-red-800 text-sm"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Create Modal */}
      {showCreateModal && (
        <CreateQuestionModal
          topics={topics ?? []}
          levels={levels ?? []}
          onClose={() => setShowCreateModal(false)}
          onCreated={() => {
            setShowCreateModal(false);
            setSuccessToast('Question created successfully!');
            queryClient.invalidateQueries({ queryKey: ['questions'] });
          }}
        />
      )}

      {successToast && (
        <div className="fixed right-4 top-4 z-[60]">
          <div className="rounded-xl border-2 border-green-200 bg-green-50 px-4 py-3 text-sm font-semibold text-green-700 shadow-lg">
            ✅ {successToast}
          </div>
        </div>
      )}
    </div>
  );
}

function CreateQuestionModal({
  topics,
  levels,
  onClose,
  onCreated,
}: {
  topics: any[];
  levels: any[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const queryClient = useQueryClient();
  const [text, setText] = useState('');
  const [type, setType] = useState<'multiple_choice' | 'true_false'>('multiple_choice');
  const [choices, setChoices] = useState([
    { text: '', isCorrect: true },
    { text: '', isCorrect: false },
    { text: '', isCorrect: false },
    { text: '', isCorrect: false },
  ]);
  const [explanation, setExplanation] = useState('');
  const [timeLimitSeconds, setTimeLimitSeconds] = useState(30);
  const [points, setPoints] = useState(10);
  const [topicId, setTopicId] = useState('');
  const [newTopicName, setNewTopicName] = useState('');
  const [selectedLevelId, setSelectedLevelId] = useState('');
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium');
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const createTopicMutation = useMutation({
    mutationFn: async (name: string) => {
      const colorPool = ['#EF4444', '#3B82F6', '#22C55E', '#F59E0B', '#A855F7'];
      const randomColor = colorPool[Math.floor(Math.random() * colorPool.length)];
      const res = await api.post('/topics', {
        name,
        description: `${name} subject component`,
        color: randomColor,
      });
      return res.data.data;
    },
    onSuccess: (topic) => {
      setTopicId(topic.id);
      setNewTopicName('');
      queryClient.invalidateQueries({ queryKey: ['topics'] });
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const effectiveChoices =
        type === 'true_false'
          ? choices.slice(0, 2)
          : choices.filter((choice) => choice.text.trim());

      const payload = {
        topicId: topicId || undefined,
        type,
        difficulty,
        text: text.trim(),
        answers: effectiveChoices.map((choice, index) => ({
          id: String.fromCharCode(97 + index),
          text: choice.text.trim(),
          isCorrect: choice.isCorrect,
        })),
        explanation: explanation.trim() || undefined,
        timeLimitMs: timeLimitSeconds * 1000,
        points,
      };

      const res = await api.post('/questions', {
        ...payload,
      });
      return res.data;
    },
    onSuccess: () => {
      onCreated();
    },
    onError: (err: any) => {
      const apiError = err.response?.data?.error;
      const issues = apiError?.details?.issues as Array<{ path: string; message: string }> | undefined;

      if (issues && issues.length > 0) {
        const mapped = issues.reduce((acc, issue) => {
          acc[issue.path] = issue.message;
          return acc;
        }, {} as Record<string, string>);
        setFieldErrors(mapped);
        setError('Please fix the validation errors below.');
        return;
      }

      setError(apiError?.message || 'Failed to create question');
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
    setError('');
    setFieldErrors({});

    const localErrors: Record<string, string> = {};
    const effectiveChoices = type === 'true_false' ? choices.slice(0, 2) : choices.filter((c) => c.text.trim());

    if (text.trim().length < 10) {
      localErrors.text = 'Question text must be at least 10 characters.';
    }

    const choiceCount = effectiveChoices.filter((choice) => choice.text.trim()).length;
    if (choiceCount < 2) {
      localErrors.answers = 'At least 2 answer choices are required.';
    }

    if (type === 'true_false' && choiceCount !== 2) {
      localErrors.answers = 'True/False questions must have exactly 2 answers.';
    }

    if (!effectiveChoices.some((c) => c.isCorrect)) {
      localErrors.answers = 'Mark at least one answer as correct.';
    }

    if (timeLimitSeconds < 5 || timeLimitSeconds > 120) {
      localErrors.timeLimitMs = 'Time limit must be between 5 and 120 seconds.';
    }

    if (points < 1 || points > 100) {
      localErrors.points = 'Points must be between 1 and 100.';
    }

    if (Object.keys(localErrors).length > 0) {
      setFieldErrors(localErrors);
      setError('Please fix the validation errors below.');
      return;
    }

    createMutation.mutate();
  };

  const handleTypeChange = (nextType: 'multiple_choice' | 'true_false') => {
    setType(nextType);
    if (nextType === 'true_false') {
      setChoices([
        { text: 'True', isCorrect: true },
        { text: 'False', isCorrect: false },
      ]);
    } else if (choices.length < 4) {
      setChoices([
        ...choices,
        { text: '', isCorrect: false },
        { text: '', isCorrect: false },
      ].slice(0, 4));
    }
  };

  const handleApplyLevel = (levelId: string) => {
    setSelectedLevelId(levelId);
    const level = levels.find((item: any) => item.id === levelId);
    if (!level) {
      return;
    }

    setTimeLimitSeconds(Math.round((level.timeLimitMsPerQuestion ?? 30000) / 1000));
    setPoints(level.pointsPerCorrect ?? 10);

    const suggestedDifficulty: 'easy' | 'medium' | 'hard' =
      (level.pointsPerCorrect ?? 10) >= 18
        ? 'hard'
        : (level.pointsPerCorrect ?? 10) >= 13
          ? 'medium'
          : 'easy';
    setDifficulty(suggestedDifficulty);
  };

  const subjectSuggestions = ['Science', 'Home Science', 'Mathematics', 'History', 'Geography', 'English'];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <h2 className="text-xl font-bold mb-4">Create Question</h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Question</label>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                className="input min-h-[80px]"
                placeholder="Enter your question..."
                required
              />
              {fieldErrors.text && <p className="mt-1 text-xs text-red-600">{fieldErrors.text}</p>}
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div>
                <label className="block text-sm font-medium mb-1">Type</label>
                <select value={type} onChange={(e) => handleTypeChange(e.target.value as 'multiple_choice' | 'true_false')} className="input">
                  <option value="multiple_choice">Multiple Choice</option>
                  <option value="true_false">True / False</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Level Preset</label>
                <select
                  value={selectedLevelId}
                  onChange={(e) => handleApplyLevel(e.target.value)}
                  className="input"
                >
                  <option value="">No preset</option>
                  {levels.map((level: any) => (
                    <option key={level.id} value={level.id}>
                      {level.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Difficulty</label>
                <select
                  value={difficulty}
                  onChange={(e) => setDifficulty(e.target.value as 'easy' | 'medium' | 'hard')}
                  className="input"
                >
                  <option value="easy">Easy</option>
                  <option value="medium">Medium</option>
                  <option value="hard">Hard</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                Choices (click to mark correct)
              </label>
              <div className="space-y-2">
                {(type === 'true_false' ? choices.slice(0, 2) : choices).map((choice, i) => (
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
                      disabled={type === 'true_false'}
                    />
                  </div>
                ))}
              </div>
              {fieldErrors.answers && <p className="mt-1 text-xs text-red-600">{fieldErrors.answers}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Explanation (optional)</label>
              <textarea
                value={explanation}
                onChange={(e) => setExplanation(e.target.value)}
                className="input min-h-[72px]"
                placeholder="Explain why the correct answer is right..."
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Subject / Component</label>
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
                <div className="mt-2 flex flex-wrap gap-1">
                  {subjectSuggestions.map((subject) => (
                    <button
                      key={subject}
                      type="button"
                      onClick={() => setNewTopicName(subject)}
                      className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-slate-600"
                    >
                      {subject}
                    </button>
                  ))}
                </div>
                <div className="mt-2 flex gap-2">
                  <input
                    type="text"
                    value={newTopicName}
                    onChange={(e) => setNewTopicName(e.target.value)}
                    placeholder="Add new subject"
                    className="input h-10"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const name = newTopicName.trim();
                      if (name.length > 0) {
                        createTopicMutation.mutate(name);
                      }
                    }}
                    disabled={createTopicMutation.isPending || newTopicName.trim().length === 0}
                    className="btn-secondary h-10 px-3 py-2 text-xs"
                  >
                    {createTopicMutation.isPending ? 'Adding...' : 'Add'}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Time (seconds)</label>
                <input
                  type="number"
                  min={5}
                  max={120}
                  value={timeLimitSeconds}
                  onChange={(e) => setTimeLimitSeconds(Number(e.target.value))}
                  className="input"
                />
                {fieldErrors.timeLimitMs && <p className="mt-1 text-xs text-red-600">{fieldErrors.timeLimitMs}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Points</label>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={points}
                  onChange={(e) => setPoints(Number(e.target.value))}
                  className="input"
                />
                {fieldErrors.points && <p className="mt-1 text-xs text-red-600">{fieldErrors.points}</p>}
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
