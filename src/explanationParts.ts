/**
 * Many bank explanations embed distractor notes in one string, e.g.
 * "Why B: … A only … C is … D is …"
 * Prefer explicit optionExplanations when the API provides them.
 */

const OPTION_START =
  /(?:^Why\s+([A-D])\s*:\s*)|(?:(?:^|[.!?•]\s+|;\s+|\n\s*)(?:Option\s+)?([A-D])(?=\s*[:.]|\s+(?:only|is|may|means|forces|requires|penalises|penalizes|adds|meets|with|still|alone|would|can|does|fixes|treats|works|requests|keeps|applies|relies|leaves|causes|measures|flags|over-engineers|can't|cannot|doesn't|don't|won't|isn't|aren't|not\b)))|(?:\s([A-D])(?=\s+(?:only|is|may|means|meets|works|treats|requires|penalises|penalizes|adds|forces|still|alone|would|can|does|fixes|measures|flags|can't|cannot|doesn't|don't|won't|isn't|aren't|not\b)))/gi;

export function extractOptionNotes(
  explanation: string,
  optionExplanations?: Record<string, string> | null,
): Record<string, string> {
  const notes: Record<string, string> = {};

  if (optionExplanations) {
    for (const [letter, text] of Object.entries(optionExplanations)) {
      const key = letter.toUpperCase();
      if (text?.trim() && /^[A-D]$/.test(key)) {
        notes[key] = text.trim();
      }
    }
  }

  if (!explanation?.trim()) return notes;

  const starts: { letter: string; index: number }[] = [];
  let match: RegExpExecArray | null;
  const re = new RegExp(OPTION_START.source, OPTION_START.flags);
  while ((match = re.exec(explanation)) !== null) {
    const letter = (match[1] || match[2] || match[3] || '').toUpperCase();
    if (!/^[A-D]$/.test(letter)) continue;
    const last = starts[starts.length - 1];
    if (last && last.letter === letter && match.index - last.index < 10) continue;
    starts.push({ letter, index: match.index });
  }

  for (let i = 0; i < starts.length; i++) {
    const cur = starts[i];
    const end = i + 1 < starts.length ? starts[i + 1].index : explanation.length;
    let chunk = explanation.slice(cur.index, end).trim().replace(/^[.!?•;]\s+/, '');
    if (!chunk) continue;
    if (!notes[cur.letter]) notes[cur.letter] = chunk;
  }

  return notes;
}

/** Strip bank prefixes like "Why C:" / "Option B" / leading letter so body reads naturally. */
export function cleanExplanationBody(letter: string, raw: string): string {
  let body = raw.trim().replace(/^[.!?•;:\s]+/, '');
  if (!body) return '';

  body = body.replace(/^(Correct|Incorrect)\.\s*/i, '');
  body = body.replace(new RegExp(`^Why\\s+${letter}\\s*:\\s*`, 'i'), '');
  body = body.replace(new RegExp(`^Option\\s+${letter}\\s*[:.]?\\s*`, 'i'), '');

  const letterLead = new RegExp(`^${letter}\\s+`, 'i');
  if (letterLead.test(body)) {
    body = body.replace(letterLead, '').trim();
    if (
      /^(only|is|may|means|meets|works|treats|requires|penalises|penalizes|adds|forces|still|alone|would|can|does|fixes|measures|flags|can't|cannot|doesn't|don't|won't|isn't|aren't|not)\b/i.test(
        body,
      )
    ) {
      body = `This ${body.charAt(0).toLowerCase()}${body.slice(1)}`;
    }
  }

  body = body.replace(new RegExp(`^${letter}\\s*[:.]\\s*`, 'i'), '');
  body = body.replace(/\s+/g, ' ').trim();

  if (!body) return '';
  return body.charAt(0).toUpperCase() + body.slice(1);
}

function firstSentences(text: string, max = 2): string {
  const parts = text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length === 0) return text.trim();
  return parts.slice(0, max).join(' ');
}

/** Last-resort unique note when bank has no distractor text for this letter. */
function buildIncorrectFallback(
  letter: string,
  optionText: string | undefined,
  correctLetter: string,
  correctBody: string,
): string {
  const correctHint = firstSentences(correctBody, 1);
  const optionHint = optionText?.trim()
    ? optionText.trim().length > 100
      ? `${optionText.trim().slice(0, 97)}…`
      : optionText.trim()
    : null;

  if (optionHint) {
    return `Option ${letter} (“${optionHint}”) does not address the root cause the scenario requires. The better approach is ${correctLetter}: ${correctHint}`;
  }
  return `Option ${letter} does not address the root cause the scenario requires. The better approach is ${correctLetter}: ${correctHint}`;
}

export type OptionExplanationContent = {
  isCorrect: boolean;
  body: string;
};

export function buildOptionExplanation(args: {
  letter: string;
  correctAnswer: string;
  explanation: string;
  optionText?: string;
  selectedAnswer?: string | null;
  optionExplanations?: Record<string, string> | null;
  wrongAnswerExplanation?: string | null;
}): OptionExplanationContent {
  const letter = args.letter.toUpperCase();
  const correct = args.correctAnswer.toUpperCase();
  const isCorrect = letter === correct;
  const notes = extractOptionNotes(args.explanation, args.optionExplanations);
  const correctRaw = notes[correct] || args.explanation || '';
  const correctBody = cleanExplanationBody(correct, correctRaw);

  if (isCorrect) {
    return {
      isCorrect: true,
      body: correctBody || 'This is the correct answer for the scenario.',
    };
  }

  let raw =
    notes[letter] ||
    (args.selectedAnswer?.toUpperCase() === letter
      ? args.wrongAnswerExplanation?.trim() || ''
      : '') ||
    '';

  let body = raw ? cleanExplanationBody(letter, raw) : '';

  // Avoid lazy redirects like "see the correct option"
  if (!body || /see the correct option/i.test(body)) {
    body = buildIncorrectFallback(letter, args.optionText, correct, correctBody);
  }

  return { isCorrect: false, body };
}

export function getWrongAnswerExplanation(args: {
  explanation: string;
  correctAnswer: string;
  selectedAnswer?: string | null;
  optionExplanations?: Record<string, string> | null;
  wrongAnswerExplanation?: string | null;
  optionText?: string;
}): string | null {
  const selected = args.selectedAnswer?.trim().toUpperCase();
  const correct = args.correctAnswer.trim().toUpperCase();
  if (!selected || selected === correct) return null;

  const built = buildOptionExplanation({
    letter: selected,
    correctAnswer: correct,
    explanation: args.explanation,
    optionText: args.optionText,
    selectedAnswer: selected,
    optionExplanations: args.optionExplanations,
    wrongAnswerExplanation: args.wrongAnswerExplanation,
  });

  return built.body;
}
