# Factory Yard

A live isometric factory yard in one HTML file, drawn with WebGL in the hairline style of [ai-iso-skill](https://github.com/MrBongoC/ai-iso-skill).

Pallets roll out of the plant on a conveyor. Forklifts carry them to staging and load them onto flatbed trucks. Full trucks leave through the gate while traffic passes on the road. The map shows only the drawing until you click something: then you get a card with that object's live details.

![Fig 1, the factory yard, with forklift FL-02 selected while it carries a pallet to a truck](docs/factory-yard.png)

## Open it

Open `index.html` in a browser. It loads three.js from jsDelivr and the DM Mono font from Google Fonts, so it needs a network connection. If you'd rather serve the folder:

```
python3 -m http.server
```

Then go to <http://localhost:8000>.

## What moves

- **Line A** – a pallet leaves the factory every 9 s and rolls to the end of the conveyor, where pallets queue at three pickup stations. When the belt is full, production is held.
- **Forklifts (FL-01 to FL-04)** – they pick pallets from the side of the belt or from staging. They lift each pallet onto a truck's flatbed, filling the far row first. With no truck waiting, they put pallets away into the 16 staging slots. They drive on the right of their corridors, give way to each other, run down their batteries and go back to the chargers.
- **Trucks** – a truck comes in off the road, the barrier lifts, and it pulls into Bay 1 or Bay 2. The bay lamp lights while it loads. Once it holds 6 pallets it drives round to the gate, waits for a gap in both lanes and leaves.
- **Traffic** – cars and vans run both ways on the road, keep their distance and stop for trucks that are crossing.

## Controls

| Action | Mouse / touch | Keys |
| --- | --- | --- |
| Pan | drag | arrow keys |
| Zoom | scroll, pinch, or the + / − buttons | `+` `−` |
| Reset view | ⌂ button | `0` |
| Inspect something | click or tap it | `[` `]` cycle through vehicles |
| Follow the selection | Follow button | `F` |
| Close the card | × button, or click empty ground | `Esc` |
| Pause | ❚❚ button | `Space` |
| Light / dark | ◐ button | `T` |

Click any truck, forklift, pallet, car, the factory, the conveyor or the gate. The card and the bottom-right readout update live.

## How the skill carries over to WebGL

ai-iso-skill draws SVG figures with a small projection kernel. This page keeps the kernel's ideas and moves them to three.js.

- **Same projection.** The skill's `P(x,y,z)` (+x down-right, +y down-left, +z up) is exactly an orthographic camera looking down `(-1,-1,-1)`. `W(x,y,z)` swaps y and z into three.js's y-up world, so the whole scene is written in the skill's coordinates.
- **Same kernel.** `plane(O,U,V)`, `TOP`, `FRONT`, `SIDE` and `box(x,y,z,w,d,h)` keep their meanings. Doors, vents, roof ribs, rollers, road paint and text are drawn flat in a face's own 2D units and placed with that face's matrix.
- **Hairlines.** Every edge is a `LineSegments2` exactly 1 CSS pixel wide at any zoom, the WebGL equivalent of `vector-effect: non-scaling-stroke`. Faces are flat, unlit and opaque, so the depth buffer hides lines behind them.
- **The look.** It uses two greys for lines and one `--live` colour, reserved for what is live: the selection, a loading bay's lamp, a moving forklift's beacon and the chimney light. Goods use the two-tone fill. All colours are CSS custom properties with a dark and a light set, read into the materials at runtime.
- **The frame.** The page is a plate with `Fig 1`, the object name, the instruction and a live readout in the four corners.

The one rule it breaks is "no external scripts": three.js comes from a CDN.

## For testing

- `?debug=1` exposes `window.yard`: `step(seconds)`, `select(id)`, `screenOf(id)`, `look(x, y, zoom)` and `all()`.
- `?seed=<number>` changes the random seed. The simulation runs on a fixed 1/60 s step, so a given seed always plays out the same way.

## Credits

- Isometric kernel and visual language adapted from [ai-iso-skill](https://github.com/MrBongoC/ai-iso-skill) (MIT, © Tolga Cohce).
- Rendering by [three.js](https://threejs.org) (MIT).
