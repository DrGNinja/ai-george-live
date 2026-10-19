# Setup guide (instructor)

About 45 minutes the first time, plus voice recording sessions whenever you have time.

## 1. Turn on GitHub Pages

1. Upload the contents of this folder to the root of `DrGNinja/ai-george-live` (GitHub → **Add file → Upload files**, or `git push`).
2. In the repository: **Settings → Pages → Build and deployment → Source: Deploy from a branch → Branch: `main`, folder `/ (root)` → Save**.
3. After a minute, the site is at `https://drgninja.github.io/ai-george-live/`. The Studio is at `https://drgninja.github.io/ai-george-live/studio.html`.

The Studio is public but harmless: anything you capture stays in your own browser until you publish, and what you publish is encrypted.

## 2. Studio → Profile

Check your name, title, email and the coach name (default "AI George"). Save.

## 3. Studio → Face (5 minutes)

- Use Chrome on the computer you'll keep using for the Studio, with good front light, the camera at eye level, a plain background.
- **Turn on camera → Record face.** Follow six prompts (relaxed, "aaah", "eeee", "oooo", "eh eh eh", two slow blinks). About 20 seconds.
- Check the six frames. Click a small alternative to swap any frame that looks off.
- **Test talking.** If you see a seam under the chin, raise **Mouth area size**.
- **Save face.**

A selfie or uploaded photo also works, but it only gives a simple jaw animation. The recorded face looks far more natural.

## 4. Studio → Voice

**Step 1 (today):** **Load voice engine**, then blend the Kokoro voices until one sounds closest to you, and **Preview**. A mix of Michael (US) and George (UK) is a good start. **Save voice.**

**Step 2 (over the next days):** record lines from your own course material in a quiet room with the same microphone each time. Aim for 20 minutes to start, 45–60 minutes for a close clone. Recordings stay in this browser. **Export recordings** produces a dataset for the free training steps in `docs/VOICE.md`. Keep that file private: it is enough to clone your voice.

## 5. Studio → Course packs

- **Import pack JSON** and choose `ism310.pack.json` (the starter pack, delivered outside this repository). It already holds the syllabus, the four weekly decks with notes, Joe Ingles' deck, the four workbooks and the practice READMEs. It does not include the instructor guides, which contain answer keys.
- For another course: **New course** (tag such as `ism410`), edit the course facts and weekly schedule in the JSON box, then **Add files** (decks, workbooks, syllabus, notes).

## 6. Studio → Publish

1. Choose a class passphrase of at least 12 characters, for example three random words and a number. Use a new one each term.
2. Either **Download encrypted files** and upload `avatar.enc` and the `packs/` folder to the repository, or **Publish to GitHub** with a fine-grained token:
   GitHub → **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**: repository access *Only select repositories → ai-george-live*, permission **Contents: Read and write**, short expiry.
3. Post in Canvas: the link `https://drgninja.github.io/ai-george-live/#ism310` and the passphrase, plus the note in `docs/PRIVACY.md`.

## 7. Try it as a student

Open the link in a fresh Chrome window, enter the passphrase, choose **Light** model size for the first test, and press **Start session**. Turn on hands-free and ask a question out loud.

## Updating

Change anything in the Studio and publish again. Students get the new version on their next visit. To revoke access, publish again with a new passphrase.
