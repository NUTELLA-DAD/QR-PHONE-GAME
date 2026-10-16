# Lessons learned: the Airship Crew build (Oct 2026)

These are the plain-words version, for the owner. The reusable playbook for future games is a Claude skill called `game-build-playbook`, in `~/.claude/skills/game-build-playbook/`. Claude uses it automatically when you start a new game.

## What went well
- **Plans first, then builders.** Every big area got a plan document before any code: 3D, structure, the game loop, the castle, the bosses, the fun review and playtest 1. Each plan was split into small jobs, one helper per job. About 120 jobs landed with almost nothing broken.
- **Safety nets for every change.** Each new rule could be switched off, and a fixed set of test voyages had to give exactly the same result as before. That caught dozens of mistakes before they reached you.
- **Checking pictures, not just reports.** Looking at the screenshots caught the jank Titan arms, the cheap sketch replay, the overlapping labels and a stray circle over the gauges.
- **Honest numbers.** When something didn't work (the raft can't be won yet, the finale got too easy), we said so and fixed it or made it optional.

## What we'd do differently
1. **Playtest with real people much earlier.** Weeks of bot tests never showed the real problems your first playtest found in one evening:
   - you couldn't find yourself;
   - you couldn't grab things or climb ladders;
   - the phone buzzed constantly;
   - every voyage opened the same way.
   Next time: a rough playable version in days, then people, then content.
2. **Build the core fantasy first.** "We build our ship from scraps" was the dream, but it was added late as a side system on top of a ship that came finished. Next time the starting state should *be* the fantasy: the tiny raft from day one.
3. **Readability is a feature, not polish.** Big name tags in your colour, FIND ME, one clear button for the thing in front of you, ladders that catch you, one message at a time and no buzzing should all come before bosses and castles.
4. **Test what players actually get.** For days the tests used the big classic ship while players started on the Sparrow, so the numbers described a game nobody played.
5. **Show concepts before big art.** The Titan was rebuilt twice. Next time: three quick sketches, you pick one, then it gets built.
6. **Bots aren't people.** They're great for "did we break anything?" but poor at "is this fun?". Their win rates were a hint, never the answer.
7. **Housekeeping matters on a long build.** Test tools filled the disk with temporary browser folders, and some tests broke only because the computer was busy. Both are now fixed, and they belong in the playbook from day one.

## Still open on this game (when you say "keep going")
- Balance the raft until it's winnable (about 1 in 3 voyages), then decide whether it becomes the default start.
- Move the Sparrow's lower-deck extinguisher away from the ladder foot.
- Playtest 2 using the script in `PLAYTEST1.md`.
