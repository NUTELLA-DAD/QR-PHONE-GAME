# Airship Crew - notes for Claude Code

Co-op party game in the style of Lovers in a Dangerous Spacetime, set on a WW1/WW2-era airship.
One shared host screen (TV/laptop browser) runs the game; up to 16 players join by scanning a QR code
and use their phone browser as the controller. The roadmap is in **PLAN.md**. Work through it in order.

## The user
- Not a programmer. Explain changes in plain language and give exact, simple test steps.
- Run all terminal commands yourself (npm, git, node). Never ask the user to type commands.
- The user launches the game by double-clicking `start.bat` (Windows). Keep that working at all times.

## Usage and money - IMPORTANT
- If you hit a usage limit, or any action would need extra paid usage, STOP and ask the user first.
- Assume the answer is NO unless the user explicitly says yes in the current conversation.
- Keep usage low: do one task from PLAN.md at a time, read only the files you need, and avoid
  rewriting whole files when a targeted edit will do.

## Architecture rules
- Node + Express + Socket.IO server (`server.js`) only relays messages and assigns identity/colours.
- The HOST browser is authoritative: it runs the simulation. Phones send inputs only.
- No external CDNs or web fonts loaded from the internet: venues may have no internet. Bundle assets locally.
- Phones: big touch targets, `touch-action: none`, no long-press menus, auto-reconnect via saved token.
- Factions are fictional. Never use real national insignia.

## How to work
- For each task: say what you will change, make the change, run the server and check for errors,
  then summarise what changed and how the user can test it.
- Commit to git after each working step with a clear message, so anything can be rolled back.
- Use the bots for solo testing (button "Add 4 bot crew"); extend them when new systems need testing.
- Keep tunable numbers (damage, speeds, timers) in one config file.
