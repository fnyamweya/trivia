import { useState, useEffect } from 'react';
import { useGameStore } from '@/stores/game';

export function QuestionCard() {
  const { currentQuestion, myAnswer, submitAnswer, questionNumber, totalQuestions, myTeamId, soloMode } = useGameStore();
  const [timeLeft, setTimeLeft] = useState(0);

  // Timer countdown
  useEffect(() => {
    if (!currentQuestion) return;

    const endTime = currentQuestion.startedAt + currentQuestion.timeLimit * 1000;

    const updateTimer = () => {
      const remaining = Math.max(0, Math.ceil((endTime - Date.now()) / 1000));
      setTimeLeft(remaining);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 100);

    return () => clearInterval(interval);
  }, [currentQuestion]);

  if (!currentQuestion) {
    return (
      <div className="text-center py-16">
        <p className="text-gray-400">Waiting for question...</p>
      </div>
    );
  }

  const hasAnswered = !!myAnswer;
  const isRevealed = myAnswer?.correct !== undefined;
  const timerCritical = timeLeft <= 5;
  const canAnswer = soloMode || !!myTeamId;

  return (
    <div className="max-w-2xl mx-auto">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <span className="text-xs font-black uppercase tracking-wider text-white/80">
          Question {questionNumber} of {totalQuestions}
        </span>
        <span
          className={`rounded-full px-3 py-1 text-lg font-black ${
            timerCritical ? 'animate-pulse bg-red-500 text-white' : 'bg-white/20 text-white'
          }`}
        >
          {timeLeft}s
        </span>
      </div>

      {/* Question */}
      <div className="card border-white/70 bg-white text-slate-800">
        <h2 className="mb-6 text-xl font-black leading-snug text-slate-800">{currentQuestion.stem}</h2>

        {!canAnswer && (
          <div className="mb-4 rounded-xl border-2 border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-700">
            Pick a team or switch to Solo Mode in the lobby before submitting answers.
          </div>
        )}

        {/* Choices */}
        <div className="grid gap-3">
          {currentQuestion.choices.map((choice, index) => {
            const isSelected = myAnswer?.choiceId === choice.id;
            const isCorrect = isRevealed && isSelected && myAnswer?.correct;
            const isIncorrect = isRevealed && isSelected && !myAnswer?.correct;

            return (
              <button
                key={choice.id}
                onClick={() => !hasAnswered && canAnswer && submitAnswer(choice.id)}
                disabled={hasAnswered || !canAnswer}
                className={`
                  rounded-2xl border-b-[6px] p-4 text-left font-semibold transition-all
                  ${
                    isCorrect
                      ? 'border-green-700 bg-green-500 text-white'
                      : isIncorrect
                        ? 'border-red-700 bg-red-500 text-white'
                        : isSelected
                          ? 'border-primary-700 bg-primary-500 text-white'
                          : 'border-slate-300 bg-white hover:-translate-y-0.5 hover:bg-slate-50'
                  }
                  ${hasAnswered && !isSelected ? 'opacity-60' : ''}
                `}
              >
                <span className="mr-3 inline-block h-8 w-8 rounded-full bg-slate-700 text-center leading-8 text-white">
                  {String.fromCharCode(65 + index)}
                </span>
                {choice.text}
              </button>
            );
          })}
        </div>

        {/* Feedback */}
        {hasAnswered && !isRevealed && (
          <div className="mt-6 text-center">
            <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
            <p className="mt-2 text-sm font-semibold text-slate-500">Answer submitted! Waiting for results...</p>
          </div>
        )}

        {isRevealed && (
          <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4">
            {myAnswer?.correct ? (
              <div className="text-green-600">
                <p className="text-lg font-black uppercase">✓ Correct!</p>
                <p className="text-sm font-semibold">
                  +{myAnswer.points} points
                  {(myAnswer.streakBonus ?? 0) > 0 && ` (+${myAnswer.streakBonus} streak bonus!)`}
                </p>
              </div>
            ) : (
              <div className="text-red-600">
                <p className="text-lg font-black uppercase">✗ Incorrect</p>
                <p className="text-sm font-semibold">Better luck on the next one!</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
