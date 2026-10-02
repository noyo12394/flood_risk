import { useState } from "react";
import { SCENARIOS } from "./game/data";
import { formatUSD } from "./game/model";
import { parseResult, resultStore, type TeamResult } from "./game/results";
import { StormSelector, type StormId } from "./StormSelector";
export function TeamComparison({
  stormId,
  session,
  onClose,
}: {
  stormId: StormId;
  session: string;
  onClose: () => void;
}) {
  const [storm, setStorm] = useState(stormId);
  const [code, setCode] = useState(session);
  const [records, setRecords] = useState<TeamResult[]>(() =>
    resultStore.read(),
  );
  const [raw, setRaw] = useState("");
  const [message, setMessage] = useState("");
  const runs = records
    .filter((r) => r.stormId === storm && r.session === code.trim())
    .sort((a, b) => b.score - a.score);
  const bestScore = Math.max(0, ...runs.map((r) => r.score));
  const bestLoss = Math.max(0, ...runs.map((r) => r.lossAvoided));
  function importRun() {
    try {
      const r = parseResult(raw);
      const persisted = resultStore.save(r);
      setRecords(resultStore.read());
      setStorm(r.stormId);
      setCode(r.session);
      setRaw("");
      setMessage(
        persisted
          ? `Imported ${r.team}'s result.`
          : "Imported for this page; browser storage is unavailable.",
      );
    } catch (e) {
      setMessage((e as Error).message);
    }
  }
  return (
    <div className="modal-back">
      <section
        className="modal comparison-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Team comparison"
      >
        <button className="x" onClick={onClose} aria-label="Close comparison">
          ✕
        </button>
        <p className="eyebrow">CLASS REFLECTION</p>
        <h2>Compare the same flood</h2>
        <StormSelector value={storm} onChange={setStorm} />
        <label className="field-label">
          Class / session code
          <input
            value={code}
            maxLength={40}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Optional"
          />
        </label>
        <p>
          Results stay in this browser. Import other teams’ results to compare
          together.
        </p>
        {runs.length > 0 ? (
          <>
            <p>
              <b>Highest score:</b>{" "}
              {runs
                .filter((r) => r.score === bestScore)
                .map((r) => r.team)
                .join(", ")}{" "}
              · {bestScore}/100
              <br />
              <b>Most loss avoided:</b>{" "}
              {runs
                .filter((r) => r.lossAvoided === bestLoss)
                .map((r) => r.team)
                .join(", ")}{" "}
              · {formatUSD(bestLoss)}
            </p>
            <div className="team-columns">
              {runs.map((r) => (
                <article className="team-result" key={r.id}>
                  <h3>{r.team}</h3>
                  <p>
                    {SCENARIOS.find((s) => s.id === r.stormId)?.label} ·{" "}
                    {r.score}/100
                  </p>
                  <dl>
                    <dt>Loss avoided</dt>
                    <dd>{formatUSD(r.lossAvoided)}</dd>
                    <dt>People protected*</dt>
                    <dd>{r.peopleProtected.toLocaleString()}</dd>
                    <dt>Budget spent</dt>
                    <dd>{formatUSD(r.budgetSpent)}</dd>
                  </dl>
                  <ol>
                    {r.decisions.map((d, i) => (
                      <li key={i}>
                        <b>{d.label}</b>
                        <span>
                          Day {d.day.toFixed(1)} · {formatUSD(d.cost)}
                        </span>
                        <small>{d.note}</small>
                      </li>
                    ))}
                  </ol>
                </article>
              ))}
            </div>
          </>
        ) : (
          <p>No completed runs for this storm and session yet.</p>
        )}
        <div className="reflection-task">
          <h3>Discuss together</h3>
          <p>
            Who scored most? Who avoided the most loss? Which specific decisions
            and timing helped? Where did a team trade people protection against
            damage or budget?
          </p>
          <p>
            *People protected includes occupants and service impacts in this
            teaching model; it is not a count of unique people.
          </p>
        </div>
        <label className="field-label">
          Import result
          <textarea
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            placeholder="Paste a team’s copied result JSON"
          />
        </label>
        <button className="enter" disabled={!raw.trim()} onClick={importRun}>
          Import result
        </button>
        <p role="status">{message}</p>
      </section>
    </div>
  );
}
