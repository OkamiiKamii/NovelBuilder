# QA sample novel: test data only

**"QA Sample: The Glass Meridian (test data)"** is a small, made-up novel for checking that the app's views agree with one another. It is not part of the app and never appears in anyone's library unless they import it on purpose.

## What is here

| File | What it is |
|---|---|
| `sample-novel.ts` | The builder. Makes the novel through the app's own services, as an author would through the pages. |
| `qa-sample.novel.json` | The novel as a Library backup file, made by the builder. This is the file to import. |
| `sample-novel.test.ts` | Checks that the file is exactly what the builder makes, that importing it changes no other novel, that deleting it leaves nothing behind, and that nothing in the app includes it. |
| `agreement.test.ts` | Imports the file and checks that every view reads the same records the same way. |

## What the novel holds

- **Cast:** five characters (Ilse, Corin, Tamsin, Hale, Wren), a faction (the Glasswrights' Guild) and an item (the Ledger of Tides).
- **Places, in a hierarchy with levels:**
  - The Meridian Coast (region) → Port Calder (city) → the Glass Archive and Council Hall (buildings);
  - The Hill Country (region) → Ashe House (building).
- **Manuscript:**
  - two acts and six chapters;
  - Ch 3 is two scenes;
  - Ch 1–4 have text, Ch 5 and 6 are planned only;
  - appearance records, points of view and labels on the plans.
- **Seven events:**
  - two at the same moment in different places (the heist and the council vote, both on Year 812, April 9);
  - one long before the story (the fire at Ashe House, Year 800), foreshadowed in Ch 2 and told as a flashback in Ch 6.
- **Four relationships:**
  - mentor and student, which sours in Ch 5 and mends in Ch 6;
  - rivals who become friends in Ch 4;
  - siblings;
  - enemies.
- **One plot thread,** introduced in Ch 1, developed in Ch 3 and 4, and resolved in Ch 6, with its events.
- **An ability tree** ("Glasswork"):
  - Read the Glass branches into Glass Step (which evolves into Mirror Walk) and Shatter;
  - Shatter and Mirror Walk exclude each other;
  - held on Ilse's and Corin's sheets, and gained over the story (Glass Step in Ch 2, Mirror Walk in Ch 6).
- **Guild membership,** Corin's throughout and Ilse's from Ch 2.
- **An alternate history,** "If the vote had failed": the vote goes the other way, and Hale is removed the next day.

## Using it

- **To look at it in the app:** Library → **Import** → choose `qa/qa-sample.novel.json`.
  - It becomes a new, separate novel with its own ids. Importing it again makes a second copy ("… 2"); it never merges into anything.
- **To remove it:** open it, then Settings → **Delete…** and type its title.
  - This removes every record of it and what the browser kept for it (its layouts, dashboard, notes, scroll positions).
- **To run its checks:**
  - `npx vitest run qa`. They also run with the whole unit suite (`npm test`).
  - The browser checks are in `e2e/smoke.mjs`, "The QA sample novel (Optional Prompt C)".
- **After changing the builder, or how the app stores a record:** `npm run qa:sample` writes the file again.
  - It is made the same way every time: ids counted up from one, one fixed clock. A difference from the committed file is a real change.

## Why it is never part of the app

- **Nothing under `src/` imports this folder,** and a build only contains what the app's page reaches from `index.html`. Only `public/` is copied into a build, and the sample is not there.
- **The app never makes or imports a novel on its own.** A new browser starts with an empty library.
- **All of this is checked:**
  - `sample-novel.test.ts` scans the sources, `public/` and `index.html`;
  - the browser test opens a new browser, reads every file the built app serves, and asks for the sample's own path.

## When a check fails

`agreement.test.ts` fails when two views say different things about the same record. That is what it is for:
- fix the view that is wrong, not the test;
- change the sample only when a view is right and the sample cannot show it.

Two disagreements it found when it was written are fixed:
- character history now shows the author's appearance records ("Appears in", "Mentioned in") as the appearances view does;
- the list form of the timeline and plot board now names a scene with its chapter ("Ch 3, scene: At the Archive"), as the other views do.
