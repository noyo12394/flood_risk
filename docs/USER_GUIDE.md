# FloodRisk FYRE — User Guide

**Play it here:** https://final-eight-theta-85.vercel.app/

A 3D flood-resilience game for a riverside campus. You make decisions, watch the
flood rise, and see what fails. This guide is instructions only.

---

## 1. Open & basic controls

1. Open https://final-eight-theta-85.vercel.app/ in a desktop browser (Chrome, Safari, Edge, Firefox).
2. On the start screen, pick one of three modes (below).
3. Anywhere in the 3D view:
   - **Drag** = orbit the camera
   - **Scroll / pinch** = zoom
   - **Click a building** = scan it (damage, flood depth, power, loss)
4. To leave a mode, click the **✕** (top-left) or the **≈ logo** to return to the menu.

**Read the campus:** lit windows = powered. Dark windows = no power.
Cyan power lines = energized. Red power lines = failed. A red ⚡ OUT / ⚡ DARK
tag over a building means it lost power (DARK = it's dry but still lost power).

---

## 2. Live Drill  ⏱  (real-time decisions + score)

A timed emergency. The clock runs, the river rises, you act before deadlines.

1. **Prep screen:** choose a storm severity (Minor → Extreme) and tick the
   capital upgrades you want to buy up front (drainage, elevate buildings, raise
   substation, elevate roads). Stay within the budget shown.
2. Click **Start the drill**. The clock begins and water starts rising.
3. **Answer the alert cards** as they pop up (deploy barriers, evacuate, sandbag
   the substation, close roads, open a shelter). Each card has a shrinking timer
   bar — **act before it runs out**, or the option is lost. Acting *earlier*
   gives a bigger benefit.
4. Watch the top bar: clock, water level, loss, people at risk, buildings dark,
   budget.
5. When the event ends you get a **resilience score (0–100) and letter grade**,
   with a breakdown of loss avoided, people protected, lifelines, and budget.
6. Click **Re-run drill** to try different choices, or **Back to menu**.

**Goal:** highest score = lowest loss, most people protected, power kept on,
within budget.

---

## 3. Decision Lab  ⚖  (compare Plan A vs Plan B)

Two tabs at the top-right: **Guided dilemmas** and **Free compare**.

### Guided dilemmas (taught lessons)
1. Read the situation. Two plans are offered (Plan A and Plan B).
2. Click a plan chip to **view that plan's flooded campus in 3D**; click the
   other chip to flip between them.
3. **Commit to a trade-off:** click the plan you would choose for the stated
   objective.
4. Both outcomes are revealed side-by-side. The model gives a recommendation
   for that objective and explains what each plan gains and gives up; it does
   not mark your choice right or wrong.
5. Click **Next dilemma** to continue, or **Retry**.

### Free compare (build your own)
1. Set **Plan A** (left panel) and **Plan B** (right panel): pick a flood
   scenario and tick any mitigations.
2. Click a panel's header (**view in 3D**) to show that plan's campus.
3. Read the **scoreboard** at the bottom — damage, buildings dark, people,
   downtime, spend, and cost of risk. The better value in each row is
   highlighted, and a recommended plan + one-line insight is shown.

---

## 4. Insurance Desk  $  (price the risk like an actuary)

The data unlocks in **5 levels** — you start pricing blind and earn more
information as you go (this is the intended classroom flow):

- **Level 1 — Inventory:** building value, use, occupants only. Only the *Flat
  rate* strategy is available.
- **Level 2 — Hazard:** flood exposure + PML at 100/500-yr per building, plus
  the *Hazard-scaled* strategy.
- **Level 3 — Vulnerability:** Expected Annual Loss (EAL) — now *Actuarially
  fair* pricing and the Coverage/Profitability scores unlock.
- **Level 4 — Affordability:** affordability caps — *Affordability-capped*
  pricing and the Affordability score unlock; the full composite is scored.
- **Level 5 — Financial model:** open the pricing black box. Adjust insured
  value, deductible, and reinsurance, then trace a 100-year loss across the
  owner, primary insurer, and reinsurer.

Steps:

1. Click **Unlock Level N →** (left) to reveal more data, then **pick a pricing
   strategy** (locked ones show the level they need).
2. **Adjust the levers** (sliders): loading factor and flat rate at early
   levels; insured value, deductible, and reinsurance at Level 5.
3. Read the **Portfolio scorecard** (right): the 0–100 composite and its three
   parts — **Coverage** (premiums cover expected loss), **Affordability**
   (premiums under the rate-on-line cap), **Profitability** (combined ratio
   under 100% = underwriting profit). Watch the tension: covering every risk and
   staying affordable pull against each other.
4. **Click any building** for its full breakdown — replacement and insured
   value, gross and policy EAL, PML at 100/500-yr, premium, deductible, rate on
   line, and combined ratio. At Level 5, the right panel also shows who pays a
   100-year loss.
5. Green ring = the premium covers that building's EAL; red = under-priced.

## 5. Sandbox  ◇  (free exploration, no clock)

1. Open **How to use** for the built-in four-step walkthrough.
2. Pick a **flood scenario** (top-right).
3. Drag **Move controls** to reposition the panel, or collapse it to clear the
   visualization.
4. Toggle **mitigations** and watch both the CAT dashboard and the live **What
   your choices changed** summary update.
5. Switch **role** (Emergency Manager, Engineer, Budget Officer, Risk Analyst)
   to change what the dashboard emphasizes.
6. **Click any building** to scan its details.
7. Click **Run before / after reflection** to compare your plan against doing
   nothing.

---

## 6. The one idea to take away

> **Risk = Hazard × Exposure × Vulnerability**

You can't change the hazard (the flood), but you *can* change exposure and
vulnerability. Watch for the **cascade**: if the power substation floods, every
building it feeds goes dark — even dry ones on high ground. Often, protecting the
lifeline (raising the substation, lowering the water) does more for resilience
than reducing flood damage to individual buildings.

---

*Educational tool with simplified, illustrative data — not a research-grade model.*
