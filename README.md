# Hearth Guild

Your household is a guild. Chores are attacks on a weekly boss. A teammate checks each one, the boss loses HP, and the resources you earn build your village. Beat the boss by Sunday for the loot chest; let it escape and it burns a decoration (never a house).

**Live app:** https://yaswi-clubs.github.io/hearth-guild/

This is the **Stage 1** build: one household, on everyone's phones, hosted free on GitHub Pages with Firebase (project hearth-guild-524ae, London) keeping the household in sync.

## What's in it

- Guild setup: name, up to 6 members (adult or kid, own colour), starter quests
- Quests with effort points 1–8 (damage = points × 10), times per week, who usually does it, and one-off to-dos
- Peer approval: you tap **Attack**, a different member taps **Approve**. Only then does the boss take damage
- Weekly boss whose HP = all of the week's quests. Six bosses rotate
- Isometric village: build 4 guild buildings, upgrade the Guild Hall and each member's house (3 levels)
- Sunday reveal: loot on a win, a burnt garden on a loss. The week also closes by itself when Monday comes
- Pilot log (⚙ → Pilot log): quests done, damage and result per week, to compare with the fridge-pilot baseline
- Optional PIN per member so kids can't play as someone else on a shared device
- Installs to the home screen and opens offline (PWA)

Adults can add/edit quests, upgrade the Guild Hall and end the week. Kids can attack, approve, build and upgrade houses.

## Two modes

| Mode | When | Data lives |
|---|---|---|
| **Single-device** | `src/data/firebaseConfig.js` is left as `null` | In that one browser only |
| **Synced** | The Firebase web config is pasted into `src/data/firebaseConfig.js` | In Firebase; every phone that joins with the guild code sees the same village live |

## Using it

1. One adult opens the link, taps **Start a new guild** and sets up members and quests.
2. ⚙ → copy the **guild code** and send it to the household.
3. Everyone else opens the link, taps **Join** with the code and picks who they are.
4. Add to home screen: iPhone Safari **Share → Add to Home Screen**; Android Chrome **⋮ → Install app**.

## Firebase setup (already done for hearth-guild-524ae)

- Authentication → Sign-in method → **Anonymous** enabled
- Authentication → Settings → Authorised domains → **yaswi-clubs.github.io**
- Firestore in **europe-west2 (London)**, production mode, rules from `firestore.rules`
- Web app **hearth-guild-web**; its config goes in `src/data/firebaseConfig.js`

## Running it locally

```bash
npm install
npm run dev     # http://localhost:5173
npm test        # game-rule tests
npm run build   # production build into dist/
```

Every push to `main` runs the tests, builds and deploys to GitHub Pages (see the Actions tab).

## How it's built

- `src/game/rules.js`: all game rules as pure functions (state in → new state out), unit-tested in `tests/`.
- `src/game/village.js`: the canvas renderer for the village, boss and effects.
- `src/data/`: storage. Each household is **one Firestore document**, changed only inside transactions, so two phones acting at once can't overwrite each other. `localStore.js` runs the same rules against localStorage.
- `src/App.jsx`: the screens.

Moving storage later (e.g. to Supabase) means writing one file with the same five functions as `firebaseStore.js` (init, create, join, subscribe, run).

## Known limits (fine for a family pilot, not for launch)

- **No push notifications yet.** People have to open the app to see that something needs approving.
- **Sign-in is anonymous per device.** If someone clears their browser data they rejoin with the guild code; nothing is lost.
- **Anyone with the guild code can join.** Only share it with your household.
- **The PIN is a family lock, not security.**
- **Before going commercial (Stage 3):** real accounts with parental consent, the UK Age Appropriate Design Code, a data export/delete path, and proper art.

## Pilot pass mark

After 6 weeks on the app: every member active at least 4 days a week, and quests done per week above your Week 0 fridge-pilot baseline. Check ⚙ → Pilot log.
