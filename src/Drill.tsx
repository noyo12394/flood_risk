import { useEffect, useMemo, useRef, useState } from "react";
import { StormSelector, type StormId } from "./StormSelector";
import { DrillTutorial, tutorialSeen } from "./DrillTutorial";
import { TeamComparison } from "./TeamComparison";
import { resultStore, type TeamResult } from "./game/results";
import { Scene } from "./three/Scene";
import { SCENARIOS, type FloodScenario } from "./game/data";
import { EMPTY_MITIGATIONS, formatUSD } from "./game/model";
import {
  DECISIONS,
  DRILL_DAYS,
  DRILL_DURATION,
  EMERGENCY_BUDGET,
  FYRE_VERSION,
  decisionCost,
  emptyEffects,
  evaluate,
  riverElevAt,
  scoreDrill,
  type DecisionOption,
  type DrillEffects,
  type DrillSnapshot,
  type Scorecard,
} from "./game/drill";
import { DAMAGE_COLORS } from "./three/Building";

type Phase = "prep" | "live" | "debrief";
type Resolution = { note: string };
type ActionStatus = "working" | "complete" | "after-event";

interface ActionRecord {
  id: string;
  label: string;
  chosenDay: number;
  cost: number;
  durationDays: number;
  completesDay: number;
  status: ActionStatus;
  note: string;
}

interface PendingOperation {
  id: string;
  decisionId: string;
  completesAt: number;
  option: DecisionOption;
}

