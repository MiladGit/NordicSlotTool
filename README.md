# Nordic Slot Tool — SCR / GCR message generator

A small, fast, **zero-dependency** web tool for building IATA SSIM Chapter 6 airport
slot-coordination messages (**SCR** and **GCR**) ready to paste straight into an email.
Built for Nordic slot coordination, but works for any coordinated (Level 3) airport that
uses the standard formats.

- **New** arrival / departure / turnaround requests
- **Change** an existing slot (the standard `C` + `R` line pair)
- **Delete / cancel** a held slot (`D` line)
- Live preview, one-click **copy to clipboard**, and `.txt` download
- Light / dark theme, Nordic airport + aircraft presets, inline validation
- Everything runs in the browser — no data leaves your machine

> This tool only *formats* the message. You are responsible for the accuracy of every
> request before sending it. Not affiliated with IATA or any coordinator.

## Message formats

| | SCR | GCR |
|---|---|---|
| Use | Commercial: scheduled, charter, additional, positioning linked to commercial ops, test, training | General/business aviation, ferry/positioning not linked to commercial ops, state & diplomatic |
| Airline / flight code | IATA (2-letter) flight designator | ICAO flight no. (`/FLT`) or aircraft registration (`/REG`) |
| Airport code | IATA (3-letter) | ICAO (4-letter) |
| Header | `SCR` / `/` / season / date / airport | `GCR` / `/FLT` or `/REG` / airport |
| Dates | Period + day-of-week pattern, over-midnight indicator | One date per line |
| Change | `C` (held) + `R` (revised) | `C` (held) + `R` (revised) |
| Delete | `D` | `D` |

The exact field layouts follow the IATA SSIM Chapter 6 grammar as documented by the
coordinators (see **References** below).

## Run locally

It's a static site — just open `index.html` in a browser. No build step, no server.

```
# optional: serve it (any static server works)
python -m http.server 8000
# then visit http://localhost:8000
```

## Deploy free on GitHub Pages

1. Create a new GitHub repository and push these files to it.
2. In the repo: **Settings → Pages**.
3. Under **Build and deployment → Source**, choose **Deploy from a branch**.
4. Pick branch `main` and folder `/ (root)`, then **Save**.
5. Your tool will be live at `https://<your-user>.github.io/<repo>/` within a minute.

The included `.nojekyll` file tells Pages to serve the files as-is.

## Project layout

```
index.html   markup + inline SVG icons
styles.css   theme + layout (light/dark via [data-theme])
app.js        state, message generation, validation
README.md
LICENSE       MIT
.nojekyll
```

All slot-coordination domain logic lives in `app.js`:
`scrLine()` / `gcrLines()` build the data lines, `generate()` assembles the full
message, and `validate()` produces the inline warnings.

## References

- Slot Coordination Switzerland — *SCR Crash Course* (extracts from IATA SSIM ch. 6)
- Slot Coordination Czech Republic — *GCR manual* (General Aviation Clearance Request)
- Airport Coordination Netherlands — *Working procedure: positioning flights* (SCR vs GCR by service type)
- IATA *Standard Schedules Information Manual (SSIM)*, Chapter 6 — the authoritative source

## License

[MIT](LICENSE)
