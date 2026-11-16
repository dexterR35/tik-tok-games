# Original assets for Dream Garage: After Hours

The game consumes five original Blender exports and one generated environment image. There are no third-party vehicle meshes or licensed game assets.

## Editable Blender source

- `dream-garage-assets.blend`: modular workshop, six-destination district, sculpted coachwork, and 13 component groups. The workshop is visible by default; reveal the other collections in the Outliner to edit them.
- `workshop.glb`: architecture, lift posts, roller shutter, cabinets, pegboard tools, trolley, barrels, spare tires, pallets, platform, and strip lights.
- `district.glb`: six destinations, roads, loading aprons, streetlights, HVAC units, and container stacks.
- `coachwork.glb`: curved replacement body shell used by the customizable Three.js car.
- `coachwork-v2.glb`: updated tapered body, fuller wheel arches, separate curved bonnet, lower roof, glazing, and pillars. Loaded in preference to the earlier shell. Three.js adds wheels, lights, bumpers, engine, and upgrade parts.
- `coupe-v2.blend`: editable updated car source, with studio lighting and simplified wheels for the modeling preview. `coupe-v2-shape-preview.png` is a Blender shape preview, separate from the game renderer.
- `parts.glb`: component library, with stable `part_*` nodes for attaching details to the car.
- `part-*.png`: 13 transparent component thumbnails rendered from those Blender models with Cycles.

The repeatable source generator is `tools/build-garage-assets.py`. Run it from the project with:

```powershell
& 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe' --background --factory-startup --python '.\tools\build-garage-assets.py'
```

Regenerate the updated body and its preview with `tools/build-coupe-v2.py` using the same Blender command. The bonnet remains a separate node so the game can open it interactively.

The game batches static workshop geometry by material, loads assets locally through GLTFLoader, and retains the earlier procedural garage as a fallback. The district is a stylized destination selector, not an open-world driving simulation. The cars share a customizable modeling system.

## Generated night-workshop artwork

Saved asset: `nightshift-art.png` (1536 × 1024). Generated using the **built-in image_gen tool**, then copied into this project. It appears as a workshop poster, contract cover, destination artwork, and event background.

Final generation prompt:

> Use case: stylized-concept. Asset type: original environment artwork for the Dream Garage browser game, used as an in-world workshop poster and district-event card. Create a polished cinematic 3D concept-art image of an independent automotive tuning workshop in an industrial district at midnight, with an original unbranded olive-green Japanese-inspired 1990s sports coupe parked at a half-open garage door. Architectural concrete, corrugated steel, warm amber interior work lights, restrained acid-lime strip lighting, damp asphalt reflections, distant cranes and rooftop ventilation. Wide landscape 1536x1024 composition, car and workshop on the right half with atmospheric darker space on the left. Believable automotive proportions, tactile materials, premium game key-art finish, stylish without oversaturated neon. No people, no brand marks, no words, no numbers, no UI, no watermarks. This is scene art, not a screenshot of an interface.
