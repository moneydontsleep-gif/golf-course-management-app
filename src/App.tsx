import React, { useEffect, useMemo, useState } from "react";
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
} from "lucide-react";

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
  preferredTeeShape: string;
  preferredApproachShape: string;
  preferredLayupShape: string;
  allowDrawOffTee: boolean;
  strictMode: boolean;
  allowRecoveryFlexibility: boolean;
  notes: string;
};

type Scenario = {
  mode: string;
  category: string;
  title: string;
  prompt: string;
  recommendation: string;
  correctClub: string;
  correctShot: string;
  explanation: string;
  windDir: string;
  windMph: number;
  holeYardage: number;
  par: number;
  targetYardage: number | null;
  distanceContext: string;
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

const holeTemplates = [
  { title: "Tee shot with fairway left", type: "tee" },
  { title: "Tee shot with danger in landing area", type: "tee" },
  { title: "Approach into a guarded green", type: "approach" },
  { title: "Crosswind tee shot", type: "tee" },
  { title: "Headwind approach", type: "approach" },
  { title: "Par-5 layup decision", type: "layup" },
  { title: "Missed fairway recovery", type: "recovery" },
  { title: "Punch-out from trees", type: "recovery" },
  { title: "Bad lie around trouble", type: "recovery" },
] as const;

const defaultPreferences: Preferences = {
  preferredTeeShape: "fade",
  preferredApproachShape: "knockdownFade",
  preferredLayupShape: "fade",
  allowDrawOffTee: true,
  strictMode: true,
  allowRecoveryFlexibility: true,
  notes:
    "Force the correct answer in standard situations. Allow flexibility only in scramble and recovery mode.",
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
  if (windDir === "tail") return Math.round(mph * -0.5 * factor);
  return 0;
}

function bestClubForDistance(clubs: Club[], target: number, shotType: string) {
  let best = clubs[0];
  let diff = Infinity;

  for (const club of clubs) {
    const yardage = (club as Record<string, number | string | undefined>)[
      shotType
    ] as number | undefined;
    const chosen = yardage ?? club.stock;
    const d = Math.abs(chosen - target);

    if (d < diff) {
      best = club;
      diff = d;
    }
  }

  return best;
}

function generateScenario(clubs: Club[], preferences: Preferences): Scenario {
  const template = randomFrom(holeTemplates);
  const windOptions = [
    "calm",
    "head",
    "tail",
    "leftToRight",
    "rightToLeft",
  ] as const;
  const windDir = randomFrom(windOptions);
  const windMph =
    windDir === "calm" ? 0 : randomFrom([5, 8, 10, 12, 15, 18, 20, 25]);

  if (template.type === "tee") {
    const fairwaySide = randomFrom(["left", "right", "center"] as const);
    const hazard = randomFrom([
      "water through the driver landing area",
      "fairway bunkers at driver distance",
      "trees squeezing the right side",
      "thick rough left of the fairway",
      "no major hazard, but narrow width",
    ]);
    const landingMax = randomFrom([230, 240, 250, 260, 270]);
    const safeWidth = randomFrom([20, 25, 30, 35]);
    const holeYardage = randomFrom([365, 388, 402, 418, 435, 452]);
    const par = holeYardage >= 445 ? 5 : 4;

    let recommendation = "";
    let shot = "fade";
    let club = clubs.find((c) => c.club === "Driver") || clubs[0];
    const reasoning: string[] = [];

    const driverStock = club.stock;
    const driverTotalStock = club.totalStock ?? driverStock + 10;
    const driverTotalDraw = club.totalDraw ?? driverTotalStock + 7;
    const driverTotalFade = club.totalFade ?? driverTotalStock - 5;
    const layupClub =
      clubs.find((c) => c.stock <= landingMax - 10) || clubs[clubs.length - 1];
    const cross = windDir === "leftToRight" || windDir === "rightToLeft";
    const strongWind = windMph >= 15;

    const rolloutRisk = driverTotalStock > landingMax + 5;
    const carryRisk = landingMax < driverStock - 5;
    const narrowWindRisk = safeWidth <= 25 && strongWind;
    const troubleRisk = hazard.includes("water") || hazard.includes("bunkers");

    const remainingIfDriver = holeYardage - driverTotalStock;
    const remainingIfLayup = holeYardage - layupClub.stock;
    const layupCreatesTooLongApproach = remainingIfLayup > 200;
    const driverMeaningfullyImprovesScoring = remainingIfDriver < 190;

    const shouldFavorAggression =
      layupCreatesTooLongApproach &&
      driverMeaningfullyImprovesScoring &&
      !rolloutRisk &&
      !carryRisk &&
      !narrowWindRisk &&
      !hazard.includes("water");

    const shouldLayUp =
      (troubleRisk || carryRisk || narrowWindRisk || rolloutRisk) &&
      !shouldFavorAggression;

    if (shouldLayUp) {
      shot = preferences.preferredLayupShape;
      club = layupClub;
      recommendation = `Lay up with ${club.club}`;
      reasoning.push(
        "Driver brings unnecessary risk into the landing area based on carry and rollout."
      );
      reasoning.push(
        "A shorter club keeps the ball in the widest usable section of the fairway."
      );
    } else {
      if (shouldFavorAggression) {
        shot = preferences.preferredTeeShape;
        recommendation = `Hit a ${shot} with ${club.club}`;
        reasoning.push(
          "Laying back leaves too long of an approach for this hole length."
        );
        reasoning.push(
          "A controlled aggressive tee shot improves the scoring position."
        );
      } else if (fairwaySide === "left") {
        shot = "fade";
        recommendation = `Hit a ${shot} with ${club.club}`;
        reasoning.push(
          "The fairway sits left, so a controlled cut matches the hole shape and opens the landing zone."
        );
      } else if (fairwaySide === "right") {
        shot = preferences.allowDrawOffTee ? "draw" : "fade";
        recommendation = `Hit a ${shot} with ${club.club}`;
        reasoning.push(
          shot === "draw"
            ? "The fairway favors a draw and you allow that pattern off the tee."
            : "Even though the fairway favors the right side, your safer pattern is still the preferred play."
        );
      } else {
        shot = preferences.preferredTeeShape;
        recommendation = `Hit a ${shot} with ${club.club}`;
        reasoning.push("With a neutral fairway, use the most reliable tee pattern.");
      }

      if (cross) {
        const windText =
          windDir === "leftToRight" ? "left-to-right" : "right-to-left";
        reasoning.push(
          `The ${windText} wind should influence your start line and curve management.`
        );
      }
    }

    return {
      mode: "strict",
      category: "Tee Shot",
      title: template.title,
      prompt: `Hole: Par ${par}, ${holeYardage} yards. You are on the tee. Fairway position: ${fairwaySide}. Wind: ${windDir} ${
        windMph ? `at ${windMph} mph` : ""
      }. Hazard note: ${hazard}. Driver carry ~${driverStock} and total ~${driverTotalStock} (draw ~${driverTotalDraw}, fade ~${driverTotalFade}). Driver landing area begins to get risky around ${landingMax} yards. Fairway width is about ${safeWidth} yards. What is the best play?`,
      recommendation,
      correctClub: club.club,
      correctShot: shot,
      explanation: reasoning.join(" "),
      windDir,
      windMph,
      holeYardage,
      par,
      targetYardage: null,
      distanceContext: `Par ${par} • ${holeYardage} yards`,
    };
  }

  if (template.type === "approach") {
    const base = randomFrom([118, 126, 134, 142, 151, 158, 166, 174, 182]);
    const holeYardage = randomFrom([365, 388, 402, 418, 435]);
    const par = 4;
    const adjusted = clamp(
      base + windAdjustmentYards(base, windDir, windMph),
      75,
      220
    );
    const club = bestClubForDistance(
      clubs,
      adjusted,
      preferences.preferredApproachShape
    );
    const miss = randomFrom([
      "long is dead",
      "short is okay",
      "right bunker",
      "left water",
      "tight front pin",
    ]);
    const greenFirmness = randomFrom(["soft", "average", "firm"]);

    const windNotes: string[] = [];
    if (windDir === "head") {
      windNotes.push(
        "Headwind adds effective distance and makes high-spin shots less predictable."
      );
    }
    if (windDir === "tail") {
      windNotes.push(
        "Tailwind reduces effective yardage but can make stopping power harder to judge."
      );
    }
    if (windDir === "leftToRight") {
      windNotes.push(
        "Left-to-right wind asks for a start line that resists drift."
      );
    }
    if (windDir === "rightToLeft") {
      windNotes.push(
        "Right-to-left wind asks for a start line that resists over-curving."
      );
    }

    return {
      mode: "strict",
      category: "Approach Shot",
      title: template.title,
      prompt: `Hole: Par ${par}, ${holeYardage} yards. You have ${base} yards to the pin. Wind: ${windDir} ${
        windMph ? `at ${windMph} mph` : ""
      }. Green firmness: ${greenFirmness}. Trouble: ${miss}. Your preferred approach pattern is a controlled knockdown fade. What is the best play?`,
      recommendation: `Hit a ${preferences.preferredApproachShape} with ${club.club}`,
      correctClub: club.club,
      correctShot: preferences.preferredApproachShape,
      explanation: `Adjusted playing yardage is about ${adjusted} yards. ${windNotes.join(
        " "
      )} A flatter, controlled flight improves distance control and reduces curve volatility into the green.`,
      windDir,
      windMph,
      holeYardage,
      par,
      targetYardage: base,
      distanceContext: `Par ${par} • ${holeYardage} yards`,
    };
  }

  if (template.type === "recovery") {
    const recoveryType = randomFrom([
      "missed fairway",
      "blocked by trees",
      "punch-out angle",
      "bad lie in rough",
    ]);
    const remaining = randomFrom([135, 148, 162, 176, 188, 205]);
    const lie = randomFrom([
      "sitting down in rough",
      "clean but blocked",
      "bare lie",
      "under tree limbs",
    ]);
    const opening = randomFrom([
      "small gap only",
      "half-swing window",
      "full escape to fairway",
      "low punch lane",
    ]);
    const safeLeave = randomFrom([85, 95, 105, 115]);
    const holeYardage = randomFrom([395, 410, 428, 446, 472]);
    const par = holeYardage >= 445 ? 5 : 4;
    const shotChoices = [
      { label: "Punch back to fairway", shot: "punch", yardage: safeLeave },
      { label: "Low punch fade", shot: "punch", yardage: safeLeave + 10 },
      { label: "Advance safely", shot: "stock", yardage: safeLeave + 20 },
    ];
    const chosen = randomFrom(shotChoices);
    const targetAdvance = Math.max(remaining - chosen.yardage, 20);
    const lookupShot = chosen.shot === "punch" ? "stock" : chosen.shot;
    const club = bestClubForDistance(clubs, targetAdvance, lookupShot);

    return {
      mode: "recovery",
      category: "Scramble / Recovery",
      title: template.title,
      prompt: `Hole: Par ${par}, ${holeYardage} yards. Recovery situation: ${recoveryType}. You have ${remaining} yards left. Lie: ${lie}. Escape window: ${opening}. A smart recovery should leave about ${chosen.yardage} yards for the next shot, not force the green. What is the best play?`,
      recommendation: `${chosen.label} with ${club.club}`,
      correctClub: club.club,
      correctShot: chosen.shot,
      explanation:
        "Recovery mode allows flexibility, but only within disciplined boundaries. The goal is to recover to a scoring position, not attempt a hero shot from a compromised position.",
      windDir,
      windMph,
      holeYardage,
      par,
      targetYardage: remaining,
      distanceContext: `Recovery • Par ${par} • ${holeYardage} yards`,
    };
  }

  const layupTarget = randomFrom([75, 85, 90, 100, 110, 120]);
  const startDistance = randomFrom([235, 245, 255, 265, 275]);
  const holeYardage = randomFrom([495, 515, 530, 548, 565]);
  const par = 5;
  const effective = startDistance + windAdjustmentYards(startDistance, windDir, windMph);
  const club = bestClubForDistance(
    clubs,
    effective - layupTarget,
    preferences.preferredLayupShape
  );

  return {
    mode: "strict",
    category: "Layup Decision",
    title: template.title,
    prompt: `Hole: Par ${par}, ${holeYardage} yards. You are ${startDistance} yards from the hole on a par 5. Wind: ${windDir} ${
      windMph ? `at ${windMph} mph` : ""
    }. The green is not worth forcing. Your favorite wedge number is ${layupTarget} yards. What is the best play?`,
    recommendation: `Lay up with ${club.club} to leave about ${layupTarget} yards`,
    correctClub: club.club,
    correctShot: preferences.preferredLayupShape,
    explanation:
      "This is a position play. Instead of chasing maximum distance, choose the club that leaves your favorite scoring yardage. Effective remaining distance is influenced by the wind, so discipline matters more than aggression here.",
    windDir,
    windMph,
    holeYardage,
    par,
    targetYardage: startDistance,
    distanceContext: `Par ${par} • ${holeYardage} yards`,
  };
}

function runSanityChecks() {
  const results = Array.from({ length: 12 }, () =>
    generateScenario(defaultClubs, defaultPreferences)
  );

  return [
    {
      name: "Generates 12 scenarios without crashing",
      pass: results.length === 12,
    },
    {
      name: "Every scenario has a recommendation",
      pass: results.every((s) => s.recommendation.length > 0),
    },
    {
      name: "Every scenario has a correct club and shot",
      pass: results.every((s) => !!s.correctClub && !!s.correctShot),
    },
    {
      name: "Every scenario includes hole yardage context",
      pass: results.every((s) => s.distanceContext.includes("Par")),
    },
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
  const [clubs, setClubs] = useState<Club[]>(() =>
    loadLocal("golf-app-clubs", defaultClubs)
  );
  const [preferences, setPreferences] = useState<Preferences>(() =>
    loadLocal("golf-app-preferences", defaultPreferences)
  );
  const [scenario, setScenario] = useState<Scenario>(() =>
    generateScenario(defaultClubs, defaultPreferences)
  );
  const [answerClub, setAnswerClub] = useState("");
  const [answerShot, setAnswerShot] = useState("");
  const [feedback, setFeedback] = useState<{
    clubCorrect: boolean;
    shotCorrect: boolean;
    isCorrect: boolean;
  } | null>(null);
  const [score, setScore] = useState<{ correct: number; total: number }>(() =>
    loadLocal("golf-app-score", { correct: 0, total: 0 })
  );
  const [tab, setTab] = useState("quiz");

  const clubNames = useMemo(() => clubs.map((c) => c.club), [clubs]);
  const pct = score.total ? Math.round((score.correct / score.total) * 100) : 0;

  useEffect(() => {
    window.localStorage.setItem("golf-app-clubs", JSON.stringify(clubs));
  }, [clubs]);

  useEffect(() => {
    window.localStorage.setItem(
      "golf-app-preferences",
      JSON.stringify(preferences)
    );
  }, [preferences]);

  useEffect(() => {
    window.localStorage.setItem("golf-app-score", JSON.stringify(score));
  }, [score]);

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
    setClubs((prev) => [
      ...prev,
      {
        club: `New Club ${prev.length + 1}`,
        stock: 0,
        draw: 0,
        fade: 0,
        knockdownFade: 0,
      },
    ]);
  }

  function removeClub(index: number) {
    setClubs((prev) => prev.filter((_, i) => i !== index));
  }

  function newScenario() {
    setScenario(generateScenario(clubs, preferences));
    setAnswerClub("");
    setAnswerShot("");
    setFeedback(null);
  }

  function submitAnswer() {
    const clubCorrect = answerClub === scenario.correctClub;
    const shotCorrect = answerShot === scenario.correctShot;
    const isCorrect = clubCorrect && shotCorrect;

    setScore((prev) => ({
      correct: prev.correct + (isCorrect ? 1 : 0),
      total: prev.total + 1,
    }));

    setFeedback({ clubCorrect, shotCorrect, isCorrect });
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#f3f5f7",
        padding: 16,
        fontFamily: "Arial, sans-serif",
        color: "#10233f",
      }}
    >
      <style>{`
        * { box-sizing: border-box; }
        .container { max-width: 1280px; margin: 0 auto; }
        .hero, .panel, .card { background: white; border-radius: 20px; box-shadow: 0 2px 10px rgba(15, 35, 63, 0.08); border: 1px solid #dde5ee; }
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
        ul { margin: 0; padding-left: 20px; }
        @media (max-width: 900px) {
          .grid-top, .grid-main, .answer-grid, .score-grid, .feedback-grid { grid-template-columns: 1fr; }
          .tab-row { grid-template-columns: 1fr 1fr; }
          .bag-header { display: none; }
          .bag-row { grid-template-columns: 1fr; }
          .btn-mobile { width: 100%; }
        }
      `}</style>

      <div className="container" style={{ display: "grid", gap: 24 }}>
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="grid-top"
        >
          <div className="hero" style={{ padding: 24 }}>
            <div
              style={{
                fontSize: 12,
                color: "#dce7f3",
                marginBottom: 12,
                display: "block",
              }}
            >
              Mobile-friendly and ready to save to home screen after deployment.
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
              <div>
                <div
                  className="pill"
                  style={{
                    background: "rgba(255,255,255,0.15)",
                    color: "white",
                    marginBottom: 12,
                  }}
                >
                  Golf IQ Trainer
                </div>
                <h1 style={{ margin: 0, fontSize: 36 }}>
                  Course Management Q&amp;A App
                </h1>
                <p style={{ maxWidth: 760, lineHeight: 1.7, color: "#dce7f3" }}>
                  Build disciplined decision-making off the tee, in the wind, and
                  into greens. Customize every club in the bag, then test
                  course-management choices with randomized scenarios and instant
                  explanations.
                </p>
              </div>
              <Target size={40} />
            </div>
          </div>

          <div className="card" style={{ padding: 24 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: 24,
                fontWeight: 700,
                marginBottom: 6,
              }}
            >
              <Trophy size={20} /> Scoreboard
            </div>
            <div className="muted" style={{ marginBottom: 16 }}>
              Strict scoring based on the single highest-percentage decision
            </div>
            <div className="score-grid">
              <div className="soft">
                <div className="muted" style={{ fontSize: 12 }}>
                  Correct
                </div>
                <div style={{ fontSize: 30, fontWeight: 700 }}>{score.correct}</div>
              </div>
              <div className="soft">
                <div className="muted" style={{ fontSize: 12 }}>
                  Total
                </div>
                <div style={{ fontSize: 30, fontWeight: 700 }}>{score.total}</div>
              </div>
            </div>
            <div style={{ marginTop: 14 }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginBottom: 8,
                }}
              >
                <span>Accuracy</span>
                <strong>{pct}%</strong>
              </div>
              <div className="progress-wrap">
                <div className="progress-bar" style={{ width: `${pct}%` }} />
              </div>
            </div>
            <div className="soft" style={{ marginTop: 16 }}>
              The goal is repeating the single highest-percentage decision under
              pressure, even when a more tempting shot exists.
            </div>
          </div>
        </motion.div>

        <div className="tab-row">
          {[
            ["quiz", "Quiz Mode"],
            ["bag", "Bag Setup"],
            ["philosophy", "Strategy Rules"],
            ["recovery", "Recovery Mode"],
          ].map(([value, label]) => (
            <button
              key={value}
              className={`tab-btn ${tab === value ? "active" : ""}`}
              onClick={() => setTab(value)}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === "quiz" && (
          <div className="grid-main">
            <div className="stack">
              <div className="card" style={{ padding: 24 }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 12,
                    alignItems: "center",
                  }}
                >
                  <div>
                    <div style={{ fontSize: 20, fontWeight: 700 }}>{scenario.title}</div>
                    <div className="muted">{scenario.category}</div>
                  </div>
                  <div className="badge">{scenario.distanceContext}</div>
                </div>
                <p style={{ lineHeight: 1.7, marginTop: 20 }}>{scenario.prompt}</p>
              </div>

              <div className="card" style={{ padding: 24 }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    fontSize: 24,
                    fontWeight: 700,
                    marginBottom: 6,
                  }}
                >
                  <Brain size={20} /> Your Answer
                </div>
                <div className="muted" style={{ marginBottom: 18 }}>
                  Choose the club and shot pattern that best fits the situation
                </div>
                <div className="answer-grid">
                  <div>
                    <label
                      style={{ display: "block", fontWeight: 700, marginBottom: 8 }}
                    >
                      Club
                    </label>
                    <select
                      className="field"
                      value={answerClub}
                      onChange={(e) => setAnswerClub(e.target.value)}
                    >
                      <option value="">Select a club</option>
                      {clubNames.map((club) => (
                        <option key={club} value={club}>
                          {club}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label
                      style={{ display: "block", fontWeight: 700, marginBottom: 8 }}
                    >
                      Shot Shape
                    </label>
                    <select
                      className="field"
                      value={answerShot}
                      onChange={(e) => setAnswerShot(e.target.value)}
                    >
                      <option value="">Select a shot shape</option>
                      <option value="draw">Draw</option>
                      <option value="fade">Fade</option>
                      <option value="knockdownFade">Knockdown Fade</option>
                      <option value="stock">Stock</option>
                      <option value="punch">Punch</option>
                    </select>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 18 }}>
                  <button className="btn btn-primary btn-mobile" onClick={submitAnswer}>
                    Submit Answer
                  </button>
                  <button
                    className="btn btn-secondary btn-mobile"
                    onClick={newScenario}
                    style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
                  >
                    <RefreshCw size={16} /> New Scenario
                  </button>
                </div>
              </div>
            </div>

            <div className="stack">
              <div className="card" style={{ padding: 24 }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    fontSize: 24,
                    fontWeight: 700,
                    marginBottom: 6,
                  }}
                >
                  <Wind size={20} /> Instant Feedback
                </div>
                <div className="muted" style={{ marginBottom: 18 }}>
                  Strictly grade whether the decision matched the intended strategy
                </div>
                {!feedback ? (
                  <div className="soft">
                    Submit an answer to reveal the recommended decision and explanation.
                  </div>
                ) : (
                  <div className="stack">
                    <div className={`soft ${feedback.isCorrect ? "success" : "warn"}`}>
                      <div style={{ fontWeight: 700, marginBottom: 8 }}>
                        {feedback.isCorrect ? "Correct decision" : "Review the decision"}
                      </div>
                      Recommended play: <strong>{scenario.recommendation}</strong>
                    </div>
                    <div className="feedback-grid">
                      <div className={`soft ${feedback.clubCorrect ? "success" : ""}`}>
                        <div className="muted">Club</div>
                        <strong>
                          {feedback.clubCorrect ? "Correct" : `Best: ${scenario.correctClub}`}
                        </strong>
                      </div>
                      <div className={`soft ${feedback.shotCorrect ? "success" : ""}`}>
                        <div className="muted">Shot</div>
                        <strong>
                          {feedback.shotCorrect ? "Correct" : `Best: ${scenario.correctShot}`}
                        </strong>
                      </div>
                    </div>
                    <div className="soft">{scenario.explanation}</div>
                  </div>
                )}
              </div>

              <div className="card" style={{ padding: 24 }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    fontSize: 24,
                    fontWeight: 700,
                    marginBottom: 6,
                  }}
                >
                  <ShieldCheck size={20} /> Built-In Decision Logic
                </div>
                <div className="stack">
                  <div className="soft">
                    1. Match the tee shot shape to the fairway when the landing zone
                    rewards that pattern.
                  </div>
                  <div className="soft">
                    2. If driver brings hazard into play, default to the smarter layup
                    club.
                  </div>
                  <div className="soft">
                    3. Into greens, favor the controlled knockdown fade for tighter
                    dispersion and flatter flight.
                  </div>
                  <div className="soft">
                    4. Stronger wind increases the value of trajectory control and
                    start-line discipline.
                  </div>
                  <div className="soft">
                    5. The app uses one forced correct answer in normal situations to
                    train discipline, not debate.
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {tab === "bag" && (
          <div className="card" style={{ padding: 24 }}>
            <div style={{ fontSize: 24, fontWeight: 700, marginBottom: 6 }}>
              Customize Club Distances
            </div>
            <div className="muted" style={{ marginBottom: 18 }}>
              Enter carry numbers for stock, draw, fade, and knockdown fade
            </div>
            <div className="bag-header" style={{ marginBottom: 12 }}>
              <div>Club</div>
              <div>Stock</div>
              <div>Draw</div>
              <div>Fade</div>
              <div>Knockdown Fade</div>
              <div></div>
            </div>
            <div className="stack">
              {clubs.map((club, index) => (
                <div key={`${club.club}-${index}`} className="bag-row soft">
                  <input
                    className="field"
                    value={club.club}
                    onChange={(e) => updateClub(index, "club", e.target.value)}
                  />
                  <input
                    className="field"
                    type="number"
                    value={club.stock}
                    onChange={(e) => updateClub(index, "stock", e.target.value)}
                  />
                  <input
                    className="field"
                    type="number"
                    value={club.draw}
                    onChange={(e) => updateClub(index, "draw", e.target.value)}
                  />
                  <input
                    className="field"
                    type="number"
                    value={club.fade}
                    onChange={(e) => updateClub(index, "fade", e.target.value)}
                  />
                  <input
                    className="field"
                    type="number"
                    value={club.knockdownFade}
                    onChange={(e) =>
                      updateClub(index, "knockdownFade", e.target.value)
                    }
                  />
                  <button
                    className="icon-btn"
                    onClick={() => removeClub(index)}
                    aria-label={`Remove ${club.club}`}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 16 }}>
              <button
                className="btn btn-secondary btn-mobile"
                onClick={addClub}
                style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
              >
                <Plus size={16} /> Add Club
              </button>
            </div>
          </div>
        )}

        {tab === "recovery" && (
          <div className="grid-main">
            <div className="card" style={{ padding: 24 }}>
              <div style={{ fontSize: 24, fontWeight: 700, marginBottom: 6 }}>
                Scramble / Recovery Mode
              </div>
              <div className="muted" style={{ marginBottom: 18 }}>
                Flexibility is allowed only after a missed fairway, blocked angle,
                punch-out, or poor lie
              </div>
              <div className="stack">
                <p style={{ lineHeight: 1.7, margin: 0 }}>
                  Recovery golf is different from normal course management. In
                  standard situations, the app forces one correct answer. In recovery
                  situations, the app allows disciplined flexibility.
                </p>
                <div className="soft">
                  <div style={{ fontWeight: 700, marginBottom: 8 }}>
                    Recovery principles
                  </div>
                  <ul>
                    <li>Get the ball back in play first</li>
                    <li>Avoid hero shots unless the opening is truly realistic</li>
                    <li>Favor angles and yardages that restore control on the next shot</li>
                    <li>Use punch-outs, low fades, and safe advances when needed</li>
                  </ul>
                </div>
                <div className="soft">
                  Recovery mode scenarios include missed fairways, trees, blocked
                  windows, and bad lies.
                </div>
              </div>
            </div>

            <div className="card" style={{ padding: 24 }}>
              <div style={{ fontSize: 24, fontWeight: 700, marginBottom: 6 }}>
                Why total hole yardage matters
              </div>
              <div className="muted" style={{ marginBottom: 18 }}>
                Yes — this should be included off the tee
              </div>
              <div className="stack">
                <p style={{ lineHeight: 1.7, margin: 0 }}>
                  Off the tee, hole yardage matters because club choice is not only
                  about avoiding danger. It is also about setting up the correct
                  remaining distance, angle, and scoring opportunity for the next
                  shot.
                </p>
                <p style={{ lineHeight: 1.7, margin: 0 }}>
                  The app includes total hole yardage and par in the scenario prompt
                  and distance badge, so each tee-shot decision is made in the
                  context of the full hole.
                </p>
                <div className="soft">
                  Example: a 410-yard par 4 and a 455-yard par 4 may both have
                  trouble at 270, but they should not always produce the same
                  decision.
                </div>
              </div>
            </div>
          </div>
        )}

        {tab === "philosophy" && (
          <div className="grid-main">
            <div className="card" style={{ padding: 24 }}>
              <div style={{ fontSize: 24, fontWeight: 700, marginBottom: 6 }}>
                Training Preferences
              </div>
              <div className="muted" style={{ marginBottom: 18 }}>
                Set the strict decision patterns the app should reinforce
              </div>
              <div className="stack">
                <div>
                  <label
                    style={{ display: "block", fontWeight: 700, marginBottom: 8 }}
                  >
                    Preferred tee shot pattern
                  </label>
                  <select
                    className="field"
                    value={preferences.preferredTeeShape}
                    onChange={(e) =>
                      setPreferences((p) => ({
                        ...p,
                        preferredTeeShape: e.target.value,
                      }))
                    }
                  >
                    <option value="fade">Fade</option>
                    <option value="draw">Draw</option>
                    <option value="stock">Stock</option>
                  </select>
                </div>
                <div>
                  <label
                    style={{ display: "block", fontWeight: 700, marginBottom: 8 }}
                  >
                    Preferred approach pattern
                  </label>
                  <select
                    className="field"
                    value={preferences.preferredApproachShape}
                    onChange={(e) =>
                      setPreferences((p) => ({
                        ...p,
                        preferredApproachShape: e.target.value,
                      }))
                    }
                  >
                    <option value="knockdownFade">Knockdown Fade</option>
                    <option value="fade">Fade</option>
                    <option value="stock">Stock</option>
                    <option value="draw">Draw</option>
                  </select>
                </div>
                <div>
                  <label
                    style={{ display: "block", fontWeight: 700, marginBottom: 8 }}
                  >
                    Preferred layup shape
                  </label>
                  <select
                    className="field"
                    value={preferences.preferredLayupShape}
                    onChange={(e) =>
                      setPreferences((p) => ({
                        ...p,
                        preferredLayupShape: e.target.value,
                      }))
                    }
                  >
                    <option value="fade">Fade</option>
                    <option value="stock">Stock</option>
                    <option value="draw">Draw</option>
                  </select>
                </div>
                <div>
                  <label
                    style={{ display: "block", fontWeight: 700, marginBottom: 8 }}
                  >
                    Coaching Notes
                  </label>
                  <textarea
                    value={preferences.notes}
                    onChange={(e) =>
                      setPreferences((p) => ({ ...p, notes: e.target.value }))
                    }
                  />
                </div>
                <button className="btn btn-primary btn-mobile" onClick={newScenario}>
                  Apply Preferences to New Scenarios
                </button>
              </div>
            </div>

            <div className="card" style={{ padding: 24 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 24,
                  fontWeight: 700,
                  marginBottom: 6,
                }}
              >
                <Flag size={20} /> Suggested Training Theme
              </div>
              <div className="muted" style={{ marginBottom: 18 }}>
                How this app should coach your son
              </div>
              <div className="stack">
                <p style={{ lineHeight: 1.7, margin: 0 }}>
                  This app should train one central habit:{" "}
                  <strong>
                    choose the single highest-percentage shot, not the most
                    tempting shot.
                  </strong>
                </p>
                <p style={{ lineHeight: 1.7, margin: 0 }}>
                  Your philosophy is strong. Off the tee, shape the ball to the
                  hole when it increases margin. But if the driver landing area is
                  compromised by bunkers, water, rough squeeze, or wind, the app
                  should reward disciplined layups over forced aggression.
                </p>
                <p style={{ lineHeight: 1.7, margin: 0 }}>
                  Into greens, the app should teach a predictable scoring pattern.
                  Your controlled knockdown fade is ideal because it reduces
                  height, curve volatility, and distance-control mistakes,
                  especially in the wind. In standard scenarios, the app should
                  force that decision instead of rewarding creative alternatives.
                </p>
                <div className="soft">
                  <div style={{ fontWeight: 700, marginBottom: 8 }}>
                    Built-in sanity checks
                  </div>
                  <ul>
                    {sanityChecks.map((check) => (
                      <li key={check.name}>
                        {check.name}: {check.pass ? "Pass" : "Fail"}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="soft">
                  <div style={{ fontWeight: 700, marginBottom: 8 }}>
                    Deployment notes
                  </div>
                  <ul>
                    <li>Deploy on Vercel for fast browser access</li>
                    <li>Open the deployed site on phone and add it to the home screen</li>
                    <li>Bag setup, preferences, and score save in the browser automatically</li>
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