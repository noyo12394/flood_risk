// ILLUSTRATIVE TEACHING VALUES ONLY, not real Bethlehem / Lehigh estimates.
// The instructor can tune every new action cost and effect here. The stylized
// campus and health center stand in for the shared campus/city service region.
export type SandboxRoleId =
  | "president"
  | "mayor"
  | "emergency"
  | "utility"
  | "underwriter";
export interface TeachingEffect {
  reduction?: number;
  raise?: Record<string, number>;
  damageScale?: Record<string, number>;
  backup?: string[];
  evacFraction?: number;
  shelterCapacity?: number;
  recoveryFactor?: number;
  barrier?: {
    height: number;
    reduction: number;
    failureReduction: number;
    failure: "overtopping" | "breach";
  };
  elevateRoads?: boolean;
  mitigationDiscount?: number;
}
export interface SandboxAction {
  id: string;
  role: SandboxRoleId;
  label: string;
  cost: number;
  description: string;
  effect: TeachingEffect;
  exclusiveGroup?: string;
}
export const CAMPUS_IDS = [
  "library",
  "dorm-a",
  "classroom-1",
  "lab",
  "dorm-b",
  "admin",
];
const allCampus = (value: number) =>
  Object.fromEntries(CAMPUS_IDS.map((id) => [id, value]));
