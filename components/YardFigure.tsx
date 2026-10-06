'use client';

import { useEffect } from 'react';

const LABEL = 'Isometric town, live, through a day and a night: a factory, a warehouse and a shop on the main road, a town of streets, houses and villas, hills behind and the sea in front. Forklifts load pallets onto flatbed trucks, a guard opens the warehouse gate, covered trucks take the goods to the shop, a bus runs its line, people walk the streets, and when someone tries to rob the bank the police come. Drag to pan, scroll or pinch to zoom, click anything for details; a selected vehicle shows its route. Keys: 1 to 5 jump to the factory, warehouse, shop, town and coast, 0 shows the whole map, N skips six hours, [ and ] cycle through vehicles, F follows the selection, Escape closes it, Space pauses.';

// The plate around the map. React draws it once; the yard engine (loaded only in the browser) finds its parts by id
// and drives them from then on, so nothing here re-renders while the town runs.
export default function YardFigure() {
  useEffect(() => {
    // a dynamic import runs the engine once per page load, even when Strict Mode mounts this twice
    import('@/yard').catch(err => console.error('Factory Yard failed to start', err));
  }, []);

  return (
    <figure>
      <div className="cap">
        <span className="hi">Fig 1 · <span id="clock">10:00</span><span id="phase" /></span>
        <nav className="sites" aria-label="Places">
          <button data-view="0" title="Factory (1)">Factory</button>
          <button data-view="1" title="Warehouse (2)">Warehouse</button>
          <button data-view="2" title="Shop (3)">Shop</button>
          <button data-view="3" title="Town (4)">Town</button>
          <button data-view="4" title="Coast (5)">Coast</button>
          <button data-view="5" title="Car Works (6)">Car Works</button>
          <button data-view="6" title="Sahel (7)">Sahel</button>
          <button data-view="7" title="Metro (8)">Metro</button>
          <button data-view="8" title="Sahel Motors (9)">Motors</button>
          <button data-view="9" title="Port (P)">Port</button>
        </nav>
      </div>
      <div className="stage" id="stage">
        <canvas id="view" tabIndex={0} role="img" aria-label={LABEL} />
        <div className="tools" id="tools">
          <button id="zoomIn" title="Zoom in (+)" aria-label="Zoom in"><svg viewBox="0 0 16 16"><path d="M8 3v10M3 8h10" /></svg></button>
          <button id="zoomOut" title="Zoom out (−)" aria-label="Zoom out"><svg viewBox="0 0 16 16"><path d="M3 8h10" /></svg></button>
          <button id="home" title="Reset view (0)" aria-label="Reset view"><svg viewBox="0 0 16 16"><path d="M2.5 7.5 8 3l5.5 4.5M4 6.5V13h8V6.5" /></svg></button>
          <span className="gap" />
          <button id="pause" title="Pause (Space)" aria-label="Pause" aria-pressed="false"><svg viewBox="0 0 16 16"><path d="M5.5 3.5v9M10.5 3.5v9" /></svg></button>
          <button id="theme" title="Light or dark (T)" aria-label="Switch light or dark theme"><svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="5" /><path d="M8 3a5 5 0 0 0 0 10z" fill="currentColor" /></svg></button>
          <button id="time" title="Skip ahead 6 hours (N)" aria-label="Skip ahead six hours"><svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="5.5" /><path d="M8 4.8V8l2.2 1.6" /></svg></button>
        </div>
        <div className="tag hover" id="tagHover" hidden />
        <div className="tag" id="tagSel" hidden />
        <div className="tag stop" id="tagStop" hidden />
        <aside className="card" id="card" role="region" aria-label="Selection details" hidden>
          <div className="head"><span id="cardKind" /><button id="cardClose" aria-label="Close details" title="Close (Esc)">×</button></div>
          <div className="title" id="cardTitle" />
          <div className="status" id="cardStatus" />
          <div className="bar" id="cardBar" hidden><span /><div><i /></div></div>
          <dl id="cardRows" />
          <div className="foot" id="cardFoot"><button id="cardFollow" aria-pressed="false" title="Follow (F)">Follow</button></div>
        </aside>
        <p className="note" id="note" hidden />
      </div>
      <div className="cap">
        <span className="fine">Drag to pan · scroll to zoom · click anything</span>
        <span className="coarse">Drag to pan · pinch to zoom · tap anything</span>
        <span className="hi" id="readout">loading</span>
      </div>
    </figure>
  );
}
