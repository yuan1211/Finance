/**
 * 피싱브레이크 정량 평가 러너.
 *
 * 라벨링된 통화 대본을 한 턴씩 실시간 분석 API에 흘려보내며,
 * 실제 사용자가 겪는 것과 같은 경로(누적 트랜스크립트 + 직전 위험도 + 디바운스 없는 매 턴 호출)로
 * 판정을 받아 지표를 계산한다.
 *
 * 사용법:
 *   1) 다른 터미널에서 `npm run dev` (또는 `npm run build && npm start`)
 *   2) `npm run eval`
 *
 * ANTHROPIC_API_KEY가 설정돼 있으면 Claude 경로를, 없으면 룰 기반 폴백을 측정한다.
 * 두 결과를 나란히 두면 그대로 ablation 표가 된다.
 */

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE_URL = process.env.EVAL_BASE_URL ?? "http://localhost:3000";
const ENDPOINT = `${BASE_URL}/api/live-analyze`;

/** 개입 판정 기준: API가 shouldIntervene을 세웠거나 위험도가 '높음'에 도달한 시점 */
function isIntervened(update) {
  return update.shouldIntervene === true || update.riskLevel === "높음";
}

async function analyzeCase(testCase) {
  const timeline = [];
  let transcript = "";
  let prev = { level: null, score: null, stage: null, keywords: [] };

  for (const [index, turn] of testCase.turns.entries()) {
    transcript += `[통화] ${turn}\n`;

    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        transcript: transcript.trim(),
        recentText: turn,
        previousLevel: prev.level,
        previousScore: prev.score,
        previousStage: prev.stage,
        knownKeywords: prev.keywords,
        callerNumber: testCase.callerNumber ?? "",
      }),
    });

    if (!res.ok) {
      throw new Error(`${testCase.id} turn ${index}: HTTP ${res.status} ${await res.text()}`);
    }
    const update = await res.json();

    timeline.push({ index, update });
    prev = {
      level: update.riskLevel,
      score: update.riskScore,
      stage: update.scamStage,
      keywords: Array.from(
        new Set([...prev.keywords, ...(update.newSignals ?? []).map((s) => s.keyword)]),
      ).slice(0, 40),
    };
  }

  return timeline;
}

function summarize(testCase, timeline) {
  const final = timeline[timeline.length - 1].update;
  const firstHit = timeline.find((t) => isIntervened(t.update));
  const detected = Boolean(firstHit);

  // 요구가 나오기 몇 턴 전에 잡았는가. 음수면 요구가 나온 뒤에야 잡았다는 뜻이다.
  const lead =
    detected && typeof testCase.askTurn === "number" ? testCase.askTurn - firstHit.index : null;

  return {
    id: testCase.id,
    label: testCase.label,
    expectedType: testCase.type,
    detected,
    detectionTurn: firstHit ? firstHit.index : null,
    totalTurns: testCase.turns.length,
    askTurn: testCase.askTurn,
    lead,
    finalScore: final.riskScore,
    finalLevel: final.riskLevel,
    finalStage: final.scamStage,
    finalType: final.scamType,
    engine: final.engine,
    counterQuestions: final.counterQuestions?.length ?? 0,
  };
}

function pct(n, d) {
  return d === 0 ? "—" : `${((n / d) * 100).toFixed(1)}%`;
}

function buildReport(rows) {
  const scams = rows.filter((r) => r.label === "사기");
  const safes = rows.filter((r) => r.label === "정상");

  const tp = scams.filter((r) => r.detected).length;
  const fn = scams.length - tp;
  const fp = safes.filter((r) => r.detected).length;
  const tn = safes.length - fp;

  const recall = tp / Math.max(1, scams.length);
  const fpr = fp / Math.max(1, safes.length);
  const precision = tp / Math.max(1, tp + fp);
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);

  const leads = scams.filter((r) => typeof r.lead === "number").map((r) => r.lead);
  const avgLead = leads.length > 0 ? leads.reduce((a, b) => a + b, 0) / leads.length : 0;
  const beforeAsk = leads.filter((l) => l > 0).length;

  const typeHits = scams.filter((r) => r.detected && r.finalType === r.expectedType).length;

  const safeScores = safes.map((r) => r.finalScore);
  const scamScores = scams.map((r) => r.finalScore);
  const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

  return {
    engine: rows[0]?.engine ?? "unknown",
    counts: { scams: scams.length, safes: safes.length, tp, fn, fp, tn },
    recall,
    fpr,
    precision,
    f1,
    avgLead,
    beforeAsk,
    beforeAskRate: beforeAsk / Math.max(1, leads.length),
    typeAccuracy: typeHits / Math.max(1, tp),
    avgScamScore: avg(scamScores),
    avgSafeScore: avg(safeScores),
    missed: scams.filter((r) => !r.detected).map((r) => r.id),
    falseAlarms: safes.filter((r) => r.detected).map((r) => r.id),
  };
}

