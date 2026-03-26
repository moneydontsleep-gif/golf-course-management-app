import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Brain,
  Flag,
  Plus,
  RefreshCw,
  ShieldCheck,
  Target,
  Trash2,
  Trophy,
  Wind,
  Map,
  Ruler,
} from "lucide-react";

type ShotType = "draw" | "fade" | "knockdownFade" | "stock" | "punch";
type ScenarioType = "tee" | "approach" | "layup" | "recovery" | "clubSelection";
type HazardSeverity = "low" | "medium" | "high";

type Club = {
  club: string;
  stock: number;
  draw: number;
  fade: number;
  knockdownFade: number;
  totalStock?: number;
  totalDraw?: number;
  totalFade?: number;
};

type Preferences = {
  preferredTeeShape: "fade" | "draw" | "stock";
  preferredApproachShape: "knockdownFade" | "fade" | "stock" | "draw";
  preferredLayupShape: "fade" | "stock" | "draw";
  allowDrawOffTee: boolean;
  strictMode: boolean;
  allowRecoveryFlexibility: boolean;
  notes: string;
};

type Scenario = {
  mode: "strict" | "recovery";
  type: ScenarioType;
  category: string;
  title: string;
  prompt: string;
  targetLabel: string;
  adjustedYardageLabel: string;
  recommendation: string;
  correctClub: string;
  correctShot: ShotType;
  explanation: string;
  whyRisky?: string;
  windDir: string;
  windMph: number;
  holeYardage: number;
  par: number;
  targetYardage: number | null;
  distanceContext: string;
};

type Feedback = {
  clubCorrect: boolean;
  shotCorrect: boolean;
  isCorrect: boolean;
  missLabel?: string;
  wrongReason?: string;
};

const defaultClubs: Club[] = [
  {
    club: "Driver",
    stock: 275,
    draw: 283,
    fade: 270,
    knockdownFade: 255,
    totalStock: 285,
    totalDraw: 292,
    totalFade: 280,
  },
  {
    club: "3 Wood",
    stock: 230,
    draw: 238,
    fade: 225,
    knockdownFade: 215,
    totalStock: 245,
    totalDraw: 250,
    totalFade: 240,
  },
  { club: "5 Wood", stock: 210, draw: 220, fade: 205, knockdownFade: 195 },
  { club: "4 Hybrid", stock: 203, draw: 210, fade: 198, knockdownFade: 190 },
  { club: "5 Iron", stock: 190, draw: 195, fade: 190, knockdownFade: 185 },
  { club: "6 Iron", stock: 180, draw: 185, fade: 178, knockdownFade: 170 },
  { club: "7 Iron", stock: 170, draw: 175, fade: 165, knockdownFade: 160 },
  { club: "8 Iron", stock: 160, draw: 165, fade: 155, knockdownFade: 150 },
  { club: "9 Iron", stock: 150, draw: 155, fade: 145, knockdownFade: 140 },
  { club: "PW", stock: 140, draw: 145, fade: 135, knockdownFade: 130 },
  { club: "GW", stock: 125, draw: 125, fade: 125, knockdownFade: 120 },
  { club: "SW", stock: 100, draw: 100, fade: 100, knockdownFade: 95 },
  { club: "LW", stock: 90, draw: 90, fade: 90, knockdownFade: 85 },
];

