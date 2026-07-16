import type { QuestionReviewItem } from './api';
import {
  AnswerComparison,
  OptionExplanation,
  getExplanationForOption,
} from './AnswerExplanations';
import { FormatText } from './formatText';
import './ResultDetailView.css';

type ResultDetailViewProps = {
  dateLabel: string;
  sourceLabel: string;
  scoreLabel: string;
  questions: QuestionReviewItem[];
  onClose: () => void;
};

export default function ResultDetailView({
  dateLabel,
  sourceLabel,
  scoreLabel,
  questions,
  onClose,
}: ResultDetailViewProps) {
  return (
    <section className="result-detail-panel card">
      <div className="result-detail-header">
        <div>
          <h3>Question-by-question review</h3>
          <p className="hint">
            {dateLabel} · {sourceLabel} · Score {scoreLabel}
          </p>
        </div>
        <button type="button" className="btn secondary result-detail-close" onClick={onClose}>
          Close
        </button>
      </div>

      {questions.length === 0 ? (
        <p className="muted result-detail-empty">
          Detailed review is not available for this session. Complete a new exam to save
          question-level history.
        </p>
      ) : (
        <div className="result-detail-list">
          {questions.map((item) => {
            const statusClass = !item.answered
              ? 'unanswered'
              : item.isCorrect
                ? 'ok'
                : 'bad';
            const statusLabel = !item.answered
              ? 'Unanswered'
              : item.isCorrect
                ? 'Correct'
                : 'Incorrect';
            const itemClass = !item.answered
              ? 'review-unanswered'
              : item.isCorrect
                ? 'review-ok'
                : 'review-bad';

            return (
              <details key={item.index} className={`review-item result-detail-item ${itemClass}`} open>
                <summary>
                  <span className="review-qnum">Q{item.index + 1}</span>
                  <span className="review-title">{item.title}</span>
                  <span className={`review-badge ${statusClass}`}>{statusLabel}</span>
                </summary>
                <div className="review-body">
                  <p className="pill">{item.sectionName}</p>
                  <p className="question-text">
                    <span className="question-number" aria-hidden="true">
                      {item.index + 1}.
                    </span>
                    <span className="question-text-body">
                      <FormatText text={item.text} />
                    </span>
                  </p>

                  <ul className="review-options">
                    {(['A', 'B', 'C', 'D'] as const).map((letter) => {
                      const optText = item.options[letter];
                      if (!optText) return null;
                      const isSelected = item.selectedAnswer === letter;
                      const isCorrect = item.correctAnswer === letter;
                      const state = isCorrect
                        ? 'correct'
                        : isSelected && !item.isCorrect
                          ? 'wrong'
                          : isSelected
                            ? 'selected'
                            : '';
                      const explText = getExplanationForOption({
                        letter,
                        correctAnswer: item.correctAnswer,
                        explanation: item.explanation,
                        optionText: optText,
                        selectedAnswer: item.selectedAnswer,
                        optionExplanations: item.optionExplanations,
                        wrongAnswerExplanation: item.wrongAnswerExplanation,
                      });
                      return (
                        <li key={letter} className="review-option-block">
                          <div className={`review-option ${state}`}>
                            <span className="option-radio" aria-hidden="true" />
                            <span className="option-letter" aria-hidden="true">
                              {letter}
                            </span>
                            <span className="option-text">
                              <FormatText text={optText} />
                            </span>
                            {isSelected && (
                              <span className="option-you-picked" aria-label="Your selection">
                                You
                              </span>
                            )}
                          </div>
                          <OptionExplanation
                            isCorrectOption={isCorrect}
                            explanationText={explText}
                          />
                        </li>
                      );
                    })}
                  </ul>

                  <div className="result-detail-answers">
                    <AnswerComparison
                      selectedAnswer={item.selectedAnswer}
                      correctAnswer={item.correctAnswer}
                      isCorrect={item.isCorrect}
                      answered={item.answered}
                      selectedOptionText={
                        item.selectedAnswer
                          ? item.options[item.selectedAnswer] ?? null
                          : null
                      }
                      correctOptionText={item.options[item.correctAnswer] ?? null}
                    />
                  </div>
                </div>
              </details>
            );
          })}
        </div>
      )}
    </section>
  );
}
