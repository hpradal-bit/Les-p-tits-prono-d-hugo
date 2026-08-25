"use client";

import { useState, useEffect } from "react";
import { Card } from "@/components/ui";
import { getKind } from "@/lib/bonus/registry";
import {
  isAnswerable,
  answersArePublic,
  type BonusQuestionView,
} from "@/lib/bonus/types";
import { AnswerForm } from "./answer-form";

interface Props {
  view: BonusQuestionView;
  namesById: Map<string, string>;
}

function DeadlineCountdown({ closesAt }: { closesAt: string }) {
  const [remaining, setRemaining] = useState("");

  useEffect(() => {
    function tick() {
      const diff = new Date(closesAt).getTime() - Date.now();
      if (diff <= 0) {
        setRemaining("Termine");
        return;
      }
      const d = Math.floor(diff / 86_400_000);
      const h = Math.floor((diff % 86_400_000) / 3_600_000);
      const m = Math.floor((diff % 3_600_000) / 60_000);
      if (d > 0) setRemaining(`${d}j ${h}h`);
      else if (h > 0) setRemaining(`${h}h ${m}min`);
      else setRemaining(`${m}min`);
    }
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, [closesAt]);

  return (
    <span className="rounded-full bg-clay-soft px-2.5 py-0.5 text-[11px] font-semibold text-clay">
      {remaining}
    </span>
  );
}

const OUTCOME_STYLE = {
  correct: "text-winner",
  partial: "text-clay",
  wrong: "text-wrong",
};

export function QuestionCard({ view, namesById }: Props) {
  const { question, myAnswer, answers, scores, result } = view;
  const kd = getKind(question.kind);
  const canAnswer = isAnswerable(question);
  const showAnswers = answersArePublic(question);

  return (
    <Card className="overflow-hidden">
      <div className="border-b border-line px-4 py-3">
        <p className="text-[16px] font-bold text-ink">{question.prompt}</p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          {kd && (
            <p className="text-[12px] text-ink-faint">
              {kd.describeScoring(question.scoring, question.config)}
            </p>
          )}
          {canAnswer && question.closesAt && (
            <DeadlineCountdown closesAt={question.closesAt} />
          )}
        </div>
      </div>

      <div className="px-4 py-3">
        {canAnswer ? (
          <AnswerForm question={question} existingAnswer={myAnswer} />
        ) : myAnswer && !showAnswers ? (
          <p className="text-[14px] text-ink-muted">
            Ta réponse : <strong>{kd?.formatAnswer(myAnswer.answer, question.config) ?? "—"}</strong>
          </p>
        ) : null}

        {showAnswers && kd && (
          <div className="mt-3 flex flex-col gap-1">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
              Réponses
            </p>
            {answers.map((a) => {
              const name = namesById.get(a.userId) ?? "?";
              const score = scores.find((s) => s.userId === a.userId);
              return (
                <div key={a.userId} className="flex items-center justify-between py-1">
                  <span className="text-[14px] text-ink">
                    {name} — {kd.formatAnswer(a.answer, question.config)}
                  </span>
                  {score && (
                    <span className={`text-[13px] font-bold ${OUTCOME_STYLE[score.breakdown.outcome] ?? ""}`}>
                      {score.points > 0 ? `+${score.points}` : score.points}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {result && kd && (
          <div className="mt-3 rounded-lg bg-perfect-soft px-3 py-2">
            <p className="text-[13px] font-semibold text-perfect">
              Bonne réponse : {kd.formatCorrect(result.correctAnswer, question.config)}
            </p>
          </div>
        )}
      </div>
    </Card>
  );
}
