import { useState, useEffect } from 'react';
import { useGameStore } from '@/stores/game';

export function QuestionCard() {
  const { currentQuestion, myAnswer, submitAnswer, questionNumber, totalQuestions } = useGameStore();
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

  return (
    <div className="max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex justify-between items-center mb-4">
        <span className="text-sm text-gray-400">
          Question {questionNumber} of {totalQuestions}
        </span>
        <span
          className={`text-lg font-mono font-bold ${
            timerCritical ? 'text-red-500 animate-pulse' : 'text-white'
          }`}
        >
          {timeLeft}s
        </span>
      </div>

      {/* Question */}
      <div className="card bg-gray-800 text-white">
        <h2 className="text-xl font-semibold mb-6">{currentQuestion.stem}</h2>

        {/* Choices */}
        <div className="grid gap-3">
          {currentQuestion.choices.map((choice, index) => {
            const isSelected = myAnswer?.choiceId === choice.id;
            const isCorrect = isRevealed && isSelected && myAnswer?.correct;
            const isIncorrect = isRevealed && isSelected && !myAnswer?.correct;

            return (
              <button
                key={choice.id}
                onClick={() => !hasAnswered && submitAnswer(choice.id)}
                disabled={hasAnswered}
                className={`
                  p-4 rounded-lg text-left transition-all
                  ${
                    isCorrect
                      ? 'bg-green-600 border-2 border-green-400'
                      : isIncorrect
                        ? 'bg-red-600 border-2 border-red-400'
                        : isSelected
                          ? 'bg-primary-600 border-2 border-primary-400'
                          : 'bg-gray-700 hover:bg-gray-600 border-2 border-transparent'
                  }
                  ${hasAnswered && !isSelected ? 'opacity-50' : ''}
                `}
              >
                <span className="inline-block w-8 h-8 rounded-full bg-gray-600 text-center leading-8 mr-3">
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
            <div className="inline-block animate-spin rounded-full h-6 w-6 border-2 border-white border-t-transparent" />
            <p className="mt-2 text-gray-400">Answer submitted! Waiting for results...</p>
          </div>
        )}

        {isRevealed && (
          <div className="mt-6 p-4 rounded-lg bg-gray-700">
            {myAnswer?.correct ? (
              <div className="text-green-400">
                <p className="text-lg font-bold">✓ Correct!</p>
                <p className="text-sm">
                  +{myAnswer.points} points
                  {(myAnswer.streakBonus ?? 0) > 0 && ` (+${myAnswer.streakBonus} streak bonus!)`}
                </p>
              </div>
            ) : (
              <div className="text-red-400">
                <p className="text-lg font-bold">✗ Incorrect</p>
                <p className="text-sm">Better luck on the next one!</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
