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
  /** Why the selected answer is right or wrong — not the option wording. */
  selectedExplanation?: string | null;
  /** Why the correct answer is correct — not the option wording. */
  correctExplanation?: string | null;
};

function ComparisonBody({
  letter,
  explanation,
  letterClass,
}: {
  letter?: string | null;
  explanation?: string | null;
  letterClass: string;
}) {
  if (!explanation?.trim() && !letter) {
    return <p className="answer-comparison-value muted">—</p>;
  }

  return (
    <p className="answer-comparison-value">
      {letter ? <strong className={letterClass}>{letter}</strong> : null}
      {letter && explanation?.trim() ? ' — ' : null}
      {explanation?.trim() ? <FormatText text={explanation.trim()} /> : null}
    </p>
  );
}

export function AnswerComparison({
  selectedAnswer,
  correctAnswer,
  isCorrect,
  answered = true,
  selectedExplanation,
  correctExplanation,
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
            <ComparisonBody
              letter={correctAnswer}
              explanation={correctExplanation}
              letterClass="answer-ok"
            />
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
          <ComparisonBody
            letter={selectedAnswer}
            explanation={selectedExplanation}
            letterClass={isCorrect ? 'answer-ok' : 'answer-bad'}
          />
        </div>
        <div className="answer-comparison-side answer-comparison-correct-side">
          <span className="answer-comparison-label">Correct answer</span>
          <ComparisonBody
            letter={correctAnswer}
            explanation={correctExplanation}
            letterClass="answer-ok"
          />
        </div>
      </div>
    </div>
  );
}
