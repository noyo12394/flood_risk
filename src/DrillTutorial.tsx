import { useEffect, useState } from "react";
const STEPS = [
  ["storm", "Pick the storm you'll face."],
  ["timer", "This is your timer; it counts down once you start."],
  ["budget", "This is the budget you have left."],
  [
    "actions",
    "Use these action controls to choose a response while the clock pauses.",
  ],
  [
    "results",
    "Here you will see your score, loss avoided, and people protected.",
  ],
];
export function tutorialSeen() {
  try {
    return localStorage.getItem("fyre.drill.tutorial.v1") === "seen";
  } catch {
    return false;
  }
}
export function DrillTutorial({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  useEffect(() => {
    const el = document.querySelector(`[data-tour="${STEPS[step][0]}"]`);
    el?.scrollIntoView({ block: "nearest", behavior: "instant" });
    const measure = () => setRect(el?.getBoundingClientRect() ?? null);
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [step]);
  function close() {
    try {
      localStorage.setItem("fyre.drill.tutorial.v1", "seen");
    } catch {
      /* Tutorial still works without storage. */
    }
    onClose();
  }
  return (
    <div className="tour-layer">
      {rect && (
        <div
          className="tour-spot"
          style={{
            left: rect.left - 5,
            top: rect.top - 5,
            width: rect.width + 10,
            height: rect.height + 10,
          }}
        />
      )}
      <section
        className="tour-card"
        role="dialog"
        aria-modal="true"
        aria-label="Live Drill tutorial"
      >
        <span className="eyebrow">
          LIVE DRILL TOUR · {step + 1} / {STEPS.length}
        </span>
        <p>{STEPS[step][1]}</p>
        <div className="tour-nav">
          <button className="enter alt" onClick={close}>
            Skip tutorial
          </button>
          {step > 0 && (
            <button className="enter alt" onClick={() => setStep(step - 1)}>
              Back
            </button>
          )}
          <button
            className="enter"
            onClick={() =>
              step === STEPS.length - 1 ? close() : setStep(step + 1)
            }
          >
            {step === STEPS.length - 1 ? "Finish tutorial" : "Next"}
          </button>
        </div>
      </section>
    </div>
  );
}
