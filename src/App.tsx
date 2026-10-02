import { useMemo, useState } from "react";
import { Scene } from "./three/Scene";
import { Drill } from "./Drill";
import { Compare } from "./Compare";
import { Insurance } from "./Insurance";
import { Sandbox } from "./Sandbox";
import { SCENARIOS } from "./game/data";
import { EMPTY_MITIGATIONS, runModel } from "./game/model";
import { FYRE_VERSION } from "./game/drill";
import { PLAN_COMPARISON_IN_MAIN_FLOW } from "./game/activityConfig";
type Mode = "menu" | "sandbox" | "drill" | "compare" | "insurance";
export default function App() {
  const [mode, setMode] = useState<Mode>("menu");
  const [referenceReturn, setReferenceReturn] = useState<"menu" | "drill">(
    "menu",
  );
  const result = useMemo(() => runModel(SCENARIOS[2], EMPTY_MITIGATIONS), []);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Keep the drill mounted while its optional reference is open, preserving runs.
  if (mode === "drill" || (mode === "compare" && referenceReturn === "drill"))
    return (
      <>
        <div hidden={mode !== "drill"}>
          <Drill
            onExit={() => setMode("menu")}
            onReference={() => {
              setReferenceReturn("drill");
              setMode("compare");
            }}
          />
        </div>
        {mode === "compare" && <Compare onExit={() => setMode("drill")} />}
      </>
    );
  if (mode === "compare") return <Compare onExit={() => setMode("menu")} />;
  if (mode === "insurance") return <Insurance onExit={() => setMode("menu")} />;
  if (mode === "sandbox") return <Sandbox onExit={() => setMode("menu")} />;
  function reference() {
    setReferenceReturn("menu");
    setMode("compare");
  }
  return (
    <div className="app">
      <div className="scene-wrap">
        <Scene
          assets={result.assets}
          roads={result.roads}
          waterElev={result.effectiveWaterElev}
          mitigations={EMPTY_MITIGATIONS}
          selectedId={selectedId}
          showAllLabels={false}
          onSelect={setSelectedId}
        />
      </div>
      <div className="intro">
        <div className="intro-inner">
          <p className="eyebrow">CAT MODEL · FIELD SIMULATION</p>
          <h1>
            FloodRisk <span>FYRE</span>
          </h1>
          <p className="sub">Lehigh Resilience Challenge</p>
          <p className="lead">
            A flood is inbound on the riverside campus. Make the calls before
            and during the event and learn why{" "}
            <b>hazard × exposure × vulnerability = risk</b>.
          </p>
          <div className="mode-cards">
            <button
              className="mode-card drill"
              onClick={() => setMode("drill")}
            >
              <span className="mc-tag">⏱ REAL-TIME</span>
              <strong>Live Drill</strong>
              <span className="mc-desc">
                Choose your storm and team. Start at Day -5, pause for each
                response decision, and watch actions finish. Compare your
                resilience score with other teams.
              </span>
              <span className="mc-go">Start the drill →</span>
            </button>
            {PLAN_COMPARISON_IN_MAIN_FLOW && (
              <button className="mode-card compare" onClick={reference}>
                <span className="mc-tag cmp">⚖ COMPARE</span>
                <strong>Plan Comparison</strong>
                <span className="mc-desc">
                  Guided dilemmas and a free builder to compare plans side by
                  side.
                </span>
                <span className="mc-go">Compare plans →</span>
              </button>
            )}
            <button
              className="mode-card insurance"
              onClick={() => setMode("insurance")}
            >
              <span className="mc-tag ins">$ PRICE RISK</span>
              <strong>Decision Lab · Insurance Desk</strong>
              <span className="mc-desc">
                Read each stage’s information, set a price, and submit your
                decision. Explore profit and coverage with no single correct
                answer.
              </span>
              <span className="mc-go">Open the desk →</span>
            </button>
            <button className="mode-card" onClick={() => setMode("sandbox")}>
              <span className="mc-tag alt">◇ EXPLORE</span>
              <strong>Sandbox</strong>
              <span className="mc-desc">
                One flood, five agencies. Your role determines your decisions
                and consequences. Compare spending with loss prevented.
              </span>
              <span className="mc-go">Open the lab →</span>
            </button>
          </div>
          <button className="chip" onClick={reference}>
            Reference: Plan Comparison · optional Week 8 follow-up
          </button>
          <details className="class-sequence">
            <summary>Suggested classroom activity sequence</summary>
            <ol>
              <li>Start with the bridge game.</li>
              <li>
                Run FloodRiskFYRE Live and compare team results for the same
                storm.
              </li>
              <li>
                Complete the paper activity and the HTML decision sheet in the
                Insurance Desk.
              </li>
              <li>Move to the UNDRR disaster-prevention game.</li>
            </ol>
            <p>
              Use your course’s bridge, paper, and UNDRR materials for the
              surrounding activities.
            </p>
          </details>
          <p className="foot">
            FYRE v{FYRE_VERSION} · Illustrative educational model
          </p>
        </div>
      </div>
    </div>
  );
}
