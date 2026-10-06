# Factory Yard

A live isometric town drawn with WebGL in the hairline style of [ai-iso-skill](https://github.com/MrBongoC/ai-iso-skill).

Goods go from a factory to a warehouse along the main road of a small seaside town, and on to a shop by the sea:
- Behind the town are hills; in front of it, the sea.
- A day passes in six minutes. Windows, street lamps, headlights and the lighthouse come on at dusk.
- There is no dashboard. Click anything and a card shows its live details; click a vehicle and its route appears.

![Fig 1 at dusk: the town blocks with the bus selected, its route dashed round the two southern blocks and its next stop marked](docs/factory-yard.png)

## Open it

It's a Next.js app that builds to a static site. You need Node 20 or later.

```
npm install
npm run dev
```

Then go to <http://localhost:3000>.

To build the site, run `npm run build`. It writes plain HTML and JS to `out/`, so you can host it anywhere. To try the built copy locally, run `npm run preview`.

## How the code is laid out

| Folder | What's in it |
| --- | --- |
| `app/` | The page, the layout (which self-hosts DM Mono) and `globals.css` with the colour tokens |
| `components/YardFigure.tsx` | The plate around the map: caption, buttons, tags and the card. It loads the engine in the browser. |
| `yard/kernel/` | The iso projection, `Part` (boxes, faces, hairlines, text), `Path`, the corridor graph and the seeded random numbers |
| `yard/theme.ts` | Tokens → materials, and the day/night blend |
| `yard/models/`, `yard/world/` | Vehicles, people, boats, and the static town |
| `yard/sim/` | The simulation: clock, traffic, trucks, forklifts, people, the shop, the police |
| `yard/view.ts` | Camera, selection, card, routes, peeking into buildings, the frame loop, keys |
| `yard/index.ts` | Builds everything in a fixed order and starts the view |

The engine runs once per page load. React draws the plate, and the engine drives it from then on.

## The places

| Place | What's there |
| --- | --- |
| **Factory** | Plant 01, its conveyor, staging, two loading bays, and a truck park for flatbeds waiting for a free bay |
| **Warehouse** | Warehouse 01 with racks and a loading lane, two docks, a sliding gate and its guard |
| **Shop** | Corner Market on the seafront, where Hill Av meets Coast Rd: its delivery lay-by, a zebra crossing, and parking bays across the road on the promenade |
| **Town** | Four kinds of block:<ul><li>flats, Harbour Bank and Café Mira</li><li>the police station and Town Hall, whose clock tells the simulated time</li><li>houses with gardens</li><li>villas with pools</li></ul>Mill Park lies on the west side. |
| **Coast** | Coast Rd, the promenade, the beach, the pier, and a breakwater with a lighthouse, with a sailboat and a motorboat out at sea |

## What moves

1. **Plant 01:** a pallet leaves the factory on Line A every 34 s. Forklifts FL-01 to FL-03 load the flatbed waiting at a bay.
2. **Flatbeds (TRK-2051 to TRK-2053):** the three trucks share two bays and two docks.
   - A loaded truck waits at its bay until a dock is free, then crosses the road.
   - It goes round the roundabout, and the guard opens the warehouse gate.
   - On the way back it waits in the truck park until a bay is free.
3. **Warehouse 01:** forklifts FL-04 to FL-06 unload the flatbeds into the racks. They load the covered box trucks from the rear, in the loading lane.
4. **Box trucks (DLV-01 to DLV-03):** they carry four pallets down Hill Av to the shop, open their rear doors in the lay-by, and four staff carry the boxes in. They go back along Coast Rd and up Harbour Av, and cross Riverside Rd straight into the warehouse gate.
5. **Shoppers:** they walk in down Hill Av or along the promenade, or drive in, park in the bays on the seafront and cross at the zebra. They take boxes off the shelves, pay and leave.
6. **Traffic:**
   - Cars pass through on Riverside Rd and Coast Rd.
   - Town cars loop round the blocks and give way where they join a busier street.
   - **The bus (BUS-1)** runs Line 1 round the southern blocks. It stops at five shelters, where people get off and queue to board.
7. **People:**
   - They walk the pavements from home to home, to the beach, the park, the café or the pier.
   - They wait at the kerb for a gap before crossing, and traffic stops for anyone on the road.
   - Some jog, and some walk a dog.
   - There are fewer people out at night, and fewer shoppers.
8. **The bank job:**
   - Now and then a man in a dark hood gets off near the park and walks to Harbour Bank. He forces the door, and the alarm goes off.
   - Both police cars leave the yard with their lights flashing. Officers get out and chase him on foot.
   - Usually they make an arrest and walk him to the car. If he reaches the end of the promenade first, he gets away.

Each stage only runs as fast as the next one lets it:
- A full shop keeps the box trucks waiting at the warehouse.
- Full racks keep the flatbeds at the docks.
- A full belt holds the production line.

## Controls

| Action | Mouse / touch | Keys |
| --- | --- | --- |
| Go to a place | Factory · Warehouse · Shop · Town · Coast, top right | `1`–`5` |
| Whole map | ⌂ button | `0` |
| Skip ahead six hours | clock button | `N` |
| Pan | drag | arrow keys |
| Zoom | scroll, pinch, or the + / − buttons | `+` `−` |
| Inspect something | click or tap it | `[` `]` cycle through vehicles |
| Follow the selection | Follow button | `F` |
| Close the card | × button, or click empty ground | `Esc` |
| Pause | ❚❚ button | `Space` |
| Light / dark | ◐ button | `T` |

When something that moves is selected, the map draws its route as a dashed line and rings its next stop:
- Trucks and the bus show their whole loop.
- Cars, forklifts and people show the way ahead.

The warehouse and the shop are closed buildings. Select one, or anything inside it, and it opens up as a section drawing so you can see in.

## How the skill carries over to WebGL

ai-iso-skill draws SVG figures with a small projection kernel. This page keeps the kernel's ideas and moves them to three.js.

- **Same projection.** The skill's `P(x,y,z)` (+x down-right, +y down-left, +z up) is exactly an orthographic camera looking down `(-1,-1,-1)`. `W(x,y,z)` swaps y and z into three.js's y-up world, so the whole scene is written in the skill's coordinates.
- **Same kernel.** `plane(O,U,V)`, `TOP`, `FRONT`, `SIDE` and `box(x,y,z,w,d,h)` keep their meanings. Doors, windows, ribs, road paint, zebras, signs, clock faces and text are drawn flat in a face's own 2D units and placed with that face's matrix.
- **Hairlines.** Every edge is a `LineSegments2` exactly 1 CSS pixel wide at any zoom, the WebGL equivalent of `vector-effect: non-scaling-stroke`. Faces are flat, unlit and opaque, so the depth buffer hides lines behind them.
- **Day and night.** Every colour is a CSS custom property, with one set for dark and one for light. Through the evening the materials slide toward a single night palette. Windows and lamps are two extra fills that light up as everything else darkens.
- **Section drawings.** The warehouse and the shop each have a shell and a cut. The cut follows technical drawings: walls cut low and hatched on the cut, and the roof as an outline only.
- **The look.** It uses two greys for lines and one `--live` colour, reserved for what is live: the selection and its route, a busy bay's lamp, a forklift's beacon, the police light bars, the bank alarm and the lighthouse beam. Goods and uniforms use the two-tone fill.
- **The frame.** The page is a plate with `Fig 1` and the clock, the places, the instruction and a live readout in the four corners.

three.js and the font are bundled with the site, so it runs without loading anything from elsewhere.

## For testing

- `?debug=1` exposes `window.yard`:
  - `step(seconds)` runs the simulation forward.
  - `skip(hours)` moves the clock.
  - `select(id)` and `screenOf(id)` pick something and give its position on screen.
  - `look(x, y, zoom)` and `view(i)` move the camera.
  - `all()` lists everything.
  - The `incident`, `sim`, `shop` and `bank` state are there too.
- `?seed=<number>` changes the random seed. The simulation runs on a fixed 1/60 s step, so a given seed always plays out the same way.

## Credits

- Isometric kernel and visual language adapted from [ai-iso-skill](https://github.com/MrBongoC/ai-iso-skill) (MIT, © Tolga Cohce).
- Rendering by [three.js](https://threejs.org) (MIT).
