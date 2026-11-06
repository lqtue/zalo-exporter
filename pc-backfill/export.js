// Zalo exporter: Windows + Mac, from the Zalo PC app or from Zalo Web. Node 22+, no packages.
//   node export.js                 shows a short menu
//   node export.js --source app|web [--full] [--probe]
// flags: --yes (no prompts)  --no-restart  --keywords "a,b"  --port N  --dry (plan only)
const fs = require("fs"), path = require("path"), cp = require("child_process"), readline = require("readline"), crypto = require("crypto");

const ROOT = path.resolve(__dirname, "..");
const SETTINGS_FILE = path.join(ROOT, "settings.json"), ARCHIVE_DIR = path.join(ROOT, "archive"), WEB_PROFILE = path.join(ROOT, "web-profile");
const argv = process.argv.slice(2);
const flag = (k) => argv.includes("--" + k);
const opt = (k, d) => { const i = argv.indexOf("--" + k); return i < 0 ? d : argv[i + 1]; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ask = (q) => new Promise((res) => {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.question(q, (a) => { rl.close(); res(a.trim()); });
});


// ---------- user interface: texts (English / Vietnamese), colours, live progress line ----------
const tty = process.stdout.isTTY;
const FANCY = process.platform !== "win32" || !!process.env.WT_SESSION; // old Windows consoles lack some symbols
const SYM = FANCY ? { ok: "✓", warn: "!", dot: "·", ell: "…", dash: "—" } : { ok: "OK", warn: "!", dot: "|", ell: "...", dash: "-" };
const paint = (code, str) => (tty && !process.env.NO_COLOR ? `\x1b[${code}m${str}\x1b[0m` : str);
const green = (x) => paint(32, x), yellow = (x) => paint(33, x), red = (x) => paint(31, x), bold = (x) => paint(1, x), dim = (x) => paint(2, x);
const clearLine = () => { if (tty) process.stdout.write("\r\x1b[K"); };
const mmss = (ms) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}`;

const TEXT = {
  en: {
    welcome: "Zalo Exporter saves the messages of your chosen Zalo groups on this computer,\nso you can see which questions come up most often.",
    askLang: "Language / Ngôn ngữ:  1 = English   2 = Tiếng Việt   [1]: ",
    askKeywords: "Which groups? Type part of their name (accents and capitals don't matter),\nfor example: lop ve    Several names: separate them with commas.",
    keywordsPrompt: "Group name: ",
    noKeyword: "No name was given. Run the tool again and type part of a group name.",
    menuTitle: "What would you like to do?",
    menu: {
      1: "Get NEW messages from the Zalo PC app       (the first time: everything it has)",
      2: "Get NEW messages from Zalo Web               (about the last 14 days only)",
      3: "Read ALL history again from the PC app        (once, after the phone sync has finished)",
      4: "Read ALL available messages again from Zalo Web",
      5: "Check that the tool can see Zalo              (nothing is exported)",
    },
    choicePrompt: (d) => `Type a number and press Enter [${d}]: `,
    badChoice: "Please type one of the numbers above.",
    srcApp: "Zalo PC app", srcWeb: "Zalo Web",
    modeCheck: "check only", modeAll: "all available history", modeNew: "new messages since the last run",
    plan: (src, kw, mode) => `Source: ${src}  |  Groups containing: ${kw}  |  ${mode}`,
    confirmApp: "Zalo will be CLOSED and reopened by this tool. Please don't use Zalo until it finishes.\nThis can take from a few minutes to a few hours.\nPress Enter to start (or close this window to cancel). ",
    confirmWeb: "A separate browser window with Zalo Web will open.\nFirst time: scan the QR code with the Zalo app on your phone. Please don't use that window until it finishes.\nPress Enter to start (or close this window to cancel). ",
    restarting: "Restarting Zalo in export mode", openingWeb: "Opening Zalo Web", waiting: "Waiting for the chat list",
    hintApp: "Still waiting. If Zalo asks you to log in (QR code or phone), please do it now.",
    hintWeb: "Still waiting. Scan the QR code in the Zalo Web window with the Zalo app on your phone.",
    timeout: "The Zalo chat list did not appear within 10 minutes. Close everything and run the tool again.",
    noBrowser: "No Chrome or Edge was found. Install one of them and run the tool again.",
    noZalo: "Could not find Zalo. Right-click your Zalo shortcut > Properties and copy the \"Target\" path.",
    pastePath: "Paste the path here: ", badPath: "That file does not exist.",
    scanning: "Scanning your chat list",
    progress: (p, el) => `[${p.i}/${p.n}] ${p.name} ${SYM.dot} ${p.count} messages${p.back ? ` ${SYM.dot} back to ${p.back}` : ""}${p.top ? ` ${SYM.dot} reaching the top` : ""} ${SYM.dot} ${el}`,
    doneChat: (n, c) => `${SYM.ok} ${n} ${SYM.dash} ${c} messages`,
    skip: { "not-opened": "could not be opened (usually: not synced to this computer yet)", "not-found": "was not found in the list",
            dup: "showed another chat's messages and was skipped", empty: "has no messages in this period", error: "had an error and was skipped" },
    finish: (chats, added, total, n) => `${SYM.ok} Done. ${chats} chats read, ${added} new messages saved.\n  The archive now holds ${total} messages from ${n} chats.`,
    file: "File: ",
    skippedTip: (n) => `${n} chat(s) could not be read. After the phone sync has finished, run this tool again and choose 3 (or 4 for Zalo Web).`,
    reopening: "Reopening Zalo normally", nothing: "Nothing was exported. Details:", error: "Something went wrong:",
  },
  vi: {
    welcome: "Zalo Exporter lưu tin nhắn của các nhóm Zalo bạn chọn vào máy tính này,\nđể bạn thấy những câu hỏi nào xuất hiện nhiều nhất.",
    askLang: "Language / Ngôn ngữ:  1 = English   2 = Tiếng Việt   [1]: ",
    askKeywords: "Bạn muốn lấy những nhóm nào? Gõ một phần tên nhóm (có dấu hay không, viết hoa hay thường đều được),\nví dụ: lop ve    Nhiều tên: ngăn cách bằng dấu phẩy.",
    keywordsPrompt: "Tên nhóm: ",
    noKeyword: "Bạn chưa nhập tên. Hãy chạy lại công cụ và gõ một phần tên nhóm.",
    menuTitle: "Bạn muốn làm gì?",
    menu: {
      1: "Lấy tin nhắn MỚI từ Zalo trên máy tính        (lần đầu: lấy tất cả những gì có)",
      2: "Lấy tin nhắn MỚI từ Zalo Web                  (chỉ khoảng 14 ngày gần nhất)",
      3: "Đọc lại TOÀN BỘ lịch sử từ Zalo trên máy tính  (một lần, sau khi điện thoại đồng bộ xong)",
      4: "Đọc lại toàn bộ tin nhắn có sẵn từ Zalo Web",
      5: "Kiểm tra công cụ có thấy Zalo không            (không xuất dữ liệu)",
    },
    choicePrompt: (d) => `Gõ một số rồi bấm Enter [${d}]: `,
    badChoice: "Vui lòng gõ một trong các số ở trên.",
    srcApp: "Zalo trên máy tính", srcWeb: "Zalo Web",
    modeCheck: "chỉ kiểm tra", modeAll: "toàn bộ lịch sử có sẵn", modeNew: "tin nhắn mới từ lần chạy trước",
    plan: (src, kw, mode) => `Nguồn: ${src}  |  Nhóm có chứa: ${kw}  |  ${mode}`,
    confirmApp: "Công cụ sẽ TẮT Zalo rồi mở lại. Vui lòng không dùng Zalo cho đến khi xong.\nViệc này có thể mất từ vài phút đến vài giờ.\nBấm Enter để bắt đầu (hoặc đóng cửa sổ này để hủy). ",
    confirmWeb: "Một cửa sổ trình duyệt riêng với Zalo Web sẽ mở ra.\nLần đầu: quét mã QR bằng ứng dụng Zalo trên điện thoại. Vui lòng không dùng cửa sổ đó cho đến khi xong.\nBấm Enter để bắt đầu (hoặc đóng cửa sổ này để hủy). ",
    restarting: "Đang khởi động lại Zalo ở chế độ xuất", openingWeb: "Đang mở Zalo Web", waiting: "Đang chờ danh sách trò chuyện",
    hintApp: "Vẫn đang chờ. Nếu Zalo yêu cầu đăng nhập (mã QR hoặc điện thoại), hãy đăng nhập ngay bây giờ.",
    hintWeb: "Vẫn đang chờ. Hãy quét mã QR trong cửa sổ Zalo Web bằng ứng dụng Zalo trên điện thoại.",
    timeout: "Danh sách trò chuyện Zalo không hiện ra trong 10 phút. Hãy đóng mọi thứ và chạy lại công cụ.",
    noBrowser: "Không tìm thấy Chrome hoặc Edge. Hãy cài một trong hai rồi chạy lại công cụ.",
    noZalo: "Không tìm thấy Zalo. Bấm chuột phải vào biểu tượng Zalo > Properties và sao chép đường dẫn ở mục \"Target\".",
    pastePath: "Dán đường dẫn vào đây: ", badPath: "Không có tệp nào ở đường dẫn đó.",
    scanning: "Đang quét danh sách trò chuyện",
    progress: (p, el) => `[${p.i}/${p.n}] ${p.name} ${SYM.dot} ${p.count} tin nhắn${p.back ? ` ${SYM.dot} đã lùi đến ${p.back}` : ""}${p.top ? ` ${SYM.dot} sắp đến đầu` : ""} ${SYM.dot} ${el}`,
    doneChat: (n, c) => `${SYM.ok} ${n} ${SYM.dash} ${c} tin nhắn`,
    skip: { "not-opened": "không mở được (thường do chưa đồng bộ về máy này)", "not-found": "không có trong danh sách",
            dup: "hiện tin nhắn của nhóm khác nên đã bỏ qua", empty: "không có tin nhắn trong khoảng thời gian này", error: "bị lỗi nên đã bỏ qua" },
    finish: (chats, added, total, n) => `${SYM.ok} Xong. Đã đọc ${chats} nhóm, lưu thêm ${added} tin nhắn mới.\n  Kho lưu trữ hiện có ${total} tin nhắn từ ${n} nhóm.`,
    file: "Tệp: ",
    skippedTip: (n) => `${n} nhóm chưa đọc được. Sau khi điện thoại đồng bộ xong, hãy chạy lại công cụ và chọn 3 (hoặc 4 với Zalo Web).`,
    reopening: "Đang mở lại Zalo bình thường", nothing: "Không xuất được gì. Chi tiết:", error: "Có lỗi xảy ra:",
  },
};
let TX = TEXT.en;

// polls the page's progress and draws ONE live line, plus a permanent line for each finished chat
function watchProgress(c) {
  const start = Date.now(); let shown = 0, tick = 0;
  return setInterval(async () => {
    try {
      const p = JSON.parse((await c.evaluate("JSON.stringify(window.__zaloProgress || null)")) || "null");
      if (!p) return;
      for (; shown < p.done.length; shown++) {
        const d = p.done[shown]; clearLine();
        console.log(d.note ? yellow(`${SYM.warn} ${d.name} ${TX.skip[d.note] || d.note}`) : green(TX.doneChat(d.name, d.count)));
      }
      const el = mmss(Date.now() - start);
      const text = p.phase === "scan" || !p.n ? `${TX.scanning}${SYM.ell} ${el}` : TX.progress(p, el);
      if (tty) process.stdout.write("\r\x1b[K" + dim(text.slice(0, (process.stdout.columns || 100) - 1)));
      else if (tick++ % 15 === 0) console.log(text);
    } catch {}
  }, 1000);
}

// ---------- settings + archive (pure file logic) ----------
function loadSettings() {
  let s = {}; try { s = JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf8")); } catch {}
  if (s.chats && !s.state) { s.state = { app: { chats: s.chats, lastRun: s.lastRun } }; delete s.chats; delete s.lastRun; } // older file format
  s.state = s.state || {};
  return s;
}
const saveSettings = (s) => fs.writeFileSync(SETTINGS_FILE, JSON.stringify(s, null, 2));

// merge one export into dir/archive.json: per chat code, messages unique by id, sorted by time
function mergeArchive(dir, out, names) {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "archive.json");
  const arch = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : { chats: {} };
  if (fs.existsSync(file)) fs.copyFileSync(file, path.join(dir, "archive.prev.json")); // one step of undo
  const key = (m) => m.id || `${m.time}|${m.uid}|${m.text}`;
  let added = 0;
  for (const c of out) {
    const map = new Map((arch.chats[c.chat] || []).map((m) => [key(m), m]));
    for (const m of c.messages) { if (!map.has(key(m))) added++; map.set(key(m), m); }
    arch.chats[c.chat] = [...map.values()].sort((a, b) => (a.ts || 0) - (b.ts || 0));
  }
  fs.writeFileSync(file + ".tmp", JSON.stringify(arch));
  fs.renameSync(file + ".tmp", file);
  if (names) { // code -> real name; never let an empty name overwrite a known one
    const nf = path.join(dir, "names_PRIVATE.json");
    const all = fs.existsSync(nf) ? JSON.parse(fs.readFileSync(nf, "utf8")) : {};
    for (const [code, real] of Object.entries(names)) if (real || !(code in all)) all[code] = real;
    fs.writeFileSync(nf, JSON.stringify(all, null, 2));
  }
  return { added, chats: Object.keys(arch.chats).length, total: Object.values(arch.chats).reduce((n, a) => n + a.length, 0) };
}

// ---------- source "app": the Zalo PC app ----------
function zaloLaunch(settings, debugPort) {
  const args = debugPort ? [`--remote-debugging-port=${debugPort}`] : [];
  if (process.platform === "darwin") return { cmd: "open", args: ["-a", "Zalo", ...(debugPort ? ["--args", ...args] : [])] };
  const env = process.env, cands = [];
  if (settings.zaloPath) cands.push(settings.zaloPath);
  const base = path.join(env.LOCALAPPDATA || "", "Programs", "Zalo");
  try { // versioned folders first (Zalo-xx.x.x), newest name first
    fs.readdirSync(base).filter((d) => /^Zalo-/i.test(d)).sort().reverse().forEach((d) => cands.push(path.join(base, d, "Zalo.exe")));
  } catch {}
  cands.push(path.join(base, "Zalo.exe"), path.join(env.ProgramFiles || "", "Zalo", "Zalo.exe"), path.join(env["ProgramFiles(x86)"] || "", "Zalo", "Zalo.exe"));
  const exe = cands.find((p) => p && fs.existsSync(p));
  return exe ? { cmd: exe, args } : null;
}
// Windows: if Zalo is already running, ask Windows where its exe is. That is always the right file.
function runningZaloPath() {
  if (process.platform !== "win32") return null;
  const r = cp.spawnSync("powershell", ["-NoProfile", "-Command", "(Get-Process Zalo -ErrorAction SilentlyContinue | Select-Object -First 1).Path"], { encoding: "utf8" });
  const p = ((r && r.stdout) || "").trim();
  return p && fs.existsSync(p) ? p : null;
}
function quitZalo() {
  if (process.platform === "darwin") {
    cp.spawnSync("osascript", ["-e", 'tell application "Zalo" to quit']);
    cp.spawnSync("pkill", ["-x", "Zalo"]);
  } else {
    cp.spawnSync("taskkill", ["/IM", "Zalo.exe", "/T"]);       // polite first: Zalo may just hide in the tray...
    cp.spawnSync("timeout", ["/T", "4", "/NOBREAK"], { shell: true });
    cp.spawnSync("taskkill", ["/IM", "Zalo.exe", "/T", "/F"]); // ...so make sure
  }
}
function startZalo(settings, debugPort) {
  const l = zaloLaunch(settings, debugPort);
  if (!l) return false;
  cp.spawn(l.cmd, l.args, { detached: true, stdio: "ignore" }).unref();
  return true;
}

// ---------- source "web": our own Chrome/Edge window with its own saved login ----------
function browserLaunch(settings, port) {
  const env = process.env, cands = [];
  if (settings.browserPath) cands.push(settings.browserPath);
  if (process.platform === "darwin") {
    cands.push("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge", "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser");
  } else {
    for (const b of [env.ProgramFiles, env["ProgramFiles(x86)"], env.LOCALAPPDATA]) if (b) cands.push(path.join(b, "Google", "Chrome", "Application", "chrome.exe"));
    for (const b of [env["ProgramFiles(x86)"], env.ProgramFiles]) if (b) cands.push(path.join(b, "Microsoft", "Edge", "Application", "msedge.exe")); // Edge ships with Windows
  }
  const exe = cands.find((p) => p && fs.existsSync(p));
  if (!exe) return null;
  return { cmd: exe, args: [`--remote-debugging-port=${port}`, "--remote-allow-origins=*", `--user-data-dir=${WEB_PROFILE}`,
    "--no-first-run", "--no-default-browser-check", "--window-size=1200,900",
    "--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows", // keep the page fast if the window is covered
    "https://chat.zalo.me"] };
}
function startBrowser(l) {
  const child = cp.spawn(l.cmd, l.args, { stdio: "ignore", detached: process.platform !== "win32" });
  child.unref();
  return child;
}
function stopBrowser(child) {
  if (!child || !child.pid) return;
  if (process.platform === "win32") cp.spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"]);
  else { try { child.kill(); } catch {} }
}

// ---------- Chrome DevTools protocol (works for both sources) ----------
async function connect(port) {
  const targets = await fetch(`http://127.0.0.1:${port}/json`).then((r) => r.json()).catch(() => null);
  if (!targets) throw new Error(`Nothing on port ${port}`);
  const pages = targets.filter((t) => t.type === "page");
  const page = pages.find((x) => /zalo/i.test(x.url + x.title)) || pages[0];
  if (!page) throw new Error("no Zalo page found");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error("WebSocket refused. Zalo may need the extra flag --remote-allow-origins=*")); });
  let id = 0; const pending = new Map();
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id).res(m); pending.delete(m.id); } };
  ws.onclose = () => { for (const p of pending.values()) p.rej(new Error("connection to Zalo closed")); pending.clear(); };
  const evaluate = (expression, awaitPromise = false) => new Promise((res, rej) => {
    const myId = ++id;
    pending.set(myId, { rej, res: (m) => (m.error || (m.result && m.result.exceptionDetails))
      ? rej(new Error(JSON.stringify(m.error || m.result.exceptionDetails.exception || m.result.exceptionDetails)))
      : res(m.result.result.value) });
    ws.send(JSON.stringify({ id: myId, method: "Runtime.evaluate", params: { expression, awaitPromise, returnByValue: true } }));
  });
  return { evaluate, close: () => ws.close() };
}
async function waitReady(port, minutes, hint) { // true once the chat list is on screen (logged in, loaded)
  const start = Date.now(); let told = false;
  while (Date.now() - start < minutes * 60000) {
    try { const c = await connect(port); const n = await c.evaluate("document.querySelectorAll('.conv-item').length"); c.close(); if (n > 0) return true; } catch {}
    if (!told && Date.now() - start > 30000) { console.log(hint); told = true; }
    await sleep(2000);
  }
  return false;
}

