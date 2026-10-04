# Factory Yard

A live isometric supply chain in one HTML file, drawn with WebGL in the hairline style of [ai-iso-skill](https://github.com/MrBongoC/ai-iso-skill).

Goods move from a factory to a warehouse and then to a shop, all on one road. Nothing on screen is a dashboard. Click anything and a card shows its live details.

![Fig 1, the warehouse and the shop, with the box truck DLV-01 selected while forklifts load it from the rear](docs/factory-yard.png)

## Open it

Open `index.html` in a browser. It loads three.js from jsDelivr and the DM Mono font from Google Fonts, so it needs a network connection. If you'd rather serve the folder:

```
python3 -m http.server
```

Then go to <http://localhost:8000>.

## What moves

1. **Plant 01:** a pallet leaves the factory on Line A every 40 s. Forklifts FL-01 to FL-03 pick pallets off the side of the belt or out of staging and lift them onto a flatbed waiting at Bay 1 or Bay 2.
2. **Flatbeds (TRK-2051, TRK-2052):** with 6 pallets aboard, a flatbed waits for a gap in traffic and drives east. It goes round the roundabout and turns into the warehouse.
3. **Warehouse gate:** the guard walks from the booth to the gate post, slides the gate open, and closes it again once the truck is through.
4. **Warehouse 01:** this building is drawn as a cutaway, so the inside shows. Forklifts FL-04 to FL-06 unload the flatbed at its dock and put the pallets into the racks, two levels high. The flatbed then drives back to the plant.
5. **Box trucks (DLV-01, DLV-02):** these covered trucks drive into the warehouse's loading lane and open their rear doors. Forklifts load four pallets through the back. The doors close, and the truck drives to the shop once the shop has room.
6. **Corner Market:** also a cutaway. The box truck parks in the delivery lay-by and opens its doors. Three staff carry the boxes in, one at a time, onto the shelves or into the stockroom.
7. **Shoppers:** they walk in, take a box or two off the shelves, pay at the counter and leave.

Cars drive in from the west, go round the roundabout and leave again. They stop for trucks that are crossing.

Each stage only runs as fast as the next one lets it:
- A full shop keeps the box trucks waiting at the warehouse.
- Full racks keep the flatbeds waiting at the docks.
- A full belt holds the production line.

## Controls

| Action | Mouse / touch | Keys |
| --- | --- | --- |
| Go to a place | Factory · Warehouse · Shop links, top right | `1` `2` `3` |
| Whole map | ⌂ button | `0` |
| Pan | drag | arrow keys |
| Zoom | scroll, pinch, or the + / − buttons | `+` `−` |
| Inspect something | click or tap it | `[` `]` cycle through vehicles |
| Follow the selection | Follow button | `F` |
| Close the card | × button, or click empty ground | `Esc` |
| Pause | ❚❚ button | `Space` |
| Light / dark | ◐ button | `T` |

You can inspect trucks, forklifts, pallets, cars, the guard, shop staff, shoppers and every building.

## How the skill carries over to WebGL

ai-iso-skill draws SVG figures with a small projection kernel. This page keeps the kernel's ideas and moves them to three.js.

- **Same projection.** The skill's `P(x,y,z)` (+x down-right, +y down-left, +z up) is exactly an orthographic camera looking down `(-1,-1,-1)`. `W(x,y,z)` swaps y and z into three.js's y-up world, so the whole scene is written in the skill's coordinates.
- **Same kernel.** `plane(O,U,V)`, `TOP`, `FRONT`, `SIDE` and `box(x,y,z,w,d,h)` keep their meanings. Doors, vents, ribs, rollers, road paint, signs and text are drawn flat in a face's own 2D units and placed with that face's matrix.
- **Hairlines.** Every edge is a `LineSegments2` exactly 1 CSS pixel wide at any zoom, the WebGL equivalent of `vector-effect: non-scaling-stroke`. Faces are flat, unlit and opaque, so the depth buffer hides lines behind them.
- **Cutaways.** The warehouse and the shop follow technical section drawings. The front walls are cut low and hatched where they are cut, and the roof is an outline only.
- **The look.** It uses two greys for lines and one `--live` colour, reserved for what is live: the selection, a busy bay's lamp, a moving forklift's beacon and the chimney light. Goods and staff shirts use the two-tone fill. All colours are CSS custom properties with a dark and a light set, read into the materials at runtime.
- **The frame.** The page is a plate with `Fig 1`, the places, the instruction and a live readout in the four corners.

The one rule it breaks is "no external scripts": three.js comes from a CDN.

## For testing

- `?debug=1` exposes `window.yard`: `step(seconds)`, `select(id)`, `screenOf(id)`, `look(x, y, zoom)` and `all()`.
- `?seed=<number>` changes the random seed. The simulation runs on a fixed 1/60 s step, so a given seed always plays out the same way.

## Credits

- Isometric kernel and visual language adapted from [ai-iso-skill](https://github.com/MrBongoC/ai-iso-skill) (MIT, © Tolga Cohce).
- Rendering by [three.js](https://threejs.org) (MIT).
