// Mofid - score the browser-side mock retrieval against the gold set.
// Run from the repo root:  node tools/eval_mock.mjs
// Load api.js as-is and exercise it against the real gold set.
import fs from "node:fs";
import vm from "node:vm";

const chunks = JSON.parse(fs.readFileSync("webapp/data/curriculum.json", "utf8"));
const gold = JSON.parse(fs.readFileSync("eval/gold_set.json", "utf8"));

const ctx = {
  fetch: async (p) => ({ json: async () => (p.includes("curriculum") ? chunks : []) }),
  performance: { now: () => Date.now() },
  setTimeout: (f) => f(),          // skip the artificial delay
  console,
};
vm.createContext(ctx);
const SRC = fs.readFileSync("webapp/api.js", "utf8") + ";globalThis.MofidAPI = MofidAPI;";
vm.runInContext(SRC, ctx);

let hit = 0, miss = 0, wrongRefuse = 0, falseAnswer = 0, refuseOK = 0;
const failures = [];

for (const g of gold) {
  const res = await ctx.MofidAPI.ask(g.question, "ar");
  const ids = (res.citations || []).map((c) => c.id);
  if (g.expect_refusal) {
    if (res.in_curriculum === false) refuseOK++;
    else { falseAnswer++; failures.push(["ANSWERED-OOC", g.question, ids[0]]); }
  } else if (res.in_curriculum === false) {
    wrongRefuse++; failures.push(["REFUSED", g.question, g.expected_chunk_ids[0]]);
  } else if (g.expected_chunk_ids.some((e) => ids.includes(e))) {
    hit++;
  } else {
    miss++; failures.push(["WRONG", g.question, `got ${ids[0]} want ${g.expected_chunk_ids[0]}`]);
  }
}

const inCur = gold.filter((g) => !g.expect_refusal).length;
const ooc = gold.length - inCur;
console.log(`in-curriculum (${inCur}):  correct ${hit}  wrong-chunk ${miss}  wrongly-refused ${wrongRefuse}`);
console.log(`out-of-curriculum (${ooc}):  correctly refused ${refuseOK}  answered anyway ${falseAnswer}`);
console.log(`\nretrieval accuracy : ${(hit / inCur * 100).toFixed(0)}%`);
console.log(`refusal accuracy   : ${(refuseOK / ooc * 100).toFixed(0)}%`);
if (failures.length) {
  console.log(`\n--- ${failures.length} failures ---`);
  for (const f of failures.slice(0, 12)) console.log(" ", f[0].padEnd(14), f[1], "|", f[2]);
}