// ---------- menu ----------
const MENU = { 1: { source: "app", full: false }, 2: { source: "web", full: false }, 3: { source: "app", full: true }, 4: { source: "web", full: true }, 5: { probe: true } };
async function chooseMode(settings) {
  let source = opt("source", null), full = flag("full"), probe = flag("probe");
  if (!source && !full && !probe && !flag("yes")) {
    const def = settings.lastChoice || "1";
    console.log(`\n${bold(TX.menuTitle)}\n`);
    for (const n of Object.keys(TX.menu)) console.log(`  ${bold(n)}  ${TX.menu[n]}`);
    const pick = (await ask(`\n${TX.choicePrompt(def)}`)) || def;
    if (!MENU[pick]) { console.error(yellow(TX.badChoice)); process.exit(1); }
    settings.lastChoice = pick;
    ({ source = settings.source, full = false, probe = false } = MENU[pick]);
  }
  source = source || settings.source || "app";
  if (!["app", "web"].includes(source)) { console.error('--source must be "app" or "web"'); process.exit(1); }
  settings.source = source;
  return { source, full, probe };
}

// ---------- main ----------
async function main() {
  const settings = loadSettings();
  if (opt("lang", null)) settings.lang = opt("lang");
  if (!settings.lang) settings.lang = flag("yes") ? "en" : (await ask(TEXT.en.askLang)) === "2" ? "vi" : "en";
  TX = TEXT[settings.lang] || TEXT.en;
  const kw = opt("keywords", null);
  if (kw) settings.keywords = kw.split(",").map((s) => s.trim()).filter(Boolean);
  if (!settings.keywords || !settings.keywords.length) {
    console.log(`\n${TX.welcome}\n\n${TX.askKeywords}`);
    settings.keywords = (await ask(TX.keywordsPrompt)).split(",").map((s) => s.trim()).filter(Boolean);
    if (!settings.keywords.length) { console.error(yellow(TX.noKeyword)); process.exit(1); }
  }
  if (!settings.salt) settings.salt = crypto.randomBytes(6).toString("hex"); // secret behind the anonymous codes; keep settings.json
  const mode = await chooseMode(settings);
  const { source, probe } = mode;
  const st = (settings.state[source] = settings.state[source] || { chats: {} });
  const full = mode.full || !Object.keys(st.chats || {}).length; // each source starts with everything it can see
  const port = Number(opt("port", source === "app" ? "9222" : "9223"));
  console.log(`\n${dim(TX.plan(source === "app" ? TX.srcApp : TX.srcWeb, settings.keywords.join(", "), probe ? TX.modeCheck : full ? TX.modeAll : TX.modeNew))}\n`);

  const scriptPath = ["../extension/content.js", "./content.js"].map((p) => path.resolve(__dirname, p)).find(fs.existsSync);
  if (!scriptPath) throw new Error("content.js not found");
  const launch = source === "app" ? zaloLaunch(settings, port) : browserLaunch(settings, port);
  if (flag("dry")) { console.log("(dry run: nothing started)", { source, full, probe, scriptPath, launch, settingsFile: SETTINGS_FILE }); return; }

  if (source === "app") {
    const running = runningZaloPath();
    if (running) settings.zaloPath = running; // refreshed every run, so a Zalo update that moves the folder is fine
    if (!zaloLaunch(settings, port)) {
      console.log(TX.noZalo);
      settings.zaloPath = (await ask(TX.pastePath)).replace(/^"|"$/g, "");
      if (!zaloLaunch(settings, port)) { console.error(red(TX.badPath)); process.exit(1); }
    }
  } else if (!launch) {
    console.error(red(TX.noBrowser));
    process.exit(1);
  }
  saveSettings(settings);

  if (!flag("yes")) {
    await ask(source === "app" ? TX.confirmApp : TX.confirmWeb);
  }

  let restartNeeded = false, browser = null;
  try {
    if (source === "app") { console.log(`${TX.restarting}${SYM.ell}`); quitZalo(); await sleep(3000); restartNeeded = true; startZalo(settings, port); }
    else { console.log(`${TX.openingWeb}${SYM.ell}`); browser = startBrowser(browserLaunch(settings, port)); }
    console.log(`${TX.waiting}${SYM.ell}`);
    if (!(await waitReady(port, 10, source === "app" ? TX.hintApp : TX.hintWeb))) throw new Error(TX.timeout);
    const c = await connect(port);
    await c.evaluate(fs.readFileSync(scriptPath, "utf8"));
    const cfg = { groups: settings.keywords, anon: true, salt: settings.salt, returnOnly: true, lang: settings.lang, since: full ? {} : st.chats };

    if (probe) {
      await c.evaluate(`window.__zaloExporterApi.probe(${JSON.stringify(cfg)}).then(() => 1)`, true);
      console.log(await c.evaluate("window.__zaloReport"));
      c.close(); return;
    }
    const timer = watchProgress(c);
    let json;
    try { json = await c.evaluate(`window.__zaloExporterApi.run(${JSON.stringify(cfg)}).then((r) => JSON.stringify(r))`, true); }
    finally { clearInterval(timer); clearLine(); }
    const report = await c.evaluate("window.__zaloReport").catch(() => "");
    c.close();
    if (!json || json === "undefined") { console.error(`${yellow(TX.nothing)}\n${report}`); return; }
    if (flag("verbose")) console.log(report);
    const { out, names, keys, skipped } = JSON.parse(json);
    const r = mergeArchive(ARCHIVE_DIR, out, names);
    st.chats = st.chats || {};
    for (const [k, ts] of Object.entries(keys || {})) st.chats[k] = Math.max(st.chats[k] || 0, ts);
    st.lastRun = new Date().toISOString();
    saveSettings(settings);
    console.log(`\n${green(TX.finish(out.length, r.added, r.total, r.chats))}\n  ${TX.file}${path.join(ARCHIVE_DIR, "archive.json")}`);
    if (skipped && skipped.length) console.log(`\n${yellow(TX.skippedTip(skipped.length))}`);
  } finally {
    stopBrowser(browser);
    if (restartNeeded && !flag("no-restart")) { console.log(`${TX.reopening}${SYM.ell}`); quitZalo(); await sleep(3000); startZalo(settings, 0); }
  }
}

module.exports = { mergeArchive, zaloLaunch, runningZaloPath, browserLaunch, loadSettings, TEXT, watchProgress };
if (require.main === module) main().catch((e) => { clearLine(); console.error(`\n${red(TX.error)} ${e.message}`); process.exit(1); });
