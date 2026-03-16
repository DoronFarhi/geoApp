# geoMarketApp - Project Instructions & Context (Updated)

## 1. Project Goal & UX Vision
A professional macro-economic and resource visualization tool.
- **Map View:** World map in a 'Technological Dark' theme.
- **Resource Icons (Overlays):** Small icons placed inside countries indicating natural resources (Oil, Gas, Natural Minerals, etc.).
- **Interaction:** Clicking a country smoothly centers it with zoom, then opens a detailed data dashboard.
- **Data Dashboard:** Displays import/e1xport products and trade partners (origin/destination).
- **Control Bar:** A dedicated sidebar or top bar to switch between different graph types and data tables.

## 2. Recommended Resource Icons (Overlays)
Based on global trade, we should overlay these key resources:
- 🛢️ **Energy:** Oil, Natural Gas, Coal.
- 💎 **Minerals:** Diamonds, Gold, Copper, Lithium (critical for tech).
- 🌾 **Agriculture:** Wheat/Grain, Coffee, Cotton.
- 🌲 **Forestry:** Timber/Wood.

## 3. Detailed Data Requirements (The Dashboard)
- **Trade Partners:** A list or "SanKey Diagram" showing top 5 export destinations and top 5 import origins.
- **Product Composition:** Breakdown of major import/export product categories (e.g., Machines, Chemicals, Textiles) using **Pie Charts** or **Donut Charts**.
- **Historical Trends:** Line graphs showing total trade volume over 10-20 years.

## 4. UI/UX Hierarchy
1.  **Map:** Main view, holds the resource icons.
2.  **Dashboard:** A sliding panel or Modal that appears on country selection.
3.  **Control Bar:** A persistent UI element for user options (Graph type, Year, Metric).

## 5. Technology Stack (Refined)
- **Frontend:** React.js + Vite.
- **Map:** Leaflet (for the dark theme) with `L.Icon` or `L.marker` (for the resource overlays).
- **Charts:** Recharts (for Pie, Line, and potentially Sankey diagrams).
- **Styling:** Tailwind CSS (Dark Mode as default).
- **Backend:** Node.js/Express (Caching and Proxy).

## 6. Guidelines for Claude Code
- **Performance:** Handle thousands of map markers (icons) efficiently. Consider marker clustering if needed.
- **Accessibility:** Ensure charts are readable in Dark Mode.
- **Complexity:** Use 'Ultrathink' when planning the data flow for the resource overlays.