function printReport(s) {
  const line = "─".repeat(58);
  console.log(`\n${line}`);
  console.log(`피싱브레이크 평가 결과   ·   분석 엔진: ${s.engine === "claude" ? "Claude" : "룰 기반 폴백"}`);
  console.log(line);
  console.log(`대상        사기 ${s.counts.scams}건 / 정상 ${s.counts.safes}건 (총 ${s.counts.scams + s.counts.safes}건)`);
  console.log("");
  console.log(`탐지율      ${pct(s.counts.tp, s.counts.scams).padEnd(8)} (사기 ${s.counts.tp}/${s.counts.scams} 적발)`);
  console.log(`오탐률      ${pct(s.counts.fp, s.counts.safes).padEnd(8)} (정상 ${s.counts.fp}/${s.counts.safes} 오경보)`);
  console.log(`정밀도      ${(s.precision * 100).toFixed(1)}%`);
  console.log(`F1          ${(s.f1 * 100).toFixed(1)}%`);
  console.log("");
  console.log(`요구 선행   ${pct(s.beforeAsk, s.counts.tp).padEnd(8)} (금전·앱설치 요구가 나오기 전에 개입)`);
  console.log(`평균 선행   ${s.avgLead.toFixed(2)} 턴`);
  console.log(`유형 정확도 ${(s.typeAccuracy * 100).toFixed(1)}%`);
  console.log("");
  console.log(`평균 점수   사기 ${s.avgScamScore.toFixed(1)}점  vs  정상 ${s.avgSafeScore.toFixed(1)}점`);
  if (s.missed.length > 0) console.log(`놓친 사기   ${s.missed.join(", ")}`);
  if (s.falseAlarms.length > 0) console.log(`오경보      ${s.falseAlarms.join(", ")}`);
  console.log(`${line}\n`);
}