export const SANDBOX_ROLES = [
  {
    id: "president" as const,
    name: "Lehigh University President",
    domain: "Lehigh campus",
    focus: "Reduce campus loss and protect people.",
    color: "#31c48d",
  },
  {
    id: "mayor" as const,
    name: "Mayor of Bethlehem",
    domain: "City of Bethlehem / Lehigh River",
    focus: "Choose river protection and fund hospitals.",
    color: "#f6c945",
  },
  {
    id: "emergency" as const,
    name: "Emergency Management Agency director",
    domain: "Regional emergency response",
    focus: "Protect people, maintain care, and coordinate recovery.",
    color: "#ff7a45",
  },
  {
    id: "utility" as const,
    name: "Utility company CEO",
    domain: "Power grid",
    focus: "Reduce power downtime to hospitals and campus.",
    color: "#27d9c2",
  },
  {
    id: "underwriter" as const,
    name: "Insurance company underwriter",
    domain: "Insurance market",
    focus: "Balance profit and the share of exposure insured.",
    color: "#6c9bff",
  },
];
export const SANDBOX_BUDGETS: Record<SandboxRoleId, number> = {
  president: 6000000,
  mayor: 6000000,
  emergency: 3000000,
  utility: 2500000,
  underwriter: 500000,
};
export const SANDBOX_ACTIONS: SandboxAction[] = [
  {
    id: "retrofit",
    role: "president",
    label: "Retrofit campus buildings",
    cost: 1000000,
    description:
      "Flood-proof vulnerable openings; multiply campus damage ratios by 0.75.",
    effect: { damageScale: allCampus(0.75) },
  },
  {
    id: "elevate",
    role: "president",
    label: "Elevate campus buildings",
    cost: 2100000,
    description: "Raise campus first-floor thresholds by 1.2 m.",
    effect: { raise: allCampus(1.2) },
  },
  {
    id: "campusProtection",
    role: "president",
    label: "Build campus flood protection",
    cost: 1400000,
    description: "Permanent campus gates lower local water by 0.9 m.",
    effect: { reduction: 0.9 },
  },
  {
    id: "drainage",
    role: "president",
    label: "Upgrade campus drainage",
    cost: 900000,
    description: "Lower campus floodwater by 0.6 m.",
    effect: { reduction: 0.6 },
  },
  {
    id: "campusBackup",
    role: "president",
    label: "Install campus backup generators",
    cost: 650000,
    description:
      "Keep campus buildings powered if their direct damage remains below the failure threshold.",
    effect: { backup: CAMPUS_IDS },
  },
  {
    id: "campusEvac",
    role: "president",
    label: "Take campus emergency actions",
    cost: 350000,
    description:
      "Transport and early closure protect 55% of otherwise affected occupants.",
    effect: { evacFraction: 0.55 },
  },
  {
    id: "campusRepair",
    role: "president",
    label: "Fund post-event repairs",
    cost: 500000,
    description:
      "Accelerate recovery by 25%; repairs do not prevent the initial flood damage.",
    effect: { recoveryFactor: 0.75 },
  },
  {
    id: "wall",
    role: "mayor",
    label: "Build a river flood wall",
    cost: 2600000,
    description:
      "Reduce water by 1.2 m up to a 5.0 m river peak; overtopping retains only 0.2 m protection.",
    effect: {
      barrier: {
        height: 5.0,
        reduction: 1.2,
        failureReduction: 0.2,
        failure: "overtopping",
      },
    },
    exclusiveGroup: "riverDefense",
  },
  {
    id: "dike",
    role: "mayor",
    label: "Build a levee / dike",
    cost: 3000000,
    description:
      "Reduce water by 1.5 m up to a 4.6 m peak; a modeled breach removes its protection above that height.",
    effect: {
      barrier: {
        height: 4.6,
        reduction: 1.5,
        failureReduction: 0,
        failure: "breach",
      },
    },
    exclusiveGroup: "riverDefense",
  },
  {
    id: "riverRoom",
    role: "mayor",
    label: "Create room for the river",
    cost: 1200000,
    description:
      "Restore upstream floodplain; lower the local flood peak by 0.7 m.",
    effect: { reduction: 0.7 },
  },
  {
    id: "hardenHospital",
    role: "mayor",
    label: "Harden the hospital",
    cost: 900000,
    description: "Raise the health facility’s threshold by 1.0 m.",
    effect: { raise: { hospital: 1.0 } },
  },
  {
    id: "hospitalWing",
    role: "mayor",
    label: "Build an elevated hospital wing",
    cost: 1700000,
    description:
      "Model an elevated replacement care wing at the health-center site: +1.5 m threshold and protected backup power.",
    effect: { raise: { hospital: 1.5 }, backup: ["hospital"] },
    exclusiveGroup: "hospitalPlan",
  },
  {
    id: "shelters",
    role: "emergency",
    label: "Build flood shelters",
    cost: 400000,
    description:
      "Provide safe shelter for up to 600 affected occupants, after other protection.",
    effect: { shelterCapacity: 600 },
  },
  {
    id: "evacTraining",
    role: "emergency",
    label: "Run evacuation training",
    cost: 250000,
    description:
      "Early evacuation protects 40% of otherwise affected occupants.",
    effect: { evacFraction: 0.4 },
  },
  {
    id: "hospitalContinuity",
    role: "emergency",
    label: "Keep hospitals functional",
    cost: 450000,
    description:
      "Deploy protected generators and temporary flood-proofing (+0.6 m) for the health facility.",
    effect: { backup: ["hospital"], raise: { hospital: 0.6 } },
  },
  {
    id: "recoveryCrews",
    role: "emergency",
    label: "Dispatch recovery crews",
    cost: 300000,
    description: "Shorten modeled repair and service restoration time by 35%.",
    effect: { recoveryFactor: 0.65 },
  },
  {
    id: "vehicles",
    role: "emergency",
    label: "Source evacuation vehicles",
    cost: 280000,
    description:
      "Accessible buses and drivers protect another 20% of otherwise affected occupants.",
    effect: { evacFraction: 0.2 },
  },
  {
    id: "materials",
    role: "emergency",
    label: "Source emergency materials",
    cost: 220000,
    description:
      "Temporary seals add 0.3 m protection to low-lying dorms and classrooms.",
    effect: { raise: { "dorm-a": 0.3, "classroom-1": 0.3 } },
  },
  {
    id: "safeRoads",
    role: "emergency",
    label: "Elevate evacuation roads",
    cost: 1150000,
    description:
      "Raise routes by 0.8 m so evacuation access stays open longer.",
    effect: { elevateRoads: true },
  },
  {
    id: "substation",
    role: "utility",
    label: "Raise substations",
    cost: 650000,
    description:
      "Raise electrical gear by 1.8 m, reducing direct substation damage and downstream outages.",
    effect: { raise: { substation: 1.8 } },
  },
  {
    id: "hospitalPower",
    role: "utility",
    label: "Prioritize power to hospitals",
    cost: 400000,
    description:
      "Reserve protected mobile power and fuel for hospitals during grid outages.",
    effect: { backup: ["hospital"] },
  },
  {
    id: "campusPower",
    role: "utility",
    label: "Prioritize power to campus",
    cost: 600000,
    description:
      "Reserve protected mobile power for campus buildings during grid outages.",
    effect: { backup: CAMPUS_IDS },
  },
  {
    id: "restoreGrid",
    role: "utility",
    label: "Stage grid restoration crews",
    cost: 350000,
    description: "Shorten power and building recovery time by 40%.",
    effect: { recoveryFactor: 0.6 },
  },
  {
    id: "discount",
    role: "underwriter",
    label: "Offer discounts for mitigated properties",
    cost: 100000,
    description:
      "Offer a 15% discount to dorm policies after verified retrofits; participating dorms have 25% lower damage ratios.",
    effect: {
      damageScale: { "dorm-a": 0.75, "dorm-b": 0.75 },
      mitigationDiscount: 0.15,
    },
  },
];
export const UNDERWRITER_DEFAULTS = {
  rate: 0.008,
  deductible: 0.03,
  limit: 0.85,
  highRisk: "all" as "all" | "cap" | "decline",
};
export const HIGH_RISK_POLICY = {
  damageThreshold: 0.6,
  cappedLimit: 0.5,
  annualExpense: 250,
  affordabilityThreshold: 0.009,
};
