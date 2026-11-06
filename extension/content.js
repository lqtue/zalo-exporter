// Runs on chat.zalo.me. Finds the chat list and message pane STRUCTURALLY (scrollable lists and
// their child rows) instead of by class names, which Zalo changes. Use "Test selectors" to check.
(() => {
  if (window.__zaloExporter) return;
  window.__zaloExporter = true;

  // only used to LOCATE the chat list; message fields are parsed in parseItem()
  const SEL = { conv: '.conv-item, [class*="conv-item"], [class*="conversation-item"]' };
  const PAUSE_MS = 1200;   // wait after each scroll step; raise on slow network
  const STALL_LIMIT = 6;   // stop a chat after this many rounds with nothing new
  const MAX_ROUNDS = 1500; // hard cap per chat

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const norm = (s) => (s || "").toLowerCase().normalize("NFD")
    .replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/\s+/g, " ").trim(); // also collapses repeated spaces in keywords
  const q = (root, sel) => Array.from(root.querySelectorAll(sel));
  const first = (n, sel) => { const e = n.querySelector(sel); return e ? e.innerText.trim() : ""; };
  const isScroller = (e) => {
    const o = getComputedStyle(e).overflowY;
    return (o === "auto" || o === "scroll") && e.scrollHeight > e.clientHeight + 5;
  };
  const scrollParent = (el) => {
    for (let p = el && el.parentElement; p; p = p.parentElement) if (isScroller(p)) return p;
    return null;
  };
  const desc = (e) => `${e.tagName.toLowerCase()}${e.id ? "#" + e.id : ""}.${String(e.className).trim().split(/\s+/).slice(0, 3).join(".")}`;
  // rows of a scroller = children of the first node that has more than one child
  const rowsOf = (box) => {
    let el = box;
    while (el && el.children.length === 1) el = el.children[0];
    return el ? Array.from(el.children).filter((r) => r.innerText.trim()) : [];
  };
  const findSidebar = () => scrollParent(q(document, SEL.conv)[0]);
  // message pane = largest scroller that is not the sidebar and doesn't wrap it
  const findPane = (side) => scrollParent(document.querySelector("#messageViewScroll")) || q(document, "div").filter(isScroller)
    .filter((s) => s !== side && !s.contains(side) && !side.contains(s) && !/trigger/.test(String(s.className)))
    .sort((a, b) => b.clientWidth * b.clientHeight - a.clientWidth * a.clientHeight)[0] || null;
  const nameOf = (row) => {
    const e = row.querySelector(".conv-item-title__name"); // Zalo's title node; fall back to first text line
    return (e ? e.innerText : row.innerText.split("\n")[0]).replace(/\s+/g, " ").trim();
  };
  const clickRow = (row) => {
    const r = row.getBoundingClientRect();
    const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    (t && row.contains(t) ? t : row.querySelector('[class*="conv-item"]') || row).click();
  };

  // one Zalo message bubble -> record. Fields come from structure seen in real reports:
  //  - id "bb_msg_id_<epoch ms>"  -> exact time + ordering
  //  - data-qid "msgId@ms_<senderUid>_<groupId>" -> sender id even when no name/avatar is shown
  //  - data-id "div_ReceivedMsg_Text|Photo|..." (Sent... for own messages) -> direction + type
  //  - [data-component=text-container] -> the real text (the rest of the bubble has hover emoji bar, send time)
  function parseItem(n) {
    const m = n.querySelector('[id^="bb_msg_id_"]');
    const id = m ? m.id.replace("bb_msg_id_", "") : "";
    const ts = /^\d{12,}$/.test(id) ? Number(id) : 0;
    const qe = n.querySelector("[data-qid]"), av = n.querySelector("img[data-ava-uid]");
    const uid = qe ? (qe.getAttribute("data-qid").split("_")[1] || "") : av ? av.getAttribute("data-ava-uid") : "";
    const d = n.querySelector('[data-id*="ReceivedMsg_"], [data-id*="SentMsg_"]'); // also LastReceivedMsg_/LastSentMsg_
    const mm = d && /^div_(?:Last)?(Received|Sent)Msg_(.+)$/.exec(d.getAttribute("data-id"));
    // the message being replied to: sender name (title) and its text are separate nodes
    let quote = "", quoteFrom = "";
    const qt = n.querySelector('[class*="message-quote-fragment__content-container"]');
    if (qt) {
      const c = qt.cloneNode(true), t = c.querySelector('[class*="message-quote-fragment__title"]');
      if (t) { quoteFrom = t.textContent.replace(/\s+/g, " ").trim(); t.remove(); }
      quote = c.textContent.replace(/\s+/g, " ").trim();
    }
    return {
      id, ts,
      time: ts ? new Date(ts).toLocaleString("sv-SE") : "", // local time, "2026-10-31 10:07:02"
      sender: first(n, '[class~="message-sender-name-content"]').replace(/\s+/g, " "), // same node in both layouts seen
      uid,
      dir: mm ? (mm[1] === "Sent" ? "out" : "in") : "",
      kind: mm ? mm[2] : "",
      quote, quoteFrom,
      text: q(n, '[data-component="text-container"]').map((e) => e.textContent.replace(/\s+/g, " ").trim()).filter(Boolean).join("\n"),
    };
  }

  // ---- status panel (bottom-right) ----
  let stop = false, report = "";
  const panel = document.createElement("div");
  panel.style.cssText = "position:fixed;right:16px;bottom:16px;z-index:99999;width:340px;max-height:320px;overflow:auto;background:#fff;color:#1f2933;" +
    "border-radius:10px;padding:12px 14px;font:13px/1.4 system-ui,sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.28);display:none";
  const el = (css, text) => { const d = document.createElement("div"); d.style.cssText = css; if (text) d.textContent = text; return d; };
  const titleEl = el("font-weight:700;font-size:14px", "Zalo Exporter");
  const bannerEl = el("display:none;margin:6px 0;padding:6px 8px;border-radius:6px;background:#fef3c7;color:#92400e;font-size:12px");
  const statusEl = el("font-weight:600;margin:6px 0");
  const logEl = document.createElement("pre");
  logEl.style.cssText = "white-space:pre-wrap;margin:0 0 8px;word-break:break-all;font:11px/1.4 ui-monospace,monospace;color:#52606d;max-height:110px;overflow:auto";
  const mkBtn = (t, f, primary) => {
    const b = document.createElement("button"); b.textContent = t; b.onclick = f;
    b.style.cssText = "margin-right:6px;padding:4px 10px;border-radius:6px;cursor:pointer;font:12px system-ui;" +
      (primary ? "border:0;background:#dc2626;color:#fff" : "border:1px solid #cbd2d9;background:#fff;color:#323f4b");
    return b;
  };
  panel.append(titleEl, bannerEl, statusEl, logEl,
    mkBtn("Stop & save", () => { stop = true; log("stopping: files will contain what is collected so far; remaining chats are skipped"); }, true),
    mkBtn("Copy report", () => navigator.clipboard.writeText(report)),
    mkBtn("Hide", () => (panel.style.display = "none")));
  document.body.appendChild(panel);
  function log(s) {
    panel.style.display = "block";
    report += s + "\n";
    window.__zaloReport = report;
    logEl.textContent = report.split("\n").slice(-10).map((l) => l.slice(0, 140)).join("\n");
    console.log("[zalo-export]", s);
  }

  const setStatus = (t) => { panel.style.display = "block"; statusEl.textContent = t; window.__zaloStatus = t; };

  // scroll the chat list until a chat whose name matches a keyword is found, click it
  async function openFirst(side, wanted) {
    side.scrollTop = 0; await sleep(500);
    for (let i = 0; i < 60; i++) {
      const row = rowsOf(side).find((r) => wanted.length ? wanted.some((w) => norm(nameOf(r)).includes(w)) : nameOf(r) !== "My Documents");
      if (row) { clickRow(row); await sleep(2000); return nameOf(row); }
      const before = side.scrollTop;
      side.scrollTop += side.clientHeight * 0.8; await sleep(700);
      if (side.scrollTop === before) break;
    }
    return null;
  }

  // ---- probe: dump structure so selectors/parsing can be tuned ----
  async function probe(cfg) {
    report = "";
    const side = findSidebar();
    log(`sidebar: ${side ? "found " + desc(side) : "NOT found"}`);
    if (!side) return;
    const sRows = rowsOf(side);
    log(`sidebar rows: ${sRows.length}`);
    sRows.slice(0, 5).forEach((r, i) => log(` row${i}: ${nameOf(r)}`));
    if (sRows[2]) report += `sidebar row2 HTML: ${sRows[2].outerHTML.slice(0, 1500)}\n`;

    let pane = findPane(side);
    if (!pane) {
      const opened = await openFirst(side, cfg.groups.map(norm));
      log(opened ? `opened chat: ${opened}` : "no chat matches the keywords in the chat list");
      pane = findPane(side);
    }
    log(`message pane: ${pane ? "found " + desc(pane) + ` ${pane.clientWidth}x${pane.clientHeight}, scrollHeight ${pane.scrollHeight}` : "NOT found (open a chat first)"}`);
    q(document, "div").filter(isScroller).forEach((s) =>
      (report += `scroller: ${desc(s)} ${s.clientWidth}x${s.clientHeight} scrollH=${s.scrollHeight} top=${s.scrollTop}\n`));
    const ids = q(document, "[id]").filter((e) => /mess|chat|conv|frame|body/i.test(e.id))
      .map((e) => `${e.tagName.toLowerCase()}#${e.id}${isScroller(e) ? "(scroller)" : ""} ${e.clientWidth}x${e.clientHeight}`);
    report += `ids: ${ids.slice(0, 40).join(" ; ")}\n`;
    if (!pane) return log("No message pane: open a chat that has MANY messages (more than one screen), then run the test again.");
    const items = q(pane, ".chat-item");
    log(`message items (.chat-item): ${items.length}`);
    [items[0], items[items.length - 2], items[items.length - 1]].filter(Boolean).forEach((n) => {
      report += `parsed: ${JSON.stringify(parseItem(n))}\n`;
      report += `chat-item HTML: ${n.outerHTML.slice(0, 1800)}\n`;
    });
    // header lives outside the pane: summarise the ancestors' children
    let a = pane;
    for (let i = 0; i < 4 && a.parentElement; i++) {
      a = a.parentElement;
      report += `ancestor${i + 1} ${desc(a)} children: ${Array.from(a.children).map((c) => desc(c) + ":" + c.innerText.trim().slice(0, 30).replace(/\n/g, "/")).join(" || ").slice(0, 600)}\n`;
    }
    log("Probe done. Click 'Copy report' and send it.");
  }

  // ---- export one open chat: step upward through the whole history, dedupe by message id ----
  // fromMs/toMs: optional date range (epoch ms). Scrolling stops once a message older than fromMs is seen.
  async function exportOpenChat(side, label, fromMs, toMs) {
    const pane = findPane(side);
    if (!pane) { log("no message pane found"); return []; }
    const byId = new Map(), loose = [], looseSeen = new WeakSet();
    let stall = 0, minTs = Infinity;
    for (let r = 0; r < MAX_ROUNDS && stall < STALL_LIMIT && !stop; r++) {
      let fresh = 0;
      for (const n of q(pane, ".chat-item")) {
        const rec = parseItem(n);
        if (rec.id) { if (!byId.has(rec.id)) { byId.set(rec.id, rec); fresh++; if (rec.ts) minTs = Math.min(minTs, rec.ts); } }
        else if (!looseSeen.has(n)) { looseSeen.add(n); loose.push(rec); fresh++; }
      }
      if (fromMs && minTs < fromMs) break; // everything in the range is already collected
      // step up by ~80% of a screen so nothing between pages is skipped; only count stalls once at the very top
      const atTop = pane.scrollTop <= 1;
      // if every captured message is still in the page, nothing sits between us and the top: jump there
      const allInDom = q(pane, ".chat-item").length >= byId.size + loose.length;
      pane.scrollTop = allInDom && fresh === 0 ? 0 : Math.max(0, pane.scrollTop - pane.clientHeight * 0.8);
      pane.dispatchEvent(new WheelEvent("wheel", { deltaY: -400, bubbles: true }));
      await sleep(PAUSE_MS);
      stall = fresh === 0 && atTop ? stall + 1 : 0;
      Object.assign(window.__zaloProgress || {}, { count: byId.size + loose.length, top: atTop, back: minTs < Infinity ? new Date(minTs).toLocaleDateString("sv-SE") : "" });
      setStatus(`${label}: ${byId.size + loose.length} messages` +
        (minTs < Infinity ? `, back to ${new Date(minTs).toLocaleDateString("sv-SE")}` : "") +
        (atTop ? ` - at the top, waiting for older ones (${stall}/${STALL_LIMIT})` : " - scrolling up"));
    }
    let out = [...byId.values()].sort((x, y) => x.ts - y.ts).concat(loose);
    // bubbles in a run may omit the name; the avatar id (uid) is the same person, so fill names by uid
    const nameOfUid = {};
    out.forEach((m) => { if (m.uid && m.sender) nameOfUid[m.uid] = m.sender; });
    out.forEach((m) => { if (!m.sender && m.uid) m.sender = nameOfUid[m.uid] || ""; });
    return out.filter((m) => !m.ts || (m.ts >= fromMs && m.ts <= toMs));
  }

  // ---- anonymise: codes are hash(secret|id), so the same chat/person gets the same code on every run ----
  // (web or PC app, any week). Returns {code: real name} for the private map file.
  async function anonymise(out, salt) {
    const names = {}, memo = {};
    const code = async (prefix, key, real) => {
      const k = prefix + "|" + key;
      if (!memo[k]) {
        const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${salt}|${k}`));
        memo[k] = prefix + Array.from(new Uint8Array(buf).slice(0, 4), (b) => b.toString(16).padStart(2, "0")).join("");
      }
      if (real || !(memo[k] in names)) names[memo[k]] = real || "";
      return memo[k];
    };
    for (const c of out) {
      const cid = await code("C", c.chatId || c.chat, c.chat);
      const uidOfName = {}; // display name -> user id (within this chat), so a person keeps one code
      c.messages.forEach((m) => { if (m.sender && m.uid) uidOfName[m.sender] = m.uid; });
      // longest names first so "Chi Lan" is replaced before "Lan"
      const list = [c.chat, ...new Set(c.messages.flatMap((m) => [m.sender, m.quoteFrom]).filter(Boolean))].sort((x, y) => y.length - x.length);
      const codeOf = {};
      for (const n of list) codeOf[n] = n === c.chat ? cid : await code("U", uidOfName[n] || "name:" + n, n);
      for (const m of c.messages) {
        if (m.uid) m.uid = await code("U", m.uid, "");
        if (m.sender) m.sender = codeOf[m.sender];
        if (m.quoteFrom) m.quoteFrom = codeOf[m.quoteFrom];
        for (const n of list) {
          if (n.length < 2) continue;
          m.text = m.text.split(n).join(codeOf[n]);
          m.quote = (m.quote || "").split(n).join(codeOf[n]);
        }
      }
      c.chat = cid; delete c.chatId;
    }
    return names;
  }

  const save = (data, name, type) => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([data], { type: type + ";charset=utf-8" }));
    a.download = name; document.body.appendChild(a); a.click(); a.remove();
  };

  const keyOf = (row) => row.getAttribute("anim-data-id") || nameOf(row); // Zalo's own conversation id; name only as fallback
  // signature of the open chat = id of its newest message; changes when another chat is shown
  const sigOf = (side) => {
    const pane = findPane(side), it = pane ? q(pane, ".chat-item") : [];
    const m = it.length && it[it.length - 1].querySelector('[id^="bb_msg_id_"]');
    return m ? m.id : "";
  };

  // thread id of the open chat = last part of "msgId@ms_senderUid_threadId" on its newest message
  const threadOf = (side) => {
    const pane = findPane(side), qs = pane ? q(pane, "[data-qid]") : [];
    return qs.length ? qs[qs.length - 1].getAttribute("data-qid").split("_").pop() : "";
  };

  // phase 1: scroll the whole chat list (it lazy-loads) and remember every chat; nothing is opened yet
  async function listChats(side) {
    const found = new Map();
    side.scrollTop = 0; await sleep(800);
    for (let stall = 0; stall < 3 && !stop;) {
      const h = side.scrollHeight, before = side.scrollTop;
      for (const row of rowsOf(side)) { const k = keyOf(row); if (nameOf(row) && !found.has(k)) found.set(k, nameOf(row)); }
      side.scrollTop = before + side.clientHeight * 0.8; await sleep(900);
      const moved = side.scrollTop !== before || side.scrollHeight > h;
      if (!moved) await sleep(1500); // at the bottom Zalo may still be loading more chats
      stall = moved || side.scrollHeight > h ? 0 : stall + 1;
    }
    return [...found].map(([key, name]) => ({ key, name }));
  }
  // phase 2: find the row again (fresh DOM, never a stale one) and click it
  async function openByKey(side, key) {
    side.scrollTop = 0; await sleep(600);
    for (let i = 0; i < 120; i++) {
      const row = rowsOf(side).find((r) => keyOf(r) === key);
      if (row) {
        row.scrollIntoView({ block: "center" }); await sleep(500); // virtual list: make sure the row is really on screen
        clickRow(rowsOf(side).find((r) => keyOf(r) === key) || row);
        return true;
      }
      const before = side.scrollTop;
      side.scrollTop += side.clientHeight * 0.8; await sleep(600);
      if (side.scrollTop === before) break;
    }
    return false;
  }

  async function run(cfg) {
    stop = false; report = "";
    const wanted = cfg.groups.map(norm), out = [];
    const fromMs = cfg.from ? new Date(cfg.from + "T00:00:00").getTime() : 0;
    const toMs = cfg.to ? new Date(cfg.to + "T23:59:59.999").getTime() : Infinity;
    if (cfg.anon && !cfg.salt) return log("Anonymise needs a secret code word (popup, or --salt for the runner).");
    if (fromMs || cfg.to) log(`date range: ${cfg.from || "start"} to ${cfg.to || "now"}`);
    window.__zaloOut = out; // if the tab dies: copy(JSON.stringify(window.__zaloOut)) in the console
    const side = findSidebar();
    if (!side) return log("chat list not found: run 'Test selectors'");
    log("scanning the chat list...");
    const all = await listChats(side);
    const todo = all.filter((c) => !wanted.length || wanted.some((w) => norm(c.name).includes(w)));
    log(`${all.length} chats in the list, ${todo.length} match ${JSON.stringify(cfg.groups)}`);
    todo.forEach((c) => (report += `  - ${c.name}\n`));
    if (!todo.length) return log(`no chat matched. Chats seen: ${all.slice(0, 15).map((c) => c.name).join(" | ")}`);

    const prog = window.__zaloProgress = { phase: "scan", i: 0, n: 0, name: "", count: 0, back: "", top: false, done: [] };
    bannerEl.style.display = "block";
    bannerEl.textContent = cfg.lang === "vi" ? "Zalo Exporter đang chạy. Vui lòng không bấm vào cửa sổ này." : "Zalo Exporter is working. Please don't click in this window.";
    const since = cfg.since || {}, keys = {}; // keys: chat key -> newest message time exported (for the next incremental run)
    prog.phase = "export"; prog.n = todo.length;
    const skipped = []; // chats that could not be exported; rerun after the sync finishes (re-runs are safe, files are merged by message id)
    const firstIds = new Map(); // oldest message id -> chat, to catch a click that didn't switch chats
    for (const [i, c] of todo.entries()) {
      if (stop) break;
      try {
        Object.assign(prog, { i: i + 1, name: c.name, count: 0, back: "", top: false });
      const prev = sigOf(side), verify = c.key !== c.name; // rows without an id can only be checked by "pane changed"
        let opened = false, found = true;
        for (let attempt = 0; attempt < 2 && !opened && found; attempt++) {
          found = await openByKey(side, c.key);
          for (let t = 0; found && t < 12 && !opened; t++) {
            await sleep(500);
            opened = verify ? threadOf(side) === c.key : sigOf(side) !== prev;
          }
        }
        if (!found) { prog.done.push({ name: c.name, count: 0, note: "not-found" }); skipped.push(c.name); log(`[${i + 1}/${todo.length}] could not find in list: ${c.name}`); continue; }
        if (!opened) { prog.done.push({ name: c.name, count: 0, note: "not-opened" }); skipped.push(c.name); log(`[${i + 1}/${todo.length}] no messages shown after opening (not synced to this computer yet?): ${c.name}`); continue; }
        log(`[${i + 1}/${todo.length}] exporting: ${c.name}`);
        const fromThis = since[c.key] ? Math.max(fromMs, since[c.key] - 172800000) : fromMs;
        const messages = await exportOpenChat(side, `[${i + 1}/${todo.length}] ${c.name}`, fromThis, toMs);
        const dup = messages.length && messages[0].id && firstIds.get(messages[0].id);
        if (dup) { prog.done.push({ name: c.name, count: 0, note: "dup" }); log(` -> identical to "${dup}": the chat did not switch, skipped`); continue; }
        if (!messages.length) { prog.done.push({ name: c.name, count: 0, note: "empty" }); log(" -> no messages in the date range, skipped"); continue; }
        if (messages[0].id) firstIds.set(messages[0].id, c.name);
        out.push({ chat: c.name, chatId: c.key, count: messages.length, messages });
        const newest = messages.reduce((a, m) => Math.max(a, m.ts || 0), 0);
        if (newest) keys[c.key] = newest;
        prog.done.push({ name: c.name, count: messages.length, note: "" });
        log(` -> ${messages.length} messages (${out.length} chats done)`);
      } catch (e) {
        prog.done.push({ name: c.name, count: 0, note: "error" });
        log(`!! error on "${c.name}": ${e && e.message}. Continuing with the next chat.`);
        console.error(e);
      }
    }
    if (skipped.length) log(`NOT exported (${skipped.length}): ${skipped.join(" | ")}`);
    if (!out.length) return log("nothing exported");

    const names = cfg.anon ? await anonymise(out, cfg.salt) : null;
    const total = out.reduce((n, c) => n + c.count, 0);
    if (cfg.returnOnly) { setStatus("Done."); log(`DONE: ${out.length} chats, ${total} messages.`); return { out, names, keys, skipped }; }

    const stamp = new Date().toLocaleString("sv-SE").slice(0, 16).replace(/[: ]/g, "-"); // 2026-11-06-18-08
    if (names) {
      save(JSON.stringify(names, null, 2), `zalo_names_PRIVATE_${stamp}.json`, "application/json");
      log("Saved zalo_names_PRIVATE: keep it on this computer, do not share.");
    }
    save(JSON.stringify(out, null, 2), `zalo_export_${stamp}.json`, "application/json");
    save(out.map((c) => `=== ${c.chat} ===\n` + c.messages.map((m) =>
      `[${m.time}] ${m.dir === "out" ? "(me)" : m.sender || m.uid}: ${m.text || `[${m.kind || "media"}]`}${m.quote ? `  (reply to ${m.quoteFrom || "?"}: ${m.quote.length > 80 ? m.quote.slice(0, 80) + "..." : m.quote})` : ""}`).join("\n")).join("\n\n"),
      `zalo_export_${stamp}.txt`, "text/plain");
    setStatus("Done.");
    log(`DONE: ${out.length} chats, ${total} messages. Files are in Downloads.`);
    return { out, names, keys, skipped };
  }

  window.__zaloExporterApi = { run, probe }; // used by the PC-app runner (pc-backfill/run.js)

  if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((m, _s, reply) => {
      reply(true);
      if (m.cmd === "probe") probe(m.cfg).catch((e) => log(`!! probe failed: ${e && e.message}`));
      if (m.cmd === "export") run(m.cfg).catch((e) => log(`!! stopped: ${e && e.message}`));
    });
  }
})();
