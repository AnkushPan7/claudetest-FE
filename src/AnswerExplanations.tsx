import { FormatText } from './formatText';
import {
  buildOptionExplanation,
  type OptionExplanationContent,
} from './explanationParts';

export function getExplanationForOption(args: {
  letter: string;
  correctAnswer: string;
  explanation: string;
  optionText?: string;
  selectedAnswer?: string | null;
  optionExplanations?: Record<string, string> | null;
  wrongAnswerExplanation?: string | null;
}): OptionExplanationContent {
  return buildOptionExplanation(args);
}

type OptionExplanationProps = {
  isCorrectOption: boolean;
  explanationText: string | OptionExplanationContent;
};

export function OptionExplanation({
  isCorrectOption,
  explanationText,
}: OptionExplanationProps) {
  const content: OptionExplanationContent =
    typeof explanationText === 'string'
      ? {
          isCorrect: isCorrectOption,
          body: explanationText.replace(/^(Correct|Incorrect)\.\s*/i, ''),
        }
      : explanationText;

  const verdict = content.isCorrect ? 'Correct.' : 'Incorrect.';

  return (
    <details
      className={`option-explanation ${content.isCorrect ? 'option-explanation-ok' : 'option-explanation-bad'}`}
      onClick={(e) => e.stopPropagation()}
    >
      <summary
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        <span className="option-explanation-icon" aria-hidden="true">
          {content.isCorrect ? '✓' : '✗'}
        </span>
        <span className="option-explanation-label">Explanation</span>
        <span className="option-explanation-chevron" aria-hidden="true" />
      </summary>
      <div className="option-explanation-body">
        <p className="option-explanation-text">
          <strong className={content.isCorrect ? 'verdict-ok' : 'verdict-bad'}>
            {verdict}
          </strong>{' '}
          <FormatText text={content.body} />
        </p>
      </div>
    </details>
  );
}

type AnswerComparisonProps = {
  selectedAnswer?: string | null;
  correctAnswer: string;
  isCorrect: boolean;
  answered?: boolean;
  selectedOptionText?: string | null;
  correctOptionText?: string | null;
};

export function AnswerComparison({
  selectedAnswer,
  correctAnswer,
  isCorrect,
  answered = true,
  selectedOptionText,
  correctOptionText,
}: AnswerComparisonProps) {
  if (!answered) {
    return (
      <div className="answer-comparison">
        <p className="answer-comparison-title">Your answer vs Correct answer</p>
        <div className="answer-comparison-grid">
          <div className="answer-comparison-side">
            <span className="answer-comparison-label">Your answer</span>
            <p className="answer-comparison-value muted">Not answered</p>
          </div>
          <div className="answer-comparison-side answer-comparison-correct-side">
            <span className="answer-comparison-label">Correct answer</span>
            <p className="answer-comparison-value">
              <strong className="answer-ok">{correctAnswer}</strong>
              {correctOptionText ? (
                <>
                  {' '}
                  — <FormatText text={correctOptionText} />
                </>
              ) : null}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="answer-comparison">
      <p className="answer-comparison-title">Your answer vs Correct answer</p>
      <div className="answer-comparison-grid">
        <div
          className={`answer-comparison-side ${isCorrect ? 'answer-comparison-correct-side' : 'answer-comparison-wrong-side'}`}
        >
          <span className="answer-comparison-label">Your answer</span>
          <p className="answer-comparison-value">
            <strong className={isCorrect ? 'answer-ok' : 'answer-bad'}>
              {selectedAnswer ?? '—'}
            </strong>
            {selectedOptionText ? (
              <>
                {' '}
                — <FormatText text={selectedOptionText} />
              </>
            ) : null}
          </p>
        </div>
        <div className="answer-comparison-side answer-comparison-correct-side">
          <span className="answer-comparison-label">Correct answer</span>
          <p className="answer-comparison-value">
            <strong className="answer-ok">{correctAnswer}</strong>
            {correctOptionText ? (
              <>
                {' '}
                — <FormatText text={correctOptionText} />
              </>
            ) : null}
          </p>
        </div>
      </div>
    </div>
  );
}
