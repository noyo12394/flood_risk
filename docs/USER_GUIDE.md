# FloodRiskFYRE instructor and student guide

All numbers are illustrative teaching values. The simplified campus and its health
center represent the shared Lehigh/Bethlehem service region. This is a teaching
model, not a prediction for an actual flood.

## Suggested classroom sequence

1. Start with your course’s bridge game.
2. Play FloodRiskFYRE Live. Teams select the same storm so results are comparable.
3. Complete the paper activity and the Insurance Desk HTML decision sheet.
4. Move to the UNDRR disaster-prevention game.

Plan Comparison is available as an optional reference / Week 8 follow-up.

## Live Drill

Enter a team name and optional class/session code, then choose Minor, Moderate,
Major or Extreme. Each storm has a fixed peak and identical flood curve for all
teams. The first-run tutorial points out the selector, timer, budget, actions and
results. Skip it or use Replay tutorial before starting.

The countdown starts at 100 seconds. It pauses for each decision and resumes
after you choose. Operation completion takes simulation time; the progress panel
shows when crews will finish. Options show costs, setup times, benefits and
tradeoffs. Unaffordable choices are unavailable.

The score includes damage prevented, people protected, lifelines and budget use.
The results card shows storm, score, loss avoided, people protected, spending and
ordered decisions. Retry the same storm or return to setup to choose another.

Compare team results uses the exact storm and session code. Teams share results
with Copy result; an instructor collects them with Import result. JSON can also
be selected/copied manually if clipboard access is unavailable. Results live in
this browser’s localStorage, never in a shared backend. Clearing browser data
removes them. Preview URLs and different devices have separate stores. Up to
1,000 runs are kept. Re-importing a run replaces it instead of making a duplicate.
If storage is unavailable the page keeps its runs in memory; copy them before
leaving. Exported records can be edited, so use this as a reflection activity.

Discuss who scored most, who avoided the most loss, which decisions worked, and
how timing and tradeoffs affected outcomes. People metrics include overlapping
occupant/service impacts and are not a count of unique people.

## Decision Lab / Insurance Desk

Read the stage information, set inputs, press Submit decision, read consequences,
then select Next stage. There is no correct/incorrect grade.

- Stages 1–3: flat rate only. Inventory, flood hazard and exposure are introduced
  progressively. Advanced pricing metrics do not appear.
- Stage 4: vulnerability, loading, affordability and other price approaches.
- Stage 5: policy limits, deductibles and operating expense. Click a building to
  examine its owner/insurer loss allocation after submitting.

Submission locks controls while the result is visible. Results show annual
premium income, expected claims, expected profit and share of households covered.
Household coverage uses dorm occupancy as a teaching proxy. Higher prices reduce
uptake under the illustrative market rule. Vulnerability uses a clearly labeled
0–100% damage ratio. PML is absent from student views. Reinsurance is not part of
the game or its calculation.

## Sandbox agencies

Choose a role and storm before starting. All roles face the same baseline. Role
changes reset decisions. Each funded action has a cost; the budget is enforced.
Compare standalone action benefits, then inspect the combined result.

| Agency | Decisions | Main outcomes |
| --- | --- | --- |
| Lehigh president | Campus retrofit/elevation, campus protection/drainage, generators, emergency action and repairs | Loss prevented, people protected |
| Bethlehem mayor | River wall OR levee/dike, upstream floodplain, hospital hardening or an elevated care wing | Loss prevented, people protected |
| Emergency management | Shelters, evacuation training/vehicles, hospital continuity, recovery crews, materials and safe roads | People protected/impacted, damage, recovery and access |
| Utility CEO | Raise substation, prioritize hospital/campus power, stage restoration crews | Weighted power downtime, buildings powered |
| Underwriter | Prices, deductibles, limits, mitigation discounts, cap/decline highest-risk coverage | Expected and flood-year profit, share of exposure insured |

Money spent, loss prevented and benefit/cost are shown for every role. Review role
results opens a role-specific reflection; Revise decisions returns to controls.
A wall overtops above 5.0 m but retains 0.2 m protection; a levee breaches above
4.6 m and loses protection. Repairs reduce recovery time but not initial damage.
Power backup works only where direct building damage remains below the functional
failure threshold. The elevated hospital wing is represented at the existing
health-center site. Role costs/effects can be tuned in `src/game/sandboxConfig.ts`.
