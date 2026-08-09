# Navigation is edited in Tiled

The `.json` files in this folder are legacy migration notes and are **not used by
the build**. The Tiled map is the sole source of truth:

`art/tiled/maps/<mapId>.tmj`

In Tiled, paint any tile on `NAV_BLOCKED` for water, cliffs, and other impassable
cells. Paint any tile on `05_BRIDGES` for a passable bridge/ford/stair cell. A
cell is 40px and the map grid is 32 columns x 18 rows. The game reads whether a
cell is empty or painted; the selected tile's artwork is not rendered over the
reference-map image at runtime.

After saving in Tiled, run:

```sh
npm run tiled:check
```

The command copies the `.tmj` into the browser assets and verifies that deployment
zones are clear and a route exists between the two castles.
