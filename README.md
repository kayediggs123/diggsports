# 🏀 March Madness Auction Draft

A live auction draft app for March Madness pools. Record who won each seed and for how much as your group runs the auction in person. Supports all 4 regions with 52 total items.

![React](https://img.shields.io/badge/React-18+-61DAFB?logo=react&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-green)

---

## How It Works

Run this app on a laptop or TV screen during your draft. Seeds are shuffled into a random order and presented one at a time. After your group auctions each seed, you record the winner and winning bid.

### Draft Items (52 total)
| Region | Items |
|--------|-------|
| East | Seeds 1–12 individual + Seeds 13–16 grouped |
| West | Seeds 1–12 individual + Seeds 13–16 grouped |
| South | Seeds 1–12 individual + Seeds 13–16 grouped |
| Midwest | Seeds 1–12 individual + Seeds 13–16 grouped |

### Features

- **Up to 15 drafters**
- **4 full regions** — East, West, South, Midwest
- **Name every seed** — optional team names per region on setup (e.g., "#1 Duke")
- **Randomized draft order** — all 52 items shuffled; next item auto-presents
- **Budget or no budget** — choose unlimited bidding or set a max budget per drafter
- **Simple result entry** — click the winner, type the winning bid, confirm
- **Cancel / skip** — returns an item to the end of the queue
- **Live draft results** — each drafter's teams grouped by region with total spent
- **Region progress bars** — track how many seeds remain per region
- **Confetti** when the draft completes

---

## Run It Locally

### Prerequisites

- [Node.js](https://nodejs.org/) 16+

### Option A: Vite (recommended)

```bash
# Create project
npm create vite@latest march-madness-auction -- --template react
cd march-madness-auction

# Replace the app file
cp /path/to/march-madness-auction.jsx src/App.jsx

# Install and run
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

### Option B: Create React App

```bash
npx create-react-app march-madness-auction
cd march-madness-auction
cp /path/to/march-madness-auction.jsx src/App.jsx
npm start
```

Open [http://localhost:3000](http://localhost:3000).

---

## Deploy to GitHub Pages (free hosting)

This lets you access the app from any device at `https://YOUR_USERNAME.github.io/march-madness-auction/`.

### Step-by-step

**1. Create the project locally**

```bash
npm create vite@latest march-madness-auction -- --template react
cd march-madness-auction
npm install
```

**2. Copy in the app file**

Replace `src/App.jsx` with `march-madness-auction.jsx`.

**3. Install the GitHub Pages deploy tool**

```bash
npm install --save-dev gh-pages
```

**4. Edit `vite.config.js`** — add the `base` property:

```js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/march-madness-auction/',
})
```

**5. Add deploy scripts to `package.json`**:

```json
"scripts": {
  "dev": "vite",
  "build": "vite build",
  "predeploy": "npm run build",
  "deploy": "gh-pages -d dist"
}
```

**6. Create a GitHub repo and push**

```bash
git init
git add .
git commit -m "March Madness auction draft"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/march-madness-auction.git
git push -u origin main
```

**7. Deploy**

```bash
npm run deploy
```

**8. Enable GitHub Pages**

- Go to your repo on GitHub → **Settings** → **Pages**
- Under **Source**, select **Deploy from a branch**
- Select the **gh-pages** branch, root folder → **Save**

After a minute or two, your app will be live at:

```
https://YOUR_USERNAME.github.io/march-madness-auction/
```

---

## Usage

1. **Enter drafter names** (2–15)
2. **Name seeds** (optional) — use region tabs to name teams in each region
3. **Choose bid mode** — No Limit or Set Max Budget
4. **Start the draft** — items appear in random order
5. **For each item**: click the winner → enter the winning bid → Confirm Sale
6. **Skip** any item to send it to the back of the queue
7. **Review results** at the bottom showing each drafter's teams and spend

---

## Customization

Edit these at the top of `march-madness-auction.jsx`:

| Constant | Default | Description |
|----------|---------|-------------|
| `REGIONS` | East, West, South, Midwest | Region names |
| `REGION_COLORS` | Blue, Red, Teal, Orange | Color per region |
| `SEED_COLORS` | Per-seed | Badge color for each seed |
| `COLORS` | 15 colors | Drafter color palette |

---

## License

MIT