const defaultPreferences: Preferences = {
  preferredTeeShape: "fade",
  preferredApproachShape: "knockdownFade",
  preferredLayupShape: "fade",
  allowDrawOffTee: true,
  strictMode: true,
  allowRecoveryFlexibility: true,
  notes:
    "Default philosophy: target first, then adjusted yardage, then shot shape, then club. Use miss-based strategy into greens.",
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function randomFrom<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function windAdjustmentYards(distance: number, windDir: string, mph: number) {
  const factor = distance / 100;
  if (windDir === "head") return Math.round(mph * 0.9 * factor);
  if (windDir === "tail") return Math.round(mph * -0.6 * factor);
  return 0;
}

function windTeachingText(windDir: string, adjusted: number, original: number) {
  if (windDir === "head") {
    return `Headwind adds effective yardage. The ball flies shorter, so the shot plays more like ${adjusted} instead of ${original}.`;
  }
  if (windDir === "tail") {
    return `Tailwind helps the ball travel farther. That means the shot plays shorter, so the adjusted yardage becomes about ${adjusted} instead of ${original}.`;
  }
  if (windDir === "leftToRight") {
    return `Left-to-right wind mostly changes drift and start line. The carry number stays closer to ${adjusted}, but the target and shape matter more.`;
  }
  if (windDir === "rightToLeft") {
    return `Right-to-left wind mostly changes drift and curve. The carry number stays closer to ${adjusted}, but the target and shape matter more.`;
  }
  return `With calm conditions, the shot plays close to the base number of ${original}.`;
}

function windLabel(windDir: string, windMph: number) {
  if (windDir === "calm") return "Calm";
  if (windDir === "head") return `Headwind ${windMph} mph`;
  if (windDir === "tail") return `Tailwind ${windMph} mph`;
  if (windDir === "leftToRight") return `Left-to-right ${windMph} mph`;
  return `Right-to-left ${windMph} mph`;
}

function getClubValueForShot(club: Club, shot: ShotType) {
  if (shot === "punch") {
    return Math.round(club.stock * 0.65);
  }
  if (shot === "draw") return club.draw;
  if (shot === "fade") return club.fade;
  if (shot === "knockdownFade") return club.knockdownFade;
  return club.stock;
}

function getClubTotal(club: Club, shot: Exclude<ShotType, "punch">) {
  if (shot === "draw") return club.totalDraw ?? club.totalStock ?? club.draw + 7;
  if (shot === "fade") return club.totalFade ?? club.totalStock ?? club.fade + 10;
  return club.totalStock ?? club.stock + 10;
}

function bestClubForDistance(clubs: Club[], target: number, shotType: ShotType, options?: { punchOnly?: boolean; excludeWoods?: boolean }) {
  let pool = clubs;
  if (options?.punchOnly) {
    pool = clubs.filter((club) => ["5 Iron", "6 Iron", "7 Iron", "8 Iron"].includes(club.club));
  } else if (options?.excludeWoods) {
    pool = clubs.filter((club) => !["Driver", "3 Wood", "5 Wood"].includes(club.club));
  }
  let best = pool[0];
  let diff = Infinity;
  for (const club of pool) {
    const selected = getClubValueForShot(club, shotType);
    const d = Math.abs(selected - target);
    if (d < diff) {
      best = club;
      diff = d;

function pickBestClubForYardage(clubs: Club[], yardage: number, preferredShot: ShotType) {
  let best = clubs[0];
  let smallestDiff = Infinity;

  for (const club of clubs) {
    const carry = getClubValueForShot(club, preferredShot);
    const diff = Math.abs(carry - yardage);

    if (diff < smallestDiff) {
      smallestDiff = diff;
      best = club;
    }
  }

  return best;
}

function getRiskLineText(kind: string, start: number, width: number, severity: HazardSeverity) {
  if (kind === "water") return `Water starts at about ${start} carry and becomes a high-penalty miss.`;
  if (kind === "bunkers") return `Fairway bunkers begin around ${start} and squeeze the landing area to about ${width} yards.`;
  if (kind === "rough") return `The fairway narrows to about ${width} yards near ${start}, with thick rough waiting on the miss side.`;
  return `The landing zone pinches down around ${start}, leaving only about ${width} yards of real fairway. Severity: ${severity}.`;
}

function buildTeeScenario(clubs: Club[], preferences: Preferences, windDir: string, windMph: number): Scenario {
  const holeYardage = randomFrom([392, 405, 418, 428, 438, 452]);
  const par = holeYardage >= 445 ? 5 : 4;
  const fairwaySide = randomFrom(["left", "right", "center"] as const);
  const hazardKind = randomFrom(["water", "bunkers", "rough", "pinch"] as const);
  const severity = randomFrom(["low", "medium", "high"] as const);
  const hazardStart = randomFrom([258, 264, 270, 276]);
  const fairwayWidth = randomFrom([18, 22, 26, 30]);

  const driver = clubs.find((c) => c.club === "Driver") || clubs[0];
  const preferredDriverShot: Exclude<ShotType, "knockdownFade" | "punch"> = fairwaySide === "left"
    ? "fade"
    : fairwaySide === "right" && preferences.allowDrawOffTee
    ? "draw"
    : preferences.preferredTeeShape === "stock"
    ? "stock"
    : preferences.preferredTeeShape;

  const driverCarry = getClubValueForShot(driver, preferredDriverShot);
  const driverTotal = getClubTotal(driver, preferredDriverShot === "stock" ? "stock" : preferredDriverShot);
  const layupClub = bestClubForDistance(clubs.filter((c) => !["Driver"].includes(c.club)), hazardStart - 18, preferences.preferredLayupShape);
  const layupCarry = getClubValueForShot(layupClub, preferences.preferredLayupShape);
  
  const remainingIfLayup = holeYardage - layupCarry;

  const severePenalty = severity === "high" || hazardKind === "water";
  const crosswindPenalty = (windDir === "leftToRight" || windDir === "rightToLeft") && windMph >= 12 && fairwayWidth <= 22;
  const actualRunThroughRisk = driverTotal >= hazardStart - 2;
  const actualCarryIntoRisk = driverCarry >= hazardStart && severePenalty;
  const leaveTooLong = remainingIfLayup > 195;
  const driverStillPlayable = !actualCarryIntoRisk && !(crosswindPenalty && severePenalty);

  let correctClub = driver.club;
  let correctShot: ShotType = preferredDriverShot;
  let targetLabel = fairwaySide === "left" ? "Left-center fairway shelf" : fairwaySide === "right" ? "Right-center fairway shelf" : "Center fairway landing window";
  let whyRisky = getRiskLineText(hazardKind, hazardStart, fairwayWidth, severity);
  const reasoning: string[] = [];

  if ((actualRunThroughRisk || actualCarryIntoRisk || crosswindPenalty) && (!leaveTooLong || !driverStillPlayable)) {
    correctClub = layupClub.club;
    correctShot = preferences.preferredLayupShape;
    targetLabel = "Safe fairway section short of the hazard line";
    reasoning.push("The primary goal is staying short of the actual trouble line with a full fairway target.");
    reasoning.push("This is one of the few cases where the penalty for using driver is real enough to justify sacrificing distance.");
  } else {
    reasoning.push("The target should be chosen first, then the yardage window, then the shot, then the club.");
    reasoning.push("Even though there is some risk, laying too far back would create a worse scoring position on the next shot.");
  }

  const prompt = `Hole: Par ${par}, ${holeYardage} yards. Target: ${targetLabel}. Wind: ${windLabel(windDir, windMph)}. Fairway favors the ${fairwaySide}. Risk line: ${whyRisky} Driver ${preferredDriverShot} carries about ${driverCarry} and finishes around ${driverTotal}. A ${layupClub.club} ${preferences.preferredLayupShape} carries about ${layupCarry}. What is the best play?`;

  return {
    mode: "strict",
    type: "tee",
    category: "Tee Shot",
    title: "Tee Shot Decision",
    prompt,
    targetLabel,
    adjustedYardageLabel: correctClub === driver.club ? `Landing window starts around ${hazardStart}` : `Stay short of ${hazardStart}`,
    recommendation: `${correctShot === preferences.preferredLayupShape && correctClub !== driver.club ? "Play" : "Hit"} a ${correctShot} with ${correctClub}`,
    correctClub,
    correctShot,
    explanation: reasoning.join(" "),
    whyRisky,
    windDir,
    windMph,
    holeYardage,
    par,
    targetYardage: correctClub === driver.club ? driverCarry : layupCarry,
    distanceContext: `Par ${par} • ${holeYardage} yards`,
  };
}

function buildApproachScenario(clubs: Club[], preferences: Preferences, windDir: string, windMph: number): Scenario {
  const base = randomFrom([118, 126, 134, 142, 151, 158, 166, 174, 182]);
  const holeYardage = randomFrom([360, 372, 388, 401, 417]);
  const par = 4;
  const pinLocation = randomFrom(["front", "middle", "back"] as const);
  const greenFirmness = randomFrom(["soft", "average", "firm"] as const);
  const danger = randomFrom(["water short", "left bunker", "long is dead", "short false front", "back rough"] as const);
  let targetLabel = "Middle of green";
  let targetAdjustment = 0;

  if (danger === "water short" || danger === "short false front") {
    targetLabel = pinLocation === "front" ? "Front-middle safety number" : "Middle of green";
    targetAdjustment = 4;
  } else if (danger === "long is dead") {
    targetLabel = pinLocation === "back" ? "Middle number, stay under the hole" : "Middle of green";
    targetAdjustment = -4;
  } else if (pinLocation === "back") {
    targetLabel = "Back-middle number";
    targetAdjustment = 3;
  } else if (pinLocation === "front") {
    targetLabel = "Front-middle number";
    targetAdjustment = -2;
  }

  if (greenFirmness === "firm") targetAdjustment -= 2;
  if (greenFirmness === "soft") targetAdjustment += 1;

  const adjusted = clamp(base + targetAdjustment + windAdjustmentYards(base, windDir, windMph), 70, 210);
  const shot = preferences.preferredApproachShape as ShotType;
  const correctClub = pickBestClubForYardage(
  clubs.filter((c) => !["Driver", "3 Wood", "5 Wood"].includes(c.club)),
  adjusted,
  shot
);
  const prompt = `Hole: Par ${par}, ${holeYardage} yards. Target: ${targetLabel}. Raw carry to the flag is ${base}. Wind: ${windLabel(windDir, windMph)}. Pin: ${pinLocation}. Green firmness: ${greenFirmness}. Main danger: ${danger}. Using miss-based strategy, what is the best play?`;

  return {
    mode: "strict",
    type: "approach",
    category: "Approach Shot",
    title: "Approach Decision",
    prompt,
    targetLabel,
    adjustedYardageLabel: `Adjusted yardage: ${adjusted}`,
    recommendation: `Hit a ${shot} with ${correctClub.club}`,
    correctClub: correctClub.club,
    correctShot: shot,
    explanation: `The decision starts with the safest scoring target, not the flag by itself. Once the target is chosen, the yardage is adjusted for wind, firmness, and danger. Then the shot shape is chosen, and then the club. ${windTeachingText(windDir, adjusted, base)}`,
    windDir,
    windMph,
    holeYardage,
    par,
    targetYardage: adjusted,
    distanceContext: `Par ${par} • ${holeYardage} yards`,
  };
}

function buildClubSelectionScenario(clubs: Club[], preferences: Preferences, windDir: string, windMph: number): Scenario {
  const carryNumber = randomFrom([92, 101, 109, 117, 126, 134, 143, 151, 159, 168, 176]);
  const holeYardage = randomFrom([364, 378, 392, 408, 426]);
  const par = 4;
  const pinLocation = randomFrom(["front", "middle", "back"] as const);
  const greenFirmness = randomFrom(["soft", "average", "firm"] as const);
  const danger = randomFrom(["short bunker", "water short", "long is dead", "back rough", "front false edge"] as const);
  let targetLabel = "Center-green scoring number";
  let targetAdjustment = 0;

  if (danger === "water short" || danger === "front false edge") targetAdjustment += 4;
  if (danger === "long is dead") targetAdjustment -= 4;
  if (pinLocation === "back") targetAdjustment += 2;
  if (pinLocation === "front") targetAdjustment -= 2;
  if (greenFirmness === "firm") targetAdjustment -= 2;

  const adjusted = clamp(carryNumber + targetAdjustment + windAdjustmentYards(carryNumber, windDir, windMph), 65, 205);
  const shot = preferences.preferredApproachShape as ShotType;
  const club = pickBestClubForYardage(
  clubs.filter((c) => !["Driver", "3 Wood", "5 Wood"].includes(c.club)),
  adjusted,
  shot
);

  return {
    mode: "strict",
    type: "clubSelection",
    category: "Club Selection Trainer",
    title: "Club Selection Trainer",
    prompt: `Hole: Par ${par}, ${holeYardage} yards. Target: ${targetLabel}. Carry to the original number is ${carryNumber}. Wind: ${windLabel(windDir, windMph)}. Pin: ${pinLocation}. Green firmness: ${greenFirmness}. Main danger: ${danger}. What is the best play?`,
    targetLabel,
    adjustedYardageLabel: `Adjusted yardage: ${adjusted}`,
    recommendation: `Hit a ${shot} with ${club.club}`,
    correctClub: club.club,
    correctShot: shot,
    explanation: `This mode is built specifically to punish short and long club mistakes. The correct answer comes from target first, adjusted yardage second, shot third, and club last. ${windTeachingText(windDir, adjusted, carryNumber)}`,
    windDir,
    windMph,
    holeYardage,
    par,
    targetYardage: adjusted,
    distanceContext: `Club Choice • Par ${par} • ${holeYardage} yards`,
  };
}

function buildRecoveryScenario(clubs: Club[], windDir: string, windMph: number): Scenario {
  const holeYardage = randomFrom([398, 412, 428, 446]);
  const par = holeYardage >= 445 ? 5 : 4;
  const remaining = randomFrom([148, 162, 176, 188, 202]);
  const lie = randomFrom(["under tree limbs", "clean but blocked", "rough with no full release"] as const);
  const opening = randomFrom(["low punch lane", "small window back to fairway", "half-window to safe angle"] as const);
  const safeLeave = randomFrom([80, 90, 100, 110]);
  const targetAdvance = Math.max(remaining - safeLeave, 45);
  const correctShot: ShotType = "punch";
  const correctClub = bestClubForDistance(clubs, targetAdvance, "punch", { punchOnly: true });
  const targetLabel = `Advance the ball low to leave about ${safeLeave}`;

  return {
    mode: "recovery",
    type: "recovery",
    category: "Scramble / Recovery",
    title: "Recovery Decision",
    prompt: `Hole: Par ${par}, ${holeYardage} yards. Target: ${targetLabel}. You have ${remaining} left. Lie: ${lie}. Escape window: ${opening}. Wind: ${windLabel(windDir, windMph)}. What is the best play?`,
    targetLabel,
    adjustedYardageLabel: `Advance about ${targetAdvance}`,
    recommendation: `Play a punch with ${correctClub.club}`,
    correctClub: correctClub.club,
    correctShot,
    explanation: `Recovery mode allows flexibility, but only within disciplined boundaries. A punch shot should use a lower-lofted club that launches low and advances predictably.`,
    windDir,
    windMph,
    holeYardage,
    par,
    targetYardage: targetAdvance,
    distanceContext: `Recovery • Par ${par} • ${holeYardage} yards`,
  };
}

function buildLayupScenario(clubs: Club[], preferences: Preferences, windDir: string, windMph: number): Scenario {
  const holeYardage = randomFrom([500, 518, 532, 548, 562]);
  const par = 5;
  const favoriteWedge = randomFrom([80, 90, 100, 110]);
  const distanceLeft = randomFrom([228, 242, 256, 268]);
  const effective = distanceLeft + windAdjustmentYards(distanceLeft, windDir, windMph);
  const targetAdvance = Math.max(effective - favoriteWedge, 60);
  const shot = preferences.preferredLayupShape as ShotType;
  const club = bestClubForDistance(clubs, targetAdvance, shot);
function pickBestClubForYardage(clubs: Club[], yardage: number, preferredShot: ShotType) {
  let best = clubs[0];
  let smallestDiff = Infinity;

  for (const club of clubs) {
    const carry = getClubValueForShot(club, preferredShot);
    const diff = Math.abs(carry - yardage);

    if (diff < smallestDiff) {
      smallestDiff = diff;
      best = club;
    }
  }

  return best;
}
  return {
    mode: "strict",
    type: "layup",
    category: "Layup Decision",
    title: "Par-5 Position Play",
    prompt: `Hole: Par ${par}, ${holeYardage} yards. Target: favorite wedge number of ${favoriteWedge}. You have ${distanceLeft} left. Wind: ${windLabel(windDir, windMph)}. The green is not worth forcing. What is the best play?`,
    targetLabel: `Leave ${favoriteWedge} yards`,
    adjustedYardageLabel: `Advance about ${targetAdvance}`,
    recommendation: `Hit a ${shot} with ${club.club}`,
    correctClub: club.club,
    correctShot: shot,
    explanation: `This is a target-first layup. The objective is not maximum distance. The objective is the preferred wedge number.`,
    windDir,
    windMph,
    holeYardage,
    par,
    targetYardage: targetAdvance,
    distanceContext: `Par ${par} • ${holeYardage} yards`,
  };
}

function generateScenario(clubs: Club[], preferences: Preferences): Scenario {
  const windOptions = ["calm", "head", "tail", "leftToRight", "rightToLeft"] as const;
  const windDir = randomFrom(windOptions);
  const windMph = windDir === "calm" ? 0 : randomFrom([5, 8, 10, 12, 15, 18, 20]);
  const type = randomFrom(["tee", "approach", "layup", "recovery", "clubSelection"] as const);

  if (type === "tee") return buildTeeScenario(clubs, preferences, windDir, windMph);
  if (type === "approach") return buildApproachScenario(clubs, preferences, windDir, windMph);
  if (type === "layup") return buildLayupScenario(clubs, preferences, windDir, windMph);
  if (type === "clubSelection") return buildClubSelectionScenario(clubs, preferences, windDir, windMph);
  return buildRecoveryScenario(clubs, windDir, windMph);
}

function runSanityChecks() {
  const results = Array.from({ length: 12 }, () => generateScenario(defaultClubs, defaultPreferences));
  return [
    { name: "Generates scenarios without crashing", pass: results.length === 12 },
    { name: "Every scenario has a target label", pass: results.every((s) => !!s.targetLabel) },
    { name: "Every scenario has a recommendation", pass: results.every((s) => !!s.recommendation) },
    { name: "Recovery uses punch only", pass: results.filter((s) => s.type === "recovery").every((s) => s.correctShot === "punch") },
  ];
}

const sanityChecks = runSanityChecks();

function loadLocal<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const saved = window.localStorage.getItem(key);
    return saved ? (JSON.parse(saved) as T) : fallback;
  } catch {
    return fallback;
  }
}

export default function GolfCourseManagementQuizApp() {
  const [clubs, setClubs] = useState<Club[]>(() => loadLocal("golf-app-clubs", defaultClubs));
  const [preferences, setPreferences] = useState<Preferences>(() => loadLocal("golf-app-preferences", defaultPreferences));
  const [scenario, setScenario] = useState<Scenario>(() => generateScenario(defaultClubs, defaultPreferences));
  const [answerShot, setAnswerShot] = useState<ShotType | "">("");
  const [answerClub, setAnswerClub] = useState("");
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [score, setScore] = useState<{ correct: number; total: number }>(() => loadLocal("golf-app-score", { correct: 0, total: 0 }));
  const [tab, setTab] = useState("quiz");

  const clubNames = useMemo(() => clubs.map((c) => c.club), [clubs]);
  const pct = score.total ? Math.round((score.correct / score.total) * 100) : 0;

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("golf-app-clubs", JSON.stringify(clubs));
      window.localStorage.setItem("golf-app-preferences", JSON.stringify(preferences));
      window.localStorage.setItem("golf-app-score", JSON.stringify(score));
    }
  }, [clubs, preferences, score]);

  function updateClub(index: number, field: keyof Club, value: string) {
    setClubs((prev) => {
      const next = [...prev];
      next[index] = {
        ...next[index],
        [field]: field === "club" ? value : Number(value || 0),
      } as Club;
      return next;
    });
  }

  function addClub() {
    setClubs((prev) => [...prev, { club: `New Club ${prev.length + 1}`, stock: 0, draw: 0, fade: 0, knockdownFade: 0 }]);
  }

  function removeClub(index: number) {
    setClubs((prev) => prev.filter((_, i) => i !== index));
  }

  function newScenario() {
    setScenario(generateScenario(clubs, preferences));
    setAnswerShot("");
    setAnswerClub("");
    setFeedback(null);
  }

  function submitAnswer() {
    const clubCorrect = answerClub === scenario.correctClub;
    const shotCorrect = answerShot === scenario.correctShot;
    const isCorrect = clubCorrect && shotCorrect;
    setScore((prev) => ({ correct: prev.correct + (isCorrect ? 1 : 0), total: prev.total + 1 }));

    const selectedClub = clubs.find((c) => c.club === answerClub);
    let missLabel = "";
    let wrongReason = "";

    if (!isCorrect && selectedClub) {
      const selectedYards = answerShot ? getClubValueForShot(selectedClub, answerShot) : selectedClub.stock;
      const target = scenario.targetYardage ?? selectedYards;
      const delta = selectedYards - target;

      if (scenario.type === "clubSelection" || scenario.type === "approach") {
        if (delta <= -8) {
          missLabel = "Too Short";
          wrongReason = "This choice likely leaves the ball short of the scoring target after wind and danger are accounted for.";
        } else if (delta >= 8) {
          missLabel = "Too Long";
          wrongReason = "This choice likely brings long trouble or leaves a worse result than the target-first plan.";
        } else if (!shotCorrect) {
          missLabel = "Wrong Shot Shape";
          wrongReason = "The yardage may be close, but the selected shot shape does not fit the target and miss pattern.";
        } else {
          missLabel = "Wrong Club";
          wrongReason = "The selected club does not fit the adjusted target as well as the recommended club.";
        }
      } else if (scenario.type === "recovery") {
        missLabel = "Poor Recovery Club";
        wrongReason = "A punch should come from a lower-lofted iron that launches low and advances predictably. High-loft clubs are not correct here.";
      } else if (!clubCorrect) {
        missLabel = "Wrong Club";
        wrongReason = "The selected club does not fit the target-first plan as well as the recommended club.";
      } else if (!shotCorrect) {
        missLabel = "Wrong Shot Shape";
        wrongReason = "The selected shot shape does not match the safest or highest-percentage decision.";
      }
    }

    setFeedback({ clubCorrect, shotCorrect, isCorrect, missLabel, wrongReason });
  }

  return (
    <div style={{ minHeight: "100vh", background: "#f3f5f7", padding: 16, fontFamily: "Arial, sans-serif", color: "#10233f" }}>
      <style>{`
        * { box-sizing: border-box; }
        .container { max-width: 1280px; margin: 0 auto; }
        .hero, .card { background: white; border-radius: 20px; box-shadow: 0 2px 10px rgba(15, 35, 63, 0.08); border: 1px solid #dde5ee; }
        .hero { background: linear-gradient(135deg, #10233f, #344a68); color: white; }
        .grid-top { display: grid; grid-template-columns: 1.3fr 0.7fr; gap: 16px; }
        .grid-main { display: grid; grid-template-columns: 1.1fr 0.9fr; gap: 24px; }
        .tab-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; background: white; padding: 8px; border-radius: 18px; border: 1px solid #dde5ee; }
        .tab-btn { border: 0; background: transparent; padding: 12px; border-radius: 12px; cursor: pointer; font-weight: 700; color: #334e68; }
        .tab-btn.active { background: #10233f; color: white; }
        .pill { display: inline-block; padding: 8px 12px; border-radius: 999px; background: #e8edf3; font-size: 12px; font-weight: 700; }
        .field, select, textarea { width: 100%; padding: 12px 14px; border-radius: 12px; border: 1px solid #c7d3df; font-size: 14px; background: white; }
        textarea { min-height: 120px; resize: vertical; }
        .btn { border: 0; border-radius: 14px; padding: 12px 18px; font-weight: 700; cursor: pointer; }
        .btn-primary { background: #10233f; color: white; }
        .btn-secondary { background: #eef3f8; color: #10233f; }
        .badge { background: #eef3f8; border-radius: 999px; padding: 8px 12px; font-size: 12px; font-weight: 700; }
        .muted { color: #56708b; }
        .soft { background: #eef3f8; border-radius: 16px; padding: 14px; }
        .success { background: #e7f5ee; color: #135a3d; }
        .warn { background: #fff3df; color: #7a4d00; }
        .score-grid, .feedback-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .answer-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
        .bag-header, .bag-row { display: grid; grid-template-columns: 1.2fr 1fr 1fr 1fr 1fr auto; gap: 12px; align-items: center; }
        .bag-header { font-size: 12px; font-weight: 700; text-transform: uppercase; color: #6b8198; }
        .stack { display: grid; gap: 16px; }
        .icon-btn { border: 0; background: #eef3f8; border-radius: 12px; width: 42px; height: 42px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; }
        .progress-wrap { height: 12px; border-radius: 999px; background: #e2e8f0; overflow: hidden; }
        .progress-bar { height: 100%; background: #10233f; }
        .pill-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        ul { margin: 0; padding-left: 20px; }
        @media (max-width: 900px) {
          .grid-top, .grid-main, .answer-grid, .score-grid, .feedback-grid, .pill-grid { grid-template-columns: 1fr; }
          .tab-row { grid-template-columns: 1fr 1fr; }
          .bag-header { display: none; }
          .bag-row { grid-template-columns: 1fr; }
          .btn-mobile { width: 100%; }
        }
      `}</style>

      <div className="container" style={{ display: "grid", gap: 24 }}>
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="grid-top">
          <div className="hero" style={{ padding: 24 }}>
            <div style={{ fontSize: 12, color: "#dce7f3", marginBottom: 12 }}>Mobile-friendly and ready to save to home screen after deployment.</div>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
              <div>
                <div className="pill" style={{ background: "rgba(255,255,255,0.15)", color: "white", marginBottom: 12 }}>Golf IQ Trainer</div>
                <h1 style={{ margin: 0, fontSize: 36 }}>Course Management Q&amp;A App</h1>
                <p style={{ maxWidth: 760, lineHeight: 1.7, color: "#dce7f3" }}>
                  Build disciplined decision-making around the correct order: target, adjusted yardage, shot shape, then club.
                </p>
              </div>
              <Target size={40} />
            </div>
          </div>

          <div className="card" style={{ padding: 24 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 24, fontWeight: 700, marginBottom: 6 }}><Trophy size={20} /> Scoreboard</div>
            <div className="muted" style={{ marginBottom: 16 }}>Strict scoring based on the highest-percentage target-first decision</div>
            <div className="score-grid">
              <div className="soft"><div className="muted" style={{ fontSize: 12 }}>Correct</div><div style={{ fontSize: 30, fontWeight: 700 }}>{score.correct}</div></div>
              <div className="soft"><div className="muted" style={{ fontSize: 12 }}>Total</div><div style={{ fontSize: 30, fontWeight: 700 }}>{score.total}</div></div>
            </div>
            <div style={{ marginTop: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}><span>Accuracy</span><strong>{pct}%</strong></div>
              <div className="progress-wrap"><div className="progress-bar" style={{ width: `${pct}%` }} /></div>
            </div>
            <div className="soft" style={{ marginTop: 16 }}>The app now starts with target and adjusted number first, so the logic matches real tournament golf more closely.</div>
          </div>
        </motion.div>

        <div className="tab-row">
          {[
            ["quiz", "Quiz Mode"],
            ["bag", "Bag Setup"],
            ["philosophy", "Strategy Rules"],
            ["recovery", "Recovery Mode"],
          ].map(([value, label]) => (
            <button key={value} className={`tab-btn ${tab === value ? "active" : ""}`} onClick={() => setTab(value)}>{label}</button>
          ))}
        </div>

        {tab === "quiz" && (
          <div className="grid-main">
            <div className="stack">
              <div className="card" style={{ padding: 24 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                  <div>
                    <div style={{ fontSize: 32 / 1.6, fontWeight: 700 }}>{scenario.title}</div>
                    <div className="muted">{scenario.category}</div>
                  </div>
                  <div className="badge">{scenario.distanceContext}</div>
                </div>
                <div className="pill-grid" style={{ marginTop: 18 }}>
                  <div className="soft"><div className="muted" style={{ marginBottom: 6, display: "flex", alignItems: "center", gap: 8 }}><Map size={16} /> Target</div><strong>{scenario.targetLabel}</strong></div>
                  <div className="soft"><div className="muted" style={{ marginBottom: 6, display: "flex", alignItems: "center", gap: 8 }}><Ruler size={16} /> Adjusted Yardage</div><strong>{scenario.adjustedYardageLabel}</strong></div>
                </div>
                <p style={{ lineHeight: 1.7, marginTop: 18 }}>{scenario.prompt}</p>
                {scenario.whyRisky ? <div className="soft" style={{ marginTop: 12 }}><strong>Why the landing zone is risky:</strong> {scenario.whyRisky}</div> : null}
              </div>

              <div className="card" style={{ padding: 24 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 24, fontWeight: 700, marginBottom: 6 }}><Brain size={20} /> Your Answer</div>
                <div className="muted" style={{ marginBottom: 18 }}>Answer in the same order the app thinks: target, yardage, shot, then club.</div>
                <div className="answer-grid">
                  <div>
                    <label style={{ display: "block", fontWeight: 700, marginBottom: 8 }}>Shot Shape</label>
                    <select className="field" value={answerShot} onChange={(e) => setAnswerShot(e.target.value as ShotType | "") }>
                      <option value="">Select a shot shape</option>
                      <option value="draw">Draw</option>
                      <option value="fade">Fade</option>
                      <option value="knockdownFade">Knockdown Fade</option>
                      <option value="stock">Stock</option>
                      <option value="punch">Punch</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ display: "block", fontWeight: 700, marginBottom: 8 }}>Club</label>
                    <select className="field" value={answerClub} onChange={(e) => setAnswerClub(e.target.value)}>
                      <option value="">Select a club</option>
                      {clubNames.map((club) => <option key={club} value={club}>{club}</option>)}
                    </select>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 18 }}>
                  <button className="btn btn-primary btn-mobile" onClick={submitAnswer}>Submit Answer</button>
                  <button className="btn btn-secondary btn-mobile" onClick={newScenario} style={{ display: "inline-flex", alignItems: "center", gap: 8 }}><RefreshCw size={16} /> New Scenario</button>
                </div>
              </div>
            </div>

            <div className="stack">
              <div className="card" style={{ padding: 24 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 24, fontWeight: 700, marginBottom: 6 }}><Wind size={20} /> Instant Feedback</div>
                <div className="muted" style={{ marginBottom: 18 }}>Strictly grade whether the decision matched the intended strategy</div>
                {!feedback ? (
                  <div className="soft">Submit an answer to reveal the recommended decision and explanation.</div>
                ) : (
                  <div className="stack">
                    <div className={`soft ${feedback.isCorrect ? "success" : "warn"}`}>
                      <div style={{ fontWeight: 700, marginBottom: 8 }}>{feedback.isCorrect ? "Correct decision" : "Review the decision"}</div>
                      Recommended play: <strong>{scenario.recommendation}</strong>
                    </div>
                    <div className="feedback-grid">
                      <div className={`soft ${feedback.shotCorrect ? "success" : ""}`}><div className="muted">Shot</div><strong>{feedback.shotCorrect ? "Correct" : `Best: ${scenario.correctShot}`}</strong></div>
                      <div className={`soft ${feedback.clubCorrect ? "success" : ""}`}><div className="muted">Club</div><strong>{feedback.clubCorrect ? "Correct" : `Best: ${scenario.correctClub}`}</strong></div>
                    </div>
                    {!feedback.isCorrect && feedback.missLabel ? (
                      <div className="soft warn">
                        <div style={{ fontWeight: 700, marginBottom: 8 }}>Why your answer loses strokes: {feedback.missLabel}</div>
                        {feedback.wrongReason}
                      </div>
                    ) : null}
                    <div className="soft">{scenario.explanation}</div>
                  </div>
                )}
              </div>

              <div className="card" style={{ padding: 24 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 24, fontWeight: 700, marginBottom: 6 }}><ShieldCheck size={20} /> Built-In Decision Logic</div>
                <div className="stack">
                  <div className="soft">1. Choose the target first.</div>
                  <div className="soft">2. Adjust the yardage for wind, firmness, and danger.</div>
                  <div className="soft">3. Tailwind makes the ball go farther, so the shot plays shorter and usually needs less club.</div>
                  <div className="soft">4. Headwind makes the ball fly shorter, so the shot plays longer and usually needs more club.</div>
                  <div className="soft">5. Choose the shot shape that best fits the target and miss pattern, then choose the club last.</div>
                  <div className="soft">6. Punch shots use lower-lofted irons, not wedges.</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {tab === "bag" && (
          <div className="card" style={{ padding: 24 }}>
            <div style={{ fontSize: 24, fontWeight: 700, marginBottom: 6 }}>Customize Club Distances</div>
            <div className="muted" style={{ marginBottom: 18 }}>Enter carry numbers for stock, draw, fade, and knockdown fade</div>
            <div className="bag-header" style={{ marginBottom: 12 }}>
              <div>Club</div><div>Stock</div><div>Draw</div><div>Fade</div><div>Knockdown Fade</div><div></div>
            </div>
            <div className="stack">
              {clubs.map((club, index) => (
                <div key={`${club.club}-${index}`} className="bag-row soft">
                  <input className="field" value={club.club} onChange={(e) => updateClub(index, "club", e.target.value)} />
                  <input className="field" type="number" value={club.stock} onChange={(e) => updateClub(index, "stock", e.target.value)} />
                  <input className="field" type="number" value={club.draw} onChange={(e) => updateClub(index, "draw", e.target.value)} />
                  <input className="field" type="number" value={club.fade} onChange={(e) => updateClub(index, "fade", e.target.value)} />
                  <input className="field" type="number" value={club.knockdownFade} onChange={(e) => updateClub(index, "knockdownFade", e.target.value)} />
                  <button className="icon-btn" onClick={() => removeClub(index)} aria-label={`Remove ${club.club}`}><Trash2 size={16} /></button>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 16 }}>
              <button className="btn btn-secondary btn-mobile" onClick={addClub} style={{ display: "inline-flex", alignItems: "center", gap: 8 }}><Plus size={16} /> Add Club</button>
            </div>
          </div>
        )}

        {tab === "recovery" && (
          <div className="grid-main">
            <div className="card" style={{ padding: 24 }}>
              <div style={{ fontSize: 24, fontWeight: 700, marginBottom: 6 }}>Scramble / Recovery Mode</div>
              <div className="muted" style={{ marginBottom: 18 }}>Recovery logic now forces low-trajectory punch clubs and specific recovery targets</div>
              <div className="stack">
                <div className="soft">Use 5 iron through 8 iron for punch answers. Wedges are intentionally removed from correct punch logic.</div>
                <div className="soft">Recovery still allows flexibility, but only after the correct recovery target is chosen first.</div>
              </div>
            </div>

            <div className="card" style={{ padding: 24 }}>
              <div style={{ fontSize: 24, fontWeight: 700, marginBottom: 6 }}>Why the changes matter</div>
              <div className="muted" style={{ marginBottom: 18 }}>These updates fix the golf logic issues you pointed out</div>
              <div className="stack">
                <div className="soft">No more title and wind contradictions.</div>
                <div className="soft">No more high-lofted wedge punch answers.</div>
                <div className="soft">No more vague “risky” fairway lines without specifics.</div>
                <div className="soft">No more automatic layups that create terrible 200-yard approaches unless the danger is truly severe.</div>
              </div>
            </div>
          </div>
        )}

        {tab === "philosophy" && (
          <div className="grid-main">
            <div className="card" style={{ padding: 24 }}>
              <div style={{ fontSize: 24, fontWeight: 700, marginBottom: 6 }}>Training Preferences</div>
              <div className="muted" style={{ marginBottom: 18 }}>Default philosophy: miss-based strategy into greens</div>
              <div className="stack">
                <div>
                  <label style={{ display: "block", fontWeight: 700, marginBottom: 8 }}>Preferred tee shot pattern</label>
                  <select className="field" value={preferences.preferredTeeShape} onChange={(e) => setPreferences((p) => ({ ...p, preferredTeeShape: e.target.value as Preferences["preferredTeeShape"] }))}>
                    <option value="fade">Fade</option>
                    <option value="draw">Draw</option>
                    <option value="stock">Stock</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: "block", fontWeight: 700, marginBottom: 8 }}>Preferred approach pattern</label>
                  <select className="field" value={preferences.preferredApproachShape} onChange={(e) => setPreferences((p) => ({ ...p, preferredApproachShape: e.target.value as Preferences["preferredApproachShape"] }))}>
                    <option value="knockdownFade">Knockdown Fade</option>
                    <option value="fade">Fade</option>
                    <option value="stock">Stock</option>
                    <option value="draw">Draw</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: "block", fontWeight: 700, marginBottom: 8 }}>Preferred layup shape</label>
                  <select className="field" value={preferences.preferredLayupShape} onChange={(e) => setPreferences((p) => ({ ...p, preferredLayupShape: e.target.value as Preferences["preferredLayupShape"] }))}>
                    <option value="fade">Fade</option>
                    <option value="stock">Stock</option>
                    <option value="draw">Draw</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: "block", fontWeight: 700, marginBottom: 8 }}>Coaching Notes</label>
                  <textarea value={preferences.notes} onChange={(e) => setPreferences((p) => ({ ...p, notes: e.target.value }))} />
                </div>
                <button className="btn btn-primary btn-mobile" onClick={newScenario}>Apply Preferences to New Scenarios</button>
              </div>
            </div>

            <div className="card" style={{ padding: 24 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 24, fontWeight: 700, marginBottom: 6 }}><Flag size={20} /> Suggested Training Theme</div>
              <div className="muted" style={{ marginBottom: 18 }}>How the app now thinks</div>
              <div className="stack">
                <div className="soft">Target first</div>
                <div className="soft">Adjusted yardage second</div>
                <div className="soft">Shot shape third</div>
                <div className="soft">Club last</div>
                <div className="soft">
                  <div style={{ fontWeight: 700, marginBottom: 8 }}>Sanity checks</div>
                  <ul>
                    {sanityChecks.map((check) => <li key={check.name}>{check.name}: {check.pass ? "Pass" : "Fail"}</li>)}
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
