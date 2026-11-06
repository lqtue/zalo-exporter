const $ = (id) => document.getElementById(id);
const saved = JSON.parse(localStorage.getItem("cfg") || "null");
if (saved) { $("groups").value = saved.groups.join("\n"); $("anon").checked = saved.anon; $("from").value = saved.from || ""; $("to").value = saved.to || ""; }
if (!localStorage.getItem("salt")) localStorage.setItem("salt", Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => b.toString(16).padStart(2, "0")).join(""));
$("salt").value = localStorage.getItem("salt");
function send(cmd) {
  localStorage.setItem("salt", $("salt").value.trim());
  const cfg = { groups: $("groups").value.split("\n").map((s) => s.trim()).filter(Boolean),
                anon: $("anon").checked, salt: $("salt").value.trim(), from: $("from").value, to: $("to").value };
  localStorage.setItem("cfg", JSON.stringify(cfg));
  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    chrome.tabs.sendMessage(tab.id, { cmd, cfg }, () => {
      if (chrome.runtime.lastError) alert("Open chat.zalo.me in this tab and reload it (F5), then try again.");
      else window.close();
    });
  });
}
$("probe").onclick = () => send("probe");
$("run").onclick = () => send("export");
