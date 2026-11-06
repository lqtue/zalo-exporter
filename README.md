# Zalo Exporter

**English** · [Tiếng Việt](README.vi.md)

Saves the messages of the Zalo groups you choose on **your own computer**, from the **Zalo PC app** or from **Zalo Web**, so you can see which questions come up most often and build reports. Works on **Windows and Mac**. **Nothing to install.**

## Start

| Computer | Unzip the right zip, then double-click |
|---|---|
| Windows | `Export.bat` |
| Mac | `Export.command` (first time: right-click → Open) |

A window asks a few things **once** (language, part of the group names) and then shows a menu:

```
1  Get NEW messages from the Zalo PC app       (the first time: everything it has)
2  Get NEW messages from Zalo Web               (about the last 14 days only)
3  Read ALL history again from the PC app        (once, after the phone sync has finished)
4  Read ALL available messages again from Zalo Web
5  Check that the tool can see Zalo              (nothing is exported)
```

Press Enter to repeat your last choice. While it runs, one line shows the progress, and a ✓ line appears for every finished group. At the end you get a summary and the place of the file.

## Which source should I use?

- **Zalo PC app (1 and 3):** the complete history, but only what the PC app has already synced from your phone. The tool closes Zalo, reopens it in export mode, and reopens it normally at the end. **Do not use Zalo while it runs.**
- **Zalo Web (2 and 4):** only about the last 14 days. It opens its **own** Chrome or Edge window, so your normal browser is not touched. First time: scan the QR code with the Zalo app on your phone; the login is remembered in the `web-profile` folder.
- Both write into the **same archive** and never save a message twice, so you can mix them.

## Every week or two

Run it again and press Enter. It reads only **new** messages (a few minutes). Once, after the phone sync has finished, choose **3** to read everything again.

## Where the results are

| File | What it is |
|---|---|
| `archive/archive.json` | All messages, grouped by chat, no duplicates. |
| `archive/names_PRIVATE.json` | The real names behind the anonymous codes. **Keep on this computer. Do not send.** |
| `settings.json` | Your language, group names and the secret behind the codes. **Do not delete**, or the codes change. |
| `web-profile/` | The saved Zalo Web login (Web mode only). Keep private. |

## Privacy and risks

- Parent and child names are replaced by codes (`C…` for chats, `U…` for people). A name written **inside** a message (a first name, a nickname) is **not** hidden. Treat all files as sensitive and get the parents' consent before analysing their messages.
- The tool reads Zalo's screen the way a person would. It is unofficial; Zalo can change its app and break it, and automation may not comply with Zalo's terms. Use at your own risk.
- In PC-app mode Zalo has a local "debug port" open while the tool runs, which lets other programs on this computer control it. That is why Zalo is reopened normally at the end.

## If something goes wrong

- Choose **5** (check) and send the whole window text to the developer.
- A line such as `! <group> could not be opened (usually: not synced to this computer yet)` means that group's messages are not on this computer yet. After the phone sync has finished, run again and choose 3.
- **Windows** can warn about running a downloaded `.bat`: choose "Run anyway" or right-click the zip → Properties → Unblock before unzipping.
- **Mac** can block the first launch: right-click `Export.command` → Open → Open. Or run `xattr -dr com.apple.quarantine <folder>` in Terminal.
- Zalo not found (Windows): the tool asks once for the path (right-click the Zalo shortcut → Properties → copy **Target**).

## For the developer

| Path | Purpose |
|---|---|
| `Export.bat` / `Export.command` | Launchers; run the bundled Node on `pc-backfill/export.js`. |
| `pc-backfill/export.js` | Menu, language, settings, restarts Zalo (or opens its own Chrome/Edge profile) with a debug port, attaches over the Chrome DevTools protocol, runs `content.js`, merges into the archive. Node 22+, no packages. |
| `extension/content.js` | The scraper: lists chats, opens each match, scrolls up, parses messages, anonymises. The same file also works as a Chrome/Edge extension (`extension/` → Load unpacked) as a manual fallback. |
| `tools/` | Official Node 22 binaries (Windows x64; Mac arm64 and x64) so nothing needs installing. |

Flags for `export.js`: `--source app|web`, `--full`, `--probe`, `--yes` (no prompts), `--keywords "a,b"`, `--lang en|vi`, `--port N`, `--no-restart`, `--verbose`, `--dry`. Optional keys in `settings.json`: `zaloPath`, `browserPath`.

**Build a release** (Node binaries are not in git): `scripts/build-release.sh` downloads Node 22 with checksum verification and writes `dist/ZaloExporter-windows.zip` and `dist/ZaloExporter-mac.zip`. For development just run `node pc-backfill/export.js`.

**Never commit exports.** `.gitignore` already excludes `backfill/`, `archive/`, `web-profile/` and `settings.json`; they contain private chat data, the secret behind the anonymous codes, and a saved Zalo login.
