# Modelpedia Launch Video Script

**Format:** 1920x1080, 30fps, ~45 seconds
**Tone:** Clean, confident, developer-focused. Not hype — clarity.
**Music:** Minimal electronic, builds tension then resolves.

---

## Scene 1: "The Chaos" (0:00–0:08)

**Visual:** Quick montage of browser tabs opening one after another — OpenAI pricing page, Anthropic docs, Google AI model cards, Mistral documentation, AWS Bedrock console. Tabs multiply. The tab bar overflows. A cursor frantically switches between them.

> **Text overlay (typed out):**
> "Which model should I use?"

**Beat.** The tabs blur. Everything goes dark.

> **Text overlay (fade in, smaller):**
> "4,200+ models. 31 providers. Pricing changes weekly."

**Asset needed:**
- `[SCREENSHOT]` Browser with 8+ tabs open showing real provider pricing/docs pages (OpenAI, Anthropic, Google, Mistral, AWS, Azure, Cohere, Fireworks)
- Can be simulated with styled tab bar mockup

---

## Scene 2: "The Answer" (0:08–0:14)

**Visual:** Dark screen. The Modelpedia logo animates in — the "M" icon first, then the wordmark. Clean, centered. A subtle radial glow pulses behind it.

> **Text overlay (below logo):**
> "The open catalog of AI models"

**Transition:** The logo slides up and the homepage fades in behind it.

**Asset needed:**
- `[SCREENSHOT]` Modelpedia homepage (modelpedia.dev) — full viewport, showing hero section with search bar, stats grid (4,200+ models, 31 providers), and provider grid below

---

## Scene 3: "Browse Everything" (0:14–0:22)

**Visual:** We're on the models page. The camera slowly scrolls through rows of models. We see capability badges (Vision, Tool Calling, Streaming), context windows, pricing columns. It feels like a living database.

A search query types itself: "claude" — the table filters instantly. Then the query changes to "vision" — models with vision capability light up.

The filter toolbar activates: click "Reasoning" capability, toggle "OSS only" — the table narrows to open-source reasoning models.

> **Text overlay (bottom-left, subtle):**
> "Search. Filter. Find exactly what you need."

**Asset needed:**
- `[SCREEN RECORDING]` Navigate to /models page. Slowly scroll through the table showing model names, capability badges, context windows, and pricing. Then type "claude" in search, pause, clear it, type "vision". Click the "Reasoning" capability filter. Toggle "OSS" checkbox. (~8 seconds of smooth interaction)

---

## Scene 4: "Compare Side by Side" (0:22–0:28)

**Visual:** Cut to the compare page. Two model pickers appear. Select "GPT-4o" on the left, "Claude Sonnet 4" on the right. The comparison table builds itself — rows animate in from top to bottom:

- Context window: 128K vs 200K (highlighted difference)
- Pricing: $2.50 vs $3.00 input
- Capabilities: both have Vision ✓, Tool Calling ✓
- Speed rating: 4 dots vs 3 dots

The camera slowly pans down through the comparison.

> **Text overlay:**
> "Compare any two models. Every detail."

**Asset needed:**
- `[SCREEN RECORDING]` Go to /compare. Select GPT-4o and Claude Sonnet 4 (or another compelling pair). Slowly scroll through the comparison table showing differences highlighted in yellow. (~6 seconds)

---

## Scene 5: "For Developers" (0:28–0:36)

**Visual:** Split screen. Left side shows a code editor with the npm package:

```typescript
import { getModel } from "modelpedia";

const model = getModel("openai", "gpt-4o");
console.log(model.pricing.input); // 2.5
console.log(model.capabilities.vision); // true
```

Right side shows a terminal with a curl command hitting the API:

```
$ curl api.modelpedia.dev/v1/models/openai/gpt-4o
```

JSON response streams in with model data.

> **Text overlay (center, between the two panels):**
> "npm package · REST API · No auth required"

Then the bottom of the screen shows three badges animating in:
- "4,200+ models"
- "Daily auto-updates"
- "MIT Licensed"

**Asset needed:**
- `[SCREENSHOT]` Code editor (VS Code dark theme) showing the npm import example above
- `[SCREENSHOT]` Terminal showing curl command and JSON response from the API
- These can be recreated as styled code blocks in the video itself (no actual screenshot needed)

---

## Scene 6: "Open Source" (0:36–0:42)

**Visual:** The GitHub repository page. Stars count visible. The contribution graph. A pull request being merged — someone added a new provider. The changes feed on modelpedia.dev/changes showing real model updates.

> **Text overlay (large, centered):**
> "Community-maintained. Always current."

> **Text overlay (smaller, below):**
> "31 provider scripts sync daily from official APIs"
> "Manual edits are never overwritten"

**Asset needed:**
- `[SCREENSHOT]` GitHub repo page (github.com/assistant-ui/modelpedia) showing the repo header, star count, and file tree
- `[SCREEN RECORDING]` The /changes page on modelpedia.dev, slowly scrolling through recent model updates showing pricing changes, new models added, capabilities updated (~3 seconds)

---

## Scene 7: "The Close" (0:42–0:47)

**Visual:** Everything fades to the dark background. The Modelpedia logo returns, centered. Below it, the URL animates in with a gradient pill button style.

> **Large text:** "modelpedia.dev"
> **Below:** "Browse 4,200+ AI models from 31 providers"
> **Bottom:** "github.com/assistant-ui/modelpedia" (subtle, smaller)

The logo and text hold for 3 seconds. Subtle particle/dot animation in the background.

**Asset needed:**
- No screenshot needed — this is a designed outro card

---

## Summary of Assets Needed

| # | Type | Description | Source |
|---|------|-------------|--------|
| 1 | Screenshot or Mockup | Browser with multiple provider tabs open | Simulated |
| 2 | Screenshot | Modelpedia homepage (full viewport) | modelpedia.dev |
| 3 | Screen Recording | /models page — scroll, search "claude", filter by capability | modelpedia.dev/models |
| 4 | Screen Recording | /compare page — select GPT-4o vs Claude Sonnet 4, scroll comparison | modelpedia.dev/compare |
| 5 | Screenshot or Code Block | VS Code with npm package code example | Styled in video |
| 6 | Screenshot or Code Block | Terminal with curl + JSON response | Styled in video |
| 7 | Screenshot | GitHub repo page | github.com/assistant-ui/modelpedia |
| 8 | Screen Recording | /changes page — scroll through recent updates | modelpedia.dev/changes |

### Notes

- Screen recordings should be captured at 1920x1080 in a clean browser (no bookmarks bar, minimal chrome)
- Use dark mode if available
- Cursor movements should be slow and deliberate
- All recordings should be smooth 30fps or higher
- Screenshots should be high-DPI (2x retina) and scaled down for crisp text
