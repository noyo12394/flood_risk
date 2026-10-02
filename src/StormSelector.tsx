import { SCENARIOS, type FloodScenario } from "./game/data";
export type StormId = FloodScenario["id"];
export function StormSelector({
  value,
  onChange,
}: {
  value: StormId | "";
  onChange: (id: StormId) => void;
}) {
  return (
    <fieldset className="storm-selector">
      <legend>Choose storm intensity</legend>
      <div className="chips">
        {SCENARIOS.map((s) => (
          <button
            type="button"
            key={s.id}
            className={`chip ${value === s.id ? "on" : ""}`}
            aria-pressed={value === s.id}
            onClick={() => onChange(s.id)}
          >
            {s.label}
            <small>{s.peakElevation.toFixed(1)} m peak</small>
          </button>
        ))}
      </div>
      <p>
        {SCENARIOS.find((s) => s.id === value)?.blurb ??
          "Select a storm before starting."}{" "}
        Each team choosing this level faces the same flood.
      </p>
    </fieldset>
  );
}
