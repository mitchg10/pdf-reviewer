# PDF Read-Aloud Reviewer: Project Plan

Nov 16, 2026 · @Mitchell Gerhardt

## Overview and goals

This is a single-user web tool that reads a PDF aloud at a speed you choose and lets you annotate it while reviewing student or journal manuscripts. Each review produces three files: the untouched original, an annotated PDF copy, and a CSV of your comments.

**In scope**

- Upload a PDF and read it aloud, with an optional highlight on the sentence being read.
- Configurable playback speed, and a choice of speech provider: local model, university endpoint, or a cloud API such as ElevenLabs.
- Select text, attach a comment and a severity, and see all comments in a side panel.
- Export a CSV and an annotated PDF copy.

**Deliberately left out**

- Logins, user accounts and a database. You are the only user, so annotations live in a JSON file beside each PDF.
- Scanned-PDF OCR in the first version (see Risks).

## Architecture

The Next.js front end is the only part you open in a browser, and it calls the FastAPI back end for everything: documents, annotations, export and speech. Only the back end talks to speech providers and touches files, so provider keys never reach the browser.

&#91;embedded content: architecture · 3 tiers plus a folder on disk\]

Each document gets one folder holding the original PDF, its annotation sidecar, the exports and the audio cache.

## Text-to-speech providers

The back end defines one small interface: given text, a voice and a speed, return audio. Each provider is an adapter behind it, and you pick the active one in a config file or a settings screen. API keys stay in environment variables, never in the config file or the browser.

| Adapter | Use for | Native speed control | Notes |
| --- | --- | --- | --- |
| Local (Kokoro or Piper) | Offline, free, private | Yes, via a length or speed parameter | Needs a Python install of the model; a GPU helps but is not required |
| OpenAI-compatible HTTP | University or any self-hosted endpoint | Usually (a `speed` field) | One adapter covers any server that mimics the OpenAI speech API; base URL, key and model are config |
| ElevenLabs | Highest voice quality | No | Separate adapter because its API shape differs; speed comes from the browser |

**Where speed is applied.** Treat speed as a playback setting by default: the browser's `playbackRate` with pitch preservation changes speed instantly, with no re-synthesis and no extra API cost. Providers with native speed control can be used for very slow or fast settings where quality matters, as an optional flag per adapter.

**Chunking and caching.** The back end splits text into sentences and synthesizes each one separately, so playback starts after the first sentence and sentence highlighting is exact. Audio is cached on disk by a hash of provider, voice and sentence text, which makes re-listening free and avoids repeat charges on cloud providers.

## Model dashboard

A settings page lists every speech model you have configured and lets you add, edit, delete and test each one. The list is saved in a local `models.json` file, so there is still no database. You choose the active model from this list.

| Field | Meaning |
| --- | --- |
| Name | Your label for the model |
| Type | Local, OpenAI-compatible endpoint, ElevenLabs or Ollama |
| Location | A model folder or Hugging Face repo ID for local models; a base URL for endpoints |
| Voice | Default voice |
| Speed | Default speed, and whether to use the provider's own speed control |
| API key | The name of the environment variable that holds the key, never the key itself |

- **Hugging Face.** Enter a repo ID and the back end downloads the weights into a models folder and shows progress. It can then run any model the local adapter supports, such as Kokoro or Piper; it cannot run an arbitrary repo.
- **Ollama.** Add the Ollama server's URL and a model name. Ollama is built mainly for text models, so confirm early that the speech model you want runs there.
- **Test button.** Speaks a sample sentence with the chosen voice and speed, so a bad URL or key shows up before a review.
- **Delete.** Removes the entry. Downloaded weights are deleted only if you confirm.

## Read-along highlight

The highlight is a toggle in the player. Off, the viewer is just the PDF. On, the sentence being read is highlighted using the stored sentence rectangles, and the page scrolls to follow it. It uses no extra synthesis, so turning it on costs nothing.

## Styling

The front end reuses the theme from purrcept (`apps/web/src/app/globals.css`), so it looks like your other tools. The plan is to copy that file, the theme script and the small UI primitives, then change only the content.

| Piece | What to reuse |
| --- | --- |
| Stack | Next.js, React 19, Tailwind 4 with `@import "tailwindcss"` and an `@theme inline` block |
| Tokens | CSS variables `--background`, `--surface-1`, `--foreground`, `--text-secondary`, `--border`, mapped to Tailwind colors `background`, `surface`, `foreground`, `muted`, `line` |
| Light and dark | Warm off-white and near-black palettes; `data-theme` on `<html>` is set before first paint by a small inline script, with a system, light, dark toggle and the choice saved in `localStorage` |
| Fonts | Geist and Geist Mono through `next/font/google` |
| Components | Flat, bordered surfaces (`rounded-lg border border-line bg-surface`); Button variants primary, secondary, ghost and danger; Card and PageHeader; a collapsible left sidebar with line icons |
| Models page | A `/models` route opened from a gear in the sidebar status box, as in purrcept, which is where the model dashboard lives |

**Severity colors.** Use purrcept's colorblind-safe series palette, always paired with the severity label so color is never the only signal: Consider = `--series-6` (light blue), Should fix = `--series-4` (amber), Must fix = `--series-2` (orange-red), Praise = `--series-3` (green). The same colors tint the highlights in the annotated PDF.

**Layout.** Sidebar with Documents and Models, the PDF viewer filling the main area, and the comment panel and audio player as cards beside and below it.

I based this on purrcept. figlang-coder is described as sharing the same theme, but I have not checked it against this list.

## Annotations

