// Illustrative classroom insurance market, using the shared CAT loss engine.
// Annual losses integrate the same four flood scenarios used in Live / Sandbox.
import { ASSETS, SCENARIOS, type Asset } from './data'
import { EMPTY_MITIGATIONS, computeAssets, formatUSD } from './model'
const SCENARIO_LOSS = SCENARIOS.map(s => Object.fromEntries(computeAssets(EMPTY_MITIGATIONS,s.peakElevation).map(r => [r.asset.id,r.loss])))
export function integrateLosses(losses: number[]): number {
  const points = [[0.2,0], ...SCENARIOS.map((s,i) => [s.annualProbability,losses[i] ?? 0])]
  let total = 0
  for (let i=0;i<points.length-1;i++) total += (points[i][1]+points[i+1][1])*0.5*(points[i][0]-points[i+1][0])
  return total + points[points.length-1][0]*points[points.length-1][1]
}
export function computeEAL(id: string) { return integrateLosses(SCENARIO_LOSS.map(l => l[id] ?? 0)) }
// Retained as an internal event-loss lookup for hazard pricing; absent from student UI.
export function computePML(id: string, returnPeriod: number) { return SCENARIO_LOSS[SCENARIOS.findIndex(s => s.returnPeriod===returnPeriod)]?.[id] ?? 0 }
export const VULNERABILITY_STAGE = 4
export const INSURANCE_LEVELS = [
  {level:1,title:'Inventory',unlocks:'You know the building values. Choose a flat annual rate.'},
  {level:2,title:'Hazard',unlocks:'Floods range from Minor to Extreme. Keep the same flat-rate approach.'},
  {level:3,title:'Exposure',unlocks:'Low-lying buildings and the people who use them are exposed differently. Compare a new flat rate.'},
  {level:4,title:'Vulnerability & affordability',unlocks:'Depth and fragility reveal expected claims. Loading and other pricing approaches now become available.'},
  {level:5,title:'Policy terms',unlocks:'Set coverage limits and deductibles, then inspect how the owner and insurer share the event loss.'},
]
export type Strategy = 'flat' | 'hazard' | 'fair' | 'capped'
export const STRATEGY_MIN_LEVEL: Record<Strategy,number> = {flat:1,hazard:4,fair:4,capped:4}
export interface Levers {
 strategy: Strategy; loadingFactor:number; insuredValuePct:number; deductiblePct:number;
 fixedExpense:number; flatRatePct:number; affordCapPct:number;
}
export const DEFAULT_LEVERS: Levers = {strategy:'fair',loadingFactor:0.4,insuredValuePct:0.85,deductiblePct:0.03,fixedExpense:250,flatRatePct:0.004,affordCapPct:0.009}
const clamp = (x:number,lo=0,hi=1) => Math.max(lo,Math.min(hi,Number.isFinite(x) ? x : lo))
export function normalizeLevers(lv: Levers): Levers {
 return {...lv,loadingFactor:clamp(lv.loadingFactor,0,0.6),insuredValuePct:clamp(lv.insuredValuePct),deductiblePct:clamp(lv.deductiblePct,0,0.1),fixedExpense:clamp(lv.fixedExpense,0,1000),flatRatePct:clamp(lv.flatRatePct,0,0.02),affordCapPct:clamp(lv.affordCapPct,0,0.02)}
}
export function leversForStage(lv:Levers,stage:number):Levers {
 return normalizeLevers({...lv,strategy:stage<4?'flat':lv.strategy,loadingFactor:stage<4?0:lv.loadingFactor,affordCapPct:stage<4?DEFAULT_LEVERS.affordCapPct:lv.affordCapPct,insuredValuePct:stage<5?1:lv.insuredValuePct,deductiblePct:stage<5?0:lv.deductiblePct,fixedExpense:stage<5?250:lv.fixedExpense})
}
export interface FinancialBreakdown {repairCost:number;coveredLoss:number;ownerPays:number;insurerPays:number;underinsured:boolean}
export function financialBreakdown(repairCost:number,value:number,raw:Levers):FinancialBreakdown {
 const lv=normalizeLevers(raw); const limit=value*lv.insuredValuePct; const deductible=limit*lv.deductiblePct
 const claim=Math.min(limit,Math.max(0,repairCost-deductible))
 return {repairCost,coveredLoss:claim,ownerPays:repairCost-claim,insurerPays:claim,underinsured:repairCost>limit}
}
export interface PremiumComponents {eal:number;policyEal:number;loadingAmount:number;grossPremium:number;insuredValue:number;deductibleUsd:number;netInsurerEal:number;netPremium:number;lossRatio:number;expenseRatio:number;combinedRatio:number}
export function premiumFromLosses(losses:number[],value:number,eventLoss:number,raw:Levers):PremiumComponents {
 const lv=normalizeLevers(raw); const eal=integrateLosses(losses); const limit=value*lv.insuredValuePct
 const pure=integrateLosses(losses.map(loss=>financialBreakdown(loss,value,lv).insurerPays))
 const fair=pure*(1+lv.loadingFactor)+lv.fixedExpense
 const factor=value>0?clamp(0.6+3.2*eventLoss/value,0.6,2.2):0
 const flat=limit*lv.flatRatePct*(1+lv.loadingFactor)
 const premium=limit===0?0:lv.strategy==='flat'?flat:lv.strategy==='hazard'?flat*factor:lv.strategy==='capped'?Math.min(fair,limit*lv.affordCapPct):fair
 return {eal,policyEal:pure,loadingAmount:pure*lv.loadingFactor,grossPremium:premium,insuredValue:limit,deductibleUsd:limit*lv.deductiblePct,netInsurerEal:pure,netPremium:premium,lossRatio:premium>0?pure/premium:0,expenseRatio:premium>0?lv.fixedExpense/premium:0,combinedRatio:premium>0?(pure+lv.fixedExpense)/premium:0}
}
export function premiumComponents(id:string,_eal:number,value:number,eventLoss:number,lv:Levers) {return premiumFromLosses(SCENARIO_LOSS.map(l=>l[id]??0),value,eventLoss,lv)}
// Teaching uptake model: demand falls as annual price approaches twice the
// affordability threshold. Occupants are weights, not an actual household census.
export function coverageUptake(premium:number,value:number,capPct:number):number {
 if (value<=0) return 0
 if (premium===0) return 1
 if (capPct<=0) return 0
 return clamp(1-premium/(2*value*capPct))
}
export interface BuildingLine {asset:Asset;eal:number;comp:PremiumComponents;uptake:number;event100:FinancialBreakdown}
export interface InsuranceResult {lines:BuildingLine[];totalEal:number;totalPremium:number;totalExpenses:number;netIncome:number;coverageShare:number;insuredExposureShare:number;portfolioCombinedRatio:number}
export function runInsurance(raw:Levers):InsuranceResult {
 const lv=normalizeLevers(raw)
 const lines=ASSETS.map(asset=>{const eventLoss=computePML(asset.id,100);const comp=premiumComponents(asset.id,computeEAL(asset.id),asset.value,eventLoss,lv);return {asset,eal:comp.eal,comp,uptake:lv.insuredValuePct===0?0:coverageUptake(comp.netPremium,asset.value,lv.affordCapPct),event100:financialBreakdown(eventLoss,asset.value,lv)}})
 const totalEal=lines.reduce((s,l)=>s+l.comp.policyEal*l.uptake,0)
 const totalPremium=lines.reduce((s,l)=>s+l.comp.netPremium*l.uptake,0)
 const totalExpenses=lines.reduce((s,l)=>s+lv.fixedExpense*l.uptake*(lv.insuredValuePct>0?1:0),0)
 const households=lines.filter(l=>l.asset.kind==='dorm')
 const residentialPeople=households.reduce((s,l)=>s+l.asset.occupants,0)
 return {lines,totalEal,totalPremium,totalExpenses,netIncome:totalPremium-totalEal-totalExpenses,coverageShare:residentialPeople>0?households.reduce((s,l)=>s+l.uptake*l.asset.occupants,0)/residentialPeople:0,insuredExposureShare:lines.reduce((s,l)=>s+l.comp.insuredValue*l.uptake,0)/ASSETS.reduce((s,a)=>s+a.value,0),portfolioCombinedRatio:totalPremium>0?(totalEal+totalExpenses)/totalPremium:0}
}
export function portfolioSummary() {const r=runInsurance(DEFAULT_LEVERS);return {totalEal:r.totalEal,combinedRatio:r.portfolioCombinedRatio,totalPremium:r.totalPremium}}
export {formatUSD}