export function Drill({
  onExit,
  onReference,
}: {
  onExit: () => void;
  onReference: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("prep");
  const [scenarioId, setScenarioId] = useState<StormId | "">("");
  const scenarioRef = useRef<FloodScenario>(
    SCENARIOS.find((item) => item.id === "major")!,
  );
  const scenario =
    SCENARIOS.find((item) => item.id === scenarioId) ?? SCENARIOS[2];
  const [team, setTeam] = useState("");
  const [session, setSession] = useState("");
  const [showTutorial, setShowTutorial] = useState(() => !tutorialSeen());
  const [showComparison, setShowComparison] = useState(false);
  const [savedResult, setSavedResult] = useState<TeamResult | null>(null);
  const [storageMessage, setStorageMessage] = useState("");
  const [copyText, setCopyText] = useState("");
  const runIdRef = useRef("");

  const effectsRef = useRef<DrillEffects>(emptyEffects());
  const maxWaterRef = useRef(-3);
  const snapshotRef = useRef<DrillSnapshot | null>(null);
  const clockRef = useRef(0);
  const resolvedRef = useRef<Record<string, Resolution>>({});
  const pausedDecisionRef = useRef<string | null>(null);
  const pendingRef = useRef<PendingOperation[]>([]);

  const [clock, setClock] = useState(0);
  const [snapshot, setSnapshot] = useState<DrillSnapshot | null>(null);
  const [resolved, setResolved] = useState<Record<string, Resolution>>({});
  const [scorecard, setScorecard] = useState<Scorecard | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [spend, setSpend] = useState(0);
  const [pausedDecisionId, setPausedDecisionId] = useState<string | null>(null);
  const [actions, setActions] = useState<ActionRecord[]>([]);

  const t01 = Math.min(1, clock / DRILL_DURATION);
  const currentDecision =
    DECISIONS.find((decision) => decision.id === pausedDecisionId) ?? null;

  useEffect(() => {
    if (phase !== "live") return;
    let frame = 0;
    let last = performance.now();
    let accumulator = 0;

    const loop = (now: number) => {
      const deltaSeconds = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (pausedDecisionRef.current) accumulator = 0;
      else accumulator += deltaSeconds;
      // Fixed simulation steps give every team the same flood and completion timing.
      while (accumulator >= 0.02 && !pausedDecisionRef.current) {
        accumulator -= 0.02;
        const nextAt = DECISIONS.find((d) => !resolvedRef.current[d.id])?.at;
        clockRef.current = Math.min(
          DRILL_DURATION,
          clockRef.current + 0.02,
          nextAt === undefined ? DRILL_DURATION : nextAt * DRILL_DURATION,
        );

        const progress = clockRef.current / DRILL_DURATION;
        const activeScenario = scenarioRef.current;
        const river = riverElevAt(progress, activeScenario.peakElevation);

        const due = pendingRef.current.filter(
          (operation) => operation.completesAt <= progress,
        );
        if (due.length > 0) {
          const waterBeforeCompletion = evaluate(
            effectsRef.current,
            river,
            maxWaterRef.current,
          ).campusWater;
          const notes: Record<string, Resolution> = {};
          for (const operation of due) {
            const note = operation.option.apply(
              effectsRef.current,
              waterBeforeCompletion,
            );
            notes[operation.decisionId] = { note };
            setActions((previous) =>
              previous.map((action) =>
                action.id === operation.id
                  ? { ...action, status: "complete", note }
                  : action,
              ),
            );
          }
          pendingRef.current = pendingRef.current.filter(
            (operation) => operation.completesAt > progress,
          );
          resolvedRef.current = { ...resolvedRef.current, ...notes };
          setResolved({ ...resolvedRef.current });
        }

        const nextSnapshot = evaluate(
          effectsRef.current,
          river,
          maxWaterRef.current,
        );
        maxWaterRef.current = nextSnapshot.maxCampusWater;
        snapshotRef.current = nextSnapshot;
        setClock(clockRef.current);
        setSnapshot(nextSnapshot);

        if (!pausedDecisionRef.current) {
          const nextDecision = DECISIONS.find(
            (decision) =>
              progress >= decision.at && !resolvedRef.current[decision.id],
          );
          if (nextDecision) {
            pausedDecisionRef.current = nextDecision.id;
            setPausedDecisionId(nextDecision.id);
          }
        }

        if (progress >= 1) {
          finish(nextSnapshot);
          return;
        }
      }
      frame = requestAnimationFrame(loop);
    };

    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
    // The loop intentionally owns the mutable simulation state for one live run.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  function beginDrill(reuseScenario = false) {
    if (showTutorial || !team.trim() || (!reuseScenario && !scenarioId)) return;
    const pickedScenario = reuseScenario ? scenarioRef.current : scenario;
    runIdRef.current = crypto.randomUUID();
    setSavedResult(null);
    setCopyText("");
    scenarioRef.current = pickedScenario;
    setScenarioId(pickedScenario.id);
    effectsRef.current = emptyEffects();
    maxWaterRef.current = -3;
    snapshotRef.current = null;
    clockRef.current = 0;
    resolvedRef.current = {};
    pausedDecisionRef.current = null;
    pendingRef.current = [];
    setResolved({});
    setClock(0);
    setSpend(0);
    setSnapshot(null);
    setActions([]);
    setPausedDecisionId(null);
    setScorecard(null);
    setPhase("live");
  }

  function finish(finalSnapshot: DrillSnapshot) {
    setActions((previous) =>
      previous.map((action) =>
        action.status === "working"
          ? {
              ...action,
              status: "after-event",
              note: "This work will finish after the flood. It provided no protection during the drill.",
            }
          : action,
      ),
    );
    const baseline = evaluate(
      emptyEffects(),
      scenarioRef.current.peakElevation,
      scenarioRef.current.peakElevation,
    );
    setScorecard(
      scoreDrill(
        effectsRef.current,
        finalSnapshot,
        baseline,
        scenarioRef.current.id,
      ),
    );
    pausedDecisionRef.current = null;
    setPausedDecisionId(null);
    setPhase("debrief");
  }

  useEffect(() => {
    if (phase !== "debrief" || !scorecard) return;
    const result: TeamResult = {
      version: 1,
      id: runIdRef.current,
      team: team.trim(),
      session: session.trim(),
      stormId: scenarioRef.current.id,
      score: scorecard.score,
      lossAvoided: scorecard.lossAvoided,
      peopleProtected: scorecard.peopleSafe,
      budgetSpent: scorecard.totalSpend,
      decisions: actions.map((a) => ({
        label: a.label,
        cost: a.cost,
        day: a.chosenDay,
        note: a.note,
      })),
      createdAt: new Date().toISOString(),
    };
    const stored = resultStore.save(result);
    setSavedResult(result);
    setStorageMessage(
      stored
        ? "Result saved in this browser."
        : "Browser storage unavailable; copy this result before leaving.",
    );
  }, [phase, scorecard, actions, team, session]);

  async function copyResult() {
    if (!savedResult) return;
    const text = JSON.stringify(savedResult);
    setCopyText(text);
    try {
      await navigator.clipboard.writeText(text);
      setStorageMessage(
        "Result copied. Paste it into Import result on the instructor’s device.",
      );
    } catch {
      setStorageMessage("Select and copy the result text below.");
    }
  }

  function choose(decisionId: string, option: DecisionOption) {
    const progress = clockRef.current / DRILL_DURATION;
    const chosenDay = dayAt(progress);
    const cost = decisionCost(option, scenarioRef.current.id);
    if (effectsRef.current.spend + cost > EMERGENCY_BUDGET) return;
    effectsRef.current.spend += cost;
    const actionId = `${decisionId}-${option.id}`;
    const completesDay = chosenDay + option.durationDays;

    if (option.durationDays > 0) {
      const completesAt = progress + option.durationDays / DRILL_DAYS;
      pendingRef.current.push({
        id: actionId,
        decisionId,
        completesAt,
        option,
      });
      const note = option.futureOnly
        ? `${option.shortLabel} started. It needs ${option.durationDays} days, so it will not help this flood.`
        : `${option.shortLabel} started. Crews need ${formatDuration(option.durationDays)} to finish.`;
      resolvedRef.current = { ...resolvedRef.current, [decisionId]: { note } };
      setActions((previous) => [
        ...previous,
        {
          id: actionId,
          label: option.shortLabel,
          chosenDay,
          cost,
          durationDays: option.durationDays,
          completesDay,
          status: "working",
          note,
        },
      ]);
    } else {
      const water = snapshotRef.current?.campusWater ?? 0;
      const note = option.apply(effectsRef.current, water);
      resolvedRef.current = { ...resolvedRef.current, [decisionId]: { note } };
      setActions((previous) => [
        ...previous,
        {
          id: actionId,
          label: option.shortLabel,
          chosenDay,
          cost,
          durationDays: 0,
          completesDay,
          status: "complete",
          note,
        },
      ]);
    }

    setSpend(effectsRef.current.spend);
    setResolved({ ...resolvedRef.current });
    pausedDecisionRef.current = null;
    setPausedDecisionId(null);
  }

  const dryBaseline = useMemo(() => evaluate(emptyEffects(), -1.5, -3), []);
  const sceneAssets = snapshot?.assets ?? dryBaseline.assets;
  const sceneRoads = snapshot?.roads ?? dryBaseline.roads;
  const sceneWater = snapshot?.campusWater ?? -1.5;
  const selected =
    snapshot?.assets.find((asset) => asset.asset.id === selectedId) ?? null;
  const remaining = EMERGENCY_BUDGET - spend;
  const clockLabel = formatClock(t01);
  const currentDay = dayAt(t01);
  const healthCenter = snapshot?.assets.find(
    (asset) => asset.asset.kind === "hospital",
  );

  const liveBaseline = snapshot
    ? evaluate(
        emptyEffects(),
        riverElevAt(t01, scenario.peakElevation),
        t01 <= 0.8
          ? riverElevAt(t01, scenario.peakElevation)
          : scenario.peakElevation,
      )
    : null;
  const impact =
    snapshot && liveBaseline
      ? {
          water: Math.max(0, liveBaseline.campusWater - snapshot.campusWater),
          loss: Math.max(0, liveBaseline.totalLoss - snapshot.totalLoss),
          people: Math.max(
            0,
            liveBaseline.peopleAffected - snapshot.peopleAffected,
          ),
        }
      : null;

  const ringOverride = useMemo(() => {
    const rings: Record<string, string> = {};
    for (const assetId of Object.keys(effectsRef.current.extraRaise))
      rings[assetId] = "#27d9c2";
    return rings;
  }, [snapshot]);

  return (
    <div className="app drill-app">
      <div className="scene-wrap">
        <Scene
          assets={sceneAssets}
          roads={sceneRoads}
          waterElev={sceneWater}
          mitigations={EMPTY_MITIGATIONS}
          selectedId={selectedId}
          showAllLabels={false}
          ringOverride={ringOverride}
          onSelect={setSelectedId}
        />
      </div>

      {phase === "prep" && (
        <div className="intro">
          <div className="prep drill-prep">
            <button className="menu-back" onClick={onExit}>
              ← Menu
            </button>
            <span className="fyre-version">FYRE v{FYRE_VERSION}</span>
            <p className="eyebrow">LIVE DRILL · EMERGENCY RESPONSE</p>
            <h2>Ready to run the response?</h2>
            <p className="prep-lead">
              Choose the storm your team will face. You start at <b>Day -5</b>{" "}
              with a <b>{formatUSD(EMERGENCY_BUDGET)}</b> response budget. When
              a decision appears, the clock pauses so you can think. Your
              actions may take hours or days to finish.
            </p>
            <div data-tour="storm">
              <StormSelector value={scenarioId} onChange={setScenarioId} />
            </div>
            <div className="team-fields">
              <label className="field-label">
                Team name
                <input
                  value={team}
                  maxLength={80}
                  onChange={(e) => setTeam(e.target.value)}
                  placeholder="e.g. River Rangers"
                />
              </label>
              <label className="field-label">
                Class / session code
                <input
                  value={session}
                  maxLength={40}
                  onChange={(e) => setSession(e.target.value)}
                  placeholder="Optional"
                />
              </label>
            </div>
            <div className="drill-preview">
              <div data-tour="timer">
                <span>Timer</span>
                <strong>{DRILL_DURATION} seconds left</strong>
                <small>Day -5 → Day +2 · paused for choices</small>
              </div>
              <div data-tour="budget">
                <span>Budget left</span>
                <strong>{formatUSD(EMERGENCY_BUDGET)}</strong>
              </div>
              <div data-tour="actions">
                <span>Action controls</span>
                <strong>Barriers → People → Pumps → Power</strong>
                <small>Choose an option at each paused decision.</small>
              </div>
              <div data-tour="results">
                <span>Score / results</span>
                <strong>Score · loss avoided · people protected</strong>
                <small>Compare your response with other teams.</small>
              </div>
            </div>
            <div className="drill-rules">
              <div>
                <b>Protect people</b>
                <span>Move people before roads close.</span>
              </div>
              <div>
                <b>Keep lifelines online</b>
                <span>Power and health services matter.</span>
              </div>
              <div>
                <b>Reduce damage</b>
                <span>Use barriers and pumps early.</span>
              </div>
            </div>
            <details className="prep-more">
              <summary>What kinds of choices will I make?</summary>
              <p>
                You will choose barrier strength and location, a
                people-protection plan, pumping capacity, and a lifeline
                response. Your selected storm stays fixed for this run.
              </p>
            </details>
            <div className="prep-foot">
              <div className="budget">
                <span className="lbl">Response budget</span>
                <strong>{formatUSD(EMERGENCY_BUDGET)}</strong>
              </div>
              <button
                className="enter drill-start"
                disabled={!scenarioId || !team.trim() || showTutorial}
                onClick={() => beginDrill(false)}
              >
                Start the drill →
              </button>
            </div>
            <div className="reference-links">
              <button className="chip" onClick={() => setShowTutorial(true)}>
                Replay tutorial
              </button>
              <button className="chip" onClick={() => setShowComparison(true)}>
                Compare team results
              </button>
              <button className="chip" onClick={onReference}>
                Reference: Plan Comparison
              </button>
            </div>
            <p className="ins-note">
              Plan Comparison is an optional reference and possible Week 8
              follow-up.
            </p>
          </div>
        </div>
      )}

      {phase === "live" && snapshot && (
        <>
          <div className="drill-top">
            <button className="menu-back sm" onClick={onExit}>
              ✕
            </button>
            <div className="clock">
              <span className="clbl">
                {clockLabel.label} · {scenario.label} forecast
              </span>
              <strong>{Math.ceil(DRILL_DURATION - clock)}s left</strong>
              <span>{clockLabel.time}</span>
              <div className="clock-bar">
                <div
                  className="clock-fill"
                  style={{ width: `${t01 * 100}%` }}
                />
              </div>
            </div>
            {currentDecision && (
              <span className="pause-pill">Paused while you choose</span>
            )}
            <div className="gauge">
              <span className="clbl">Campus water</span>
              <strong>{Math.max(0, snapshot.campusWater).toFixed(1)} m</strong>
            </div>
            <div className="live-stats">
              <LiveStat
                label="Damage"
                value={formatUSD(snapshot.totalLoss)}
                danger
              />
              <LiveStat
                label="People at risk"
                value={snapshot.peopleAffected.toLocaleString()}
              />
              <LiveStat
                label="Power"
                value={snapshot.powerOut ? "OUT" : "ON"}
                danger={snapshot.powerOut}
              />
              <LiveStat
                label="Budget left"
                value={formatUSD(remaining)}
                danger={remaining < 0}
              />
            </div>
            <span className="fyre-version live">v{FYRE_VERSION}</span>
          </div>

          <aside className="drill-impact">
            <h2>Your impact so far</h2>
            <p className="drill-forecast">
              {scenario.label} · 1-in-{scenario.returnPeriod}-year flood
            </p>
            <ImpactRow
              label="Water reduced"
              value={`${impact?.water.toFixed(2) ?? "0.00"} m`}
            />
            <ImpactRow
              label="Damage prevented"
              value={formatUSD(impact?.loss ?? 0)}
            />
            <ImpactRow
              label="People protected"
              value={(impact?.people ?? 0).toLocaleString()}
            />
            <ImpactRow
              label="Campus power"
              value={snapshot.powerOut ? "Offline" : "Online"}
              good={!snapshot.powerOut}
            />
            <ImpactRow
              label="Health center"
              value={healthCenter?.functional ? "Online" : "Offline"}
              good={healthCenter?.functional}
            />
            {actions
              .filter((action) => action.status === "working")
              .map((action) => (
                <div className="operation" key={action.id}>
                  <span className="op-dot" />
                  <span>
                    <b>{action.label}</b>
                    <em>Finishes {formatDay(action.completesDay)}</em>
                    <span className="op-progress">
                      <i
                        style={{
                          width: `${operationProgress(action, currentDay)}%`,
                        }}
                      />
                    </span>
                  </span>
                </div>
              ))}
          </aside>

          {currentDecision && (
            <div className="decisions">
              <div className="decision">
                <div className="decision-paused">
                  Decision time · clock paused
                </div>
                <div className="d-body">
                  <span className="decision-day">{clockLabel.time}</span>
                  <span className="decision-forecast">
                    Forecast: {scenario.label} · mobilization costs reflect
                    storm scale
                  </span>
                  <strong>{currentDecision.title}</strong>
                  <p>{currentDecision.prompt}</p>
                  <details className="d-more">
                    <summary>Read more</summary>
                    <p>{currentDecision.readMore}</p>
                  </details>
                  <div className="d-opts">
                    {currentDecision.options.map((option) => {
                      const cost = decisionCost(option, scenario.id);
                      const unaffordable = cost > remaining;
                      return (
                        <button
                          key={option.id}
                          className={`d-opt ${cost ? "costed" : ""} ${option.futureOnly ? "future" : ""}`}
                          disabled={unaffordable}
                          onClick={() => choose(currentDecision.id, option)}
                        >
                          <span className="d-opt-title">{option.label}</span>
                          <span className="d-opt-meta">
                            {cost ? formatUSD(cost) : "No cost"} ·{" "}
                            {option.durationDays
                              ? formatDuration(option.durationDays)
                              : "Immediate"}
                            {unaffordable
                              ? ` · ${formatUSD(cost - remaining)} over budget`
                              : ""}
                          </span>
                          <span className="d-opt-detail">
                            <b>Helps:</b> {option.detail}
                          </span>
                          <span className="d-opt-tradeoff">
                            <b>Tradeoff:</b> {option.tradeoff}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}

          <ResolutionFeed resolved={resolved} />

          {selected && (
            <div className="scanner">
              <div
                className="scanner-head"
                style={{ borderColor: DAMAGE_COLORS[selected.state] }}
              >
                <span
                  className="dot"
                  style={{ background: DAMAGE_COLORS[selected.state] }}
                />
                <strong>{selected.asset.name}</strong>
                <button className="x" onClick={() => setSelectedId(null)}>
                  ✕
                </button>
              </div>
              <div className="scan-rows">
                <ScanRow
                  k="Damage"
                  v={selected.state.toUpperCase()}
                  color={DAMAGE_COLORS[selected.state]}
                />
                <ScanRow
                  k="Flood depth"
                  v={
                    selected.floodDepth > 0
                      ? `${selected.floodDepth.toFixed(2)} m`
                      : "dry"
                  }
                />
                <ScanRow
                  k="Grid power"
                  v={
                    selected.powered
                      ? "powered"
                      : selected.dryButDark
                        ? "DARK (cascade)"
                        : "OUT"
                  }
                  color={selected.powered ? "#31c48d" : "#ff4d5e"}
                />
                <ScanRow k="Estimated loss" v={formatUSD(selected.loss)} />
              </div>
            </div>
          )}
        </>
      )}

      {phase === "debrief" && scorecard && (
        <div className="modal-back">
          <div className="modal scorecard drill-scorecard">
            <h2>
              {team.trim()} · {scenario.label} storm
            </h2>
            <div className="result-metrics">
              <LiveStat
                label="Loss avoided"
                value={formatUSD(scorecard.lossAvoided)}
              />
              <LiveStat
                label="People protected*"
                value={scorecard.peopleSafe.toLocaleString()}
              />
              <LiveStat
                label="Budget spent"
                value={formatUSD(scorecard.totalSpend)}
              />
            </div>
            <p className="ins-note">
              *Occupants and service impacts; not a count of unique people.
            </p>
            <p className="eyebrow">
              DRILL COMPLETE · {scenario.label.toUpperCase()} FLOOD · FYRE v
              {FYRE_VERSION}
            </p>
            <div className="score-hero">
              <div className={`score-ring g-${scorecard.grade[0]}`}>
                <span className="score-num">{scorecard.score}</span>
                <span className="score-of">/ 100</span>
              </div>
              <div className="score-side">
                <span className="grade">{scorecard.grade}</span>
                <span className="grade-lbl">Response score</span>
              </div>
            </div>
            <div className="gradebook">
              <div className="gb-head">How your score was earned</div>
              {scorecard.gradebook.map((line) => (
                <div key={line.label} className="gb-line">
                  <div className="gb-top">
                    <span>{line.label}</span>
                    <b
                      className={
                        line.earned >= line.max * 0.6
                          ? "good"
                          : line.earned <= line.max * 0.25
                            ? "dng"
                            : ""
                      }
                    >
                      {line.earned} / {line.max} pts
                    </b>
                  </div>
                  <div className="gb-bar">
                    <div
                      className="gb-fill"
                      style={{
                        width: `${(line.earned / line.max) * 100}%`,
                        background:
                          line.earned >= line.max * 0.6
                            ? "#27d9c2"
                            : line.earned <= line.max * 0.25
                              ? "#ff5d6c"
                              : "#ffd447",
                      }}
                    />
                  </div>
                  <em className="gb-detail">{line.detail}</em>
                </div>
              ))}
            </div>
            <div className="response-sequence">
              <h3>Your response sequence</h3>
              {actions.map((action, index) => (
                <div
                  className={`sequence-row ${action.status}`}
                  key={action.id}
                >
                  <b>{index + 1}</b>
                  <span>
                    <strong>
                      {formatDay(action.chosenDay)} · {action.label}
                    </strong>
                    <em>{action.note}</em>
                  </span>
                  <small>{formatUSD(action.cost)}</small>
                </div>
              ))}
            </div>
            <p className="takeaway">
              {scorecard.score < 45
                ? "Try a different sequence. Fast actions that finish before flood peak protect more people and prevent more damage. Saving every dollar does not create resilience."
                : `Your response prevented ${formatUSD(scorecard.lossAvoided)} in damage and protected ${scorecard.peopleSafe.toLocaleString()} people. Re-run it to test whether a different order works better.`}
            </p>
            <div className="reflection-task">
              <h3>Compare and reflect together</h3>
              <p>
                For this flood level, who scored most and who avoided the most
                loss? Identify the decisions that worked well and explain their
                tradeoffs.
              </p>
            </div>
            <div className="reference-links">
              <button className="chip" onClick={copyResult}>
                Copy result
              </button>
              <button className="chip" onClick={() => setShowComparison(true)}>
                Compare team results / Import result
              </button>
              <button className="chip" onClick={onReference}>
                Reference: Plan Comparison
              </button>
            </div>
            <p role="status">{storageMessage}</p>
            {copyText && (
              <label className="field-label">
                Result to copy
                <textarea
                  readOnly
                  value={copyText}
                  onFocus={(e) => e.target.select()}
                />
              </label>
            )}
            <div className="score-actions drill-replay-actions">
              <button className="enter" onClick={() => beginDrill(true)}>
                Retry same storm
              </button>
              <button className="enter alt" onClick={() => setPhase("prep")}>
                Choose another storm
              </button>
              <button className="enter alt" onClick={onExit}>
                Back to menu
              </button>
            </div>
          </div>
        </div>
      )}

      {showTutorial && phase === "prep" && (
        <DrillTutorial onClose={() => setShowTutorial(false)} />
      )}
      {showComparison && (
        <TeamComparison
          stormId={scenario.id}
          session={session}
          onClose={() => setShowComparison(false)}
        />
      )}
      {phase === "live" && !currentDecision && (
        <div className="hint">
          The clock is moving · watch operations finish · click a building to
          inspect it
        </div>
      )}
    </div>
  );
}

function LiveStat({
  label,
  value,
  danger,
}: {
  label: string;
  value: string;
  danger?: boolean;
}) {
  return (
    <div className="live-stat">
      <span>{label}</span>
      <b className={danger ? "dng" : ""}>{value}</b>
    </div>
  );
}

function ImpactRow({
  label,
  value,
  good,
}: {
  label: string;
  value: string;
  good?: boolean;
}) {
  return (
    <div className="impact-row">
      <span>{label}</span>
      <b className={good ? "good" : ""}>{value}</b>
    </div>
  );
}

function ScanRow({ k, v, color }: { k: string; v: string; color?: string }) {
  return (
    <div className="scan-row">
      <span>{k}</span>
      <b style={color ? { color } : undefined}>{v}</b>
    </div>
  );
}

function ResolutionFeed({
  resolved,
}: {
  resolved: Record<string, Resolution>;
}) {
  const entries = Object.values(resolved);
  if (entries.length === 0) return null;
  return <div className="feed">{entries[entries.length - 1].note}</div>;
}

function dayAt(t01: number): number {
  return -5 + t01 * DRILL_DAYS;
}

function formatDay(day: number): string {
  if (Math.abs(day) < 0.08) return "Event day";
  const rounded = Math.round(Math.abs(day) * 2) / 2;
  return day < 0 ? `Day -${rounded}` : `Day +${rounded}`;
}

function formatClock(t01: number): { label: string; time: string } {
  const day = dayAt(t01);
  return {
    label:
      day < -1
        ? "Storm approaching"
        : day < 0.2
          ? "Flood arriving"
          : "Recovery begins",
    time: formatDay(day),
  };
}

function formatDuration(days: number): string {
  if (days < 1) return `${Math.round(days * 24)} hours`;
  return `${days} ${days === 1 ? "day" : "days"}`;
}

function operationProgress(action: ActionRecord, currentDay: number): number {
  if (action.durationDays <= 0) return 100;
  return Math.max(
    0,
    Math.min(
      100,
      ((currentDay - action.chosenDay) / action.durationDays) * 100,
    ),
  );
}