function toMarkdown(s, rows) {
  const md = [];
  md.push("# 피싱브레이크 평가 리포트");
  md.push("");
  md.push(`- 생성 시각: ${new Date().toLocaleString("ko-KR")}`);
  md.push(`- 분석 엔진: **${s.engine === "claude" ? "Claude (claude-opus-5)" : "룰 기반 폴백"}**`);
  md.push(`- 평가셋: 사기 ${s.counts.scams}건 / 정상 ${s.counts.safes}건 (\`lib/eval/dataset.json\`)`);
  md.push("");
  md.push("## 요약");
  md.push("");
  md.push("| 지표 | 값 | 설명 |");
  md.push("|---|---|---|");
  md.push(`| 탐지율 (Recall) | **${(s.recall * 100).toFixed(1)}%** | 사기 통화 ${s.counts.tp}/${s.counts.scams}건 적발 |`);
  md.push(`| 오탐률 (FPR) | **${(s.fpr * 100).toFixed(1)}%** | 정상 통화 ${s.counts.fp}/${s.counts.safes}건 오경보 |`);
  md.push(`| 정밀도 (Precision) | ${(s.precision * 100).toFixed(1)}% | 개입한 건 중 실제 사기 비율 |`);
  md.push(`| F1 | ${(s.f1 * 100).toFixed(1)}% | 탐지율·정밀도 조화평균 |`);
  md.push(`| 요구 선행률 | **${(s.beforeAskRate * 100).toFixed(1)}%** | 금전·앱설치 요구가 나오기 **전에** 개입한 비율 |`);
  md.push(`| 평균 선행 턴 | ${s.avgLead.toFixed(2)} 턴 | 요구 발화보다 몇 턴 앞서 개입했는가 |`);
  md.push(`| 사기 유형 정확도 | ${(s.typeAccuracy * 100).toFixed(1)}% | 적발한 건의 유형 분류 일치율 |`);
  md.push(`| 평균 위험 점수 | 사기 ${s.avgScamScore.toFixed(1)} / 정상 ${s.avgSafeScore.toFixed(1)} | 두 집단의 점수 분리 |`);
  md.push("");
  md.push("> **요구 선행률**이 이 서비스의 핵심 지표입니다. 사기를 사후에 알아채는 것은 의미가 없고,");
  md.push("> 돈을 요구받기 전에 멈춰 세워야 피해가 발생하지 않기 때문입니다.");
  md.push("");

  if (s.missed.length > 0) {
    md.push(`**놓친 사기:** ${s.missed.join(", ")}`);
    md.push("");
  }
  if (s.falseAlarms.length > 0) {
    md.push(`**오경보:** ${s.falseAlarms.join(", ")}`);
    md.push("");
  }

  md.push("## 케이스별 결과");
  md.push("");
  md.push("| ID | 라벨 | 개입 | 개입 턴 | 요구 턴 | 선행 | 최종 점수 | 최종 단계 | 판정 유형 |");
  md.push("|---|---|---|---|---|---|---|---|---|");
  for (const r of rows) {
    md.push(
      `| ${r.id} | ${r.label} | ${r.detected ? "O" : "-"} | ${r.detectionTurn ?? "-"} | ${r.askTurn ?? "-"} | ${
        r.lead === null ? "-" : `${r.lead > 0 ? "+" : ""}${r.lead}`
      } | ${r.finalScore} (${r.finalLevel}) | ${r.finalStage} | ${r.finalType} |`,
    );
  }
  md.push("");
  md.push("- **개입 턴 / 요구 턴**은 0부터 셉니다. **선행**이 양수면 요구가 나오기 전에 잡았다는 뜻입니다.");
  md.push("- 정상 통화는 요구 턴이 없으므로 `-`로 표시됩니다.");
  md.push("");
  md.push("---");
  md.push("");
  md.push("재현: 개발 서버를 띄운 뒤 `npm run eval`. 대본은 실제 사건 보도와 금융감독원 피해사례를");
  md.push("참고해 재구성한 가상 데이터이며, 실존 인물·기관·번호와 무관합니다.");
  md.push("");
  return md.join("\n");
}

async function main() {
  const raw = await readFile(join(ROOT, "lib", "eval", "dataset.json"), "utf-8");
  const { cases } = JSON.parse(raw);

  // 서버가 떠 있는지 먼저 확인한다. 안 떠 있으면 원인 모를 fetch 오류만 잔뜩 나온다.
  try {
    const ping = await fetch(`${BASE_URL}/api/status`);
    if (!ping.ok) throw new Error(`HTTP ${ping.status}`);
    const { llmEnabled } = await ping.json();
    console.log(`서버 연결 확인 (${BASE_URL}) · LLM ${llmEnabled ? "연동됨" : "미설정 → 룰 기반으로 평가"}`);
  } catch (err) {
    console.error(`\n${BASE_URL}에 연결하지 못했습니다. 다른 터미널에서 \`npm run dev\`를 먼저 실행해 주세요.`);
    console.error(`(원인: ${err.message})\n`);
    process.exit(1);
  }

  const rows = [];
  for (const [i, testCase] of cases.entries()) {
    process.stdout.write(`\r분석 중 ${i + 1}/${cases.length}  ${testCase.id}          `);
    const timeline = await analyzeCase(testCase);
    rows.push(summarize(testCase, timeline));
  }
  process.stdout.write("\r".padEnd(48) + "\r");

  const summary = buildReport(rows);
  printReport(summary);

  const outPath = join(ROOT, "EVAL.md");
  await writeFile(outPath, toMarkdown(summary, rows), "utf-8");
  console.log(`리포트 저장: ${outPath}\n`);
}

main().catch((err) => {
  console.error("\n평가 실행 실패:", err);
  process.exit(1);
});