Each comment is a small record saved in a JSON sidecar file next to its PDF (for example `review.pdf` and `review.annotations.json`). The sidecar is the single source of truth; the CSV and annotated PDF are generated from it on demand.

| Field | Meaning |
| --- | --- |
| `id` | Stable internal ID, never shown |
| `number` | Comment number, assigned in reading order and renumbered after deletes |
| `page` | Page number, starting at 1 |
| `rects` | One or more highlight rectangles in PDF coordinates (several when the selection spans lines) |
| `text` | The original highlighted text |
| `comment` | Your note |
| `severity` | One of the four levels below |

**Severity levels**

- Consider
- Should fix
- Must fix
- Praise

Storing rectangles in PDF coordinates, not screen pixels, means annotations stay correct at any zoom level and map directly onto the exported PDF. Saves happen automatically after each change, so closing the tab never loses a comment.

## Export

Export produces two new files and never modifies the original PDF. Both are written next to it, for example `review.pdf` (untouched), `review.annotated.pdf` and `review.comments.csv`.

**CSV.** One row per comment, in comment-number order. The page column is an optional fifth column that makes a long review easier to navigate; it is included by default and can be dropped in config.

```csv
number,original_text,comment,severity,page
1,"The sample was small.","State N and how it was recruited.",Should fix,3
2,"Results were significant.","Report the test and effect size.",Must fix,5
3,"This framing is clear.","Nice setup of the problem.",Praise,2
```

**Annotated PDF.** PyMuPDF opens a copy of the original and, for each comment, adds a real highlight annotation over the stored rectangles. The comment text becomes the highlight's popup note, prefixed with the comment number and severity (for example "#2 Must fix: Report the test and effect size"), so the PDF and CSV line up by number. Highlight color follows severity, so the page can be scanned at a glance. Because these are standard PDF annotations, they open and can be edited in Preview, Acrobat and most other readers.

A small number label in the margin is optional; the popup prefix already carries the number, so the margin label is a later nicety.

## API endpoints

The FastAPI back end exposes the endpoints below, grouped by what they do. Each PDF is a "document" identified by a short ID, with its files in one folder on disk.

| Method and path | Purpose |
| --- | --- |
| `POST /documents` | Upload a PDF; extract text with page, sentence and position data using PyMuPDF; return the document ID |
| `GET /documents` | List documents already uploaded |
| `GET /documents/{id}/file` | Serve the original PDF to the viewer |
| `GET /documents/{id}/sentences` | Return sentences with page and rectangle data, for read-along highlighting |
| `POST /documents/{id}/tts` | Synthesize one sentence or chunk with the active provider and voice; return or stream audio |
| `GET /annotations/{id}` | Load the comments for a document |
| `PUT /annotations/{id}` | Save the full set of comments to the JSON sidecar |
| `POST /documents/{id}/export` | Write the annotated PDF and CSV; return their download links |
| `GET /settings` and `PUT /settings` | Read and change the active provider, voice and defaults; keys are never returned |

**Model dashboard endpoints**

| Method and path | Purpose |
| --- | --- |
| `GET /models` | List configured models |
| `POST /models` | Add a model |
| `PUT /models/{id}` | Edit a model |
| `DELETE /models/{id}` | Delete a model, and optionally its downloaded weights |
| `POST /models/{id}/test` | Speak a sample sentence with that model |
| `POST /models/download` | Download a Hugging Face repo into the models folder and report progress |

## Build order

Each step ends with something you can use, so the tool is helpful before it is finished.

1. **Skeleton.** Next.js with Tailwind and FastAPI running together, with CORS set and a hello-world call between them.
2. **PDF viewer.** Upload a PDF, store it, and display it with a selectable text layer (react-pdf or PDF.js).
3. **Annotations.** Select text, add a comment with a severity, list comments in a side panel, and autosave to the JSON sidecar.
4. **Export.** Generate the CSV and the annotated PDF copy. This makes the tool useful for reviews even without audio.
5. **Read aloud, first provider.** Sentence extraction, one local provider, a player with speed control, and an optional read-along highlight toggle.
6. **More providers.** Add the OpenAI-compatible adapter and the ElevenLabs adapter, the model dashboard for adding, editing and deleting models, Hugging Face downloads and Ollama support, and the on-disk audio cache.
7. **Polish.** Keyboard shortcuts for add comment and next comment, a simple jump-to-page list, and error messages for provider failures.

## Risks and open questions

**Risks**

- **Messy PDF text.** Two-column journal layouts, headers, footnotes and hyphenated line breaks can produce out-of-order text. Mitigation: use PyMuPDF's block-level extraction, let you skip headers and footers, and test early on real manuscripts.
- **Scanned PDFs.** An image-only PDF has no text layer, so neither reading aloud nor highlighting works. Mitigation: detect it on upload and warn; OCR (for example OCRmyPDF) can be added later.
- **Selection-to-coordinates mapping.** Turning a browser text selection into accurate PDF rectangles is the fiddliest part of the front end. Mitigation: build and test it in step 3, before audio.
- **Sensitive manuscripts.** Student work and journal submissions may be confidential, and cloud providers receive the text. Mitigation: show which provider is active, and default to local or the university endpoint.

**Open questions**

- [ ] Should the app run only on your own machine, or on a small server you reach from several devices?
- [ ] Which local model first, Kokoro or Piper? Kokoro sounds more natural; Piper is lighter.
- [ ] Does the university endpoint follow the OpenAI speech API, and does it need VPN or a token?
- [ ] Should highlight color follow severity in the annotated PDF? The plan assumes yes.

* [ ] Which speech models do you want to run through Ollama? Confirm early that they work there.
* [ ] Which Hugging Face models do you plan to download first?
