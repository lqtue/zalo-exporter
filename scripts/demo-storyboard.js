// Prints a storyboard (JSON) of a simulated run, using the tool's own English texts. Fake group names only.
const { TEXT } = require("../pc-backfill/export.js");
const T = TEXT.en;
const frames = []; let screen = [];
const snap = (ms) => frames.push({ ms, lines: screen.map((l) => l.map((seg) => seg.slice())) });
const add = (text, style = "fg") => text.split("\n").forEach((l) => screen.push([[l, style]]));
const setLast = (text, style = "dim") => { screen[screen.length - 1] = [[text, style]]; };
const type = (prefix, text, ms = 70) => { screen.push([[prefix, "cyan"], [""   , "fg"]]); for (let i = 1; i <= text.length; i++) { screen[screen.length - 1][1][0] = text.slice(0, i); snap(ms); } };

type("$ ", "./Export.command"); snap(350);
add(""); add(T.menuTitle, "bold"); add("");
for (const n of Object.keys(T.menu)) add(`  ${n}  ${T.menu[n]}`);
add(""); type(T.choicePrompt("1"), "1"); snap(450);
add(""); add(T.plan(T.srcApp, "art class", T.modeNew, T.namesHidden), "dim"); add("");
T.confirmApp.trimEnd().split("\n").forEach((l) => add(l)); snap(1100);
add(""); add(`${T.restarting}…`); snap(500); add(`${T.waiting}…`); snap(500);
add(""); add(`${T.scanning}… 0:01`, "dim"); for (const s of [2, 4, 6, 8]) { setLast(`${T.scanning}… 0:0${s}`); snap(260); }
const chats = [["Art class A - Mon 17:30", 86, "2026-09-18"], ["Art class B - Tue 17:30", 41, "2026-10-02"], ["Art class C - Thu 16:00", 63, "2026-09-25"], ["Art class D - Sat 09:00", 27, "2026-10-14"]];
setLast(""); screen.pop();
chats.forEach(([name, total, back], i) => {
  screen.push([["", "dim"]]);
  const steps = [0.25, 0.6, 1];
  steps.forEach((f, k) => {
    const p = { i: i + 1, n: chats.length, name, count: Math.round(total * f), back: k === 0 ? "2026-11-05" : back, top: k === 2 };
    setLast(T.progress(p, `0:0${k * 2 + 1}`)); snap(i === 0 ? 420 : 300);
  });
  setLast(T.doneChat(name, total), "green"); snap(250);
});
add(""); add(T.finish(chats.length, 217, 217, chats.length), "green");
add(`  ${T.file}archive/archive.json`); snap(3200);
console.log(JSON.stringify(frames));
