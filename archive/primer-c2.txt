# Primer C2 · Locating and reading smaller marks

C2 adds stage F to the [C1 teaching sequence](primer-ladder.md). A reader matches a coarse locator to a region, identifies an orientation marker within that region, enlarges the geometry, and transcribes a previously unseen set of states. C1's original specimens and numerical conventions are preserved. C2 is an SVG experiment and a procedure for a later physical test.

- [Text-free training panel](primer-c2.svg)
- [Annotated training panel](primer-c2-annotated.svg)
- [Versioned convention catalog](primer-c2-conventions.json)

## From a visible map to a fine tile

1. Repeated example strips show the same bounded cells at two sizes. All large cells have the same width. The paired bracket makes one large cell exactly as wide as four small cells. Matching inset patterns support the hypothesis that scale changes while state count and order are conserved.
2. Match the coarse four-position tag to the same tag beside a target. This mark is a label for the target, encoded most significant position first as in C1. The label stays separate from the more detailed payload.
3. Inspect the small enclosure within that target. Its interrupted edge and unequal marks align the tile with the large reference. Following connectors between corresponding limits introduces enlargement as a geometric operation. All tile row and column intervals scale by four between the teaching views.
4. Copy each eight-cell row in order. Begin on the side of the boundary break and proceed along the axis established by the two unequal marks. Then move to the next row away from these marks. Both annotated examples show the output as a three-row sequence. Retain each observed cell's inset state and mark unresolved cells as unknown. The C1 raster example uses a separate mapping to display intensity.

The versioned convention catalog records the stable identifiers, definitions, dependencies, and observations for conventions introduced in C1 and C2. Its schema version describes the catalog structure. The primer edition identifies the interpretation specimen. A subsequent edition should name any changed convention and keep historical meaning recoverable. Neither a tag nor the prototype tile assigns physical addresses to a flight format.

## Prototype readout

The diagrams are drawn in arbitrary units. At full width, the large and fine pitches are 20 and 5 units. For a test print with measured diagram width \(W\), the fine cell pitch is \(5W/1000\), independent of the viewer's magnification. For example, a verified 100 mm image width gives a nominal 0.5 mm fine pitch. Measure the actual printed width before reporting a result. Use the print or display for interpretation trials and use fabricated coupons for readout characterization.

For a coupon, place adjacent known open and inset cells at several pitches. Capture sequential images under controlled illumination and retain the unprocessed images. Record the objective, illumination geometry, wavelength or spectrum, scale calibration and specular effects. Measure adjacent cell separation and contrast, then transcribe an isolated held-out pattern. The reader should be able to distinguish neighboring marks and keep a stationary reference in view during repositioning. Estimate resolution independently from displayed scale. For a diffraction-limited objective imaging two point sources, the Rayleigh approximation is \(0.61\lambda/\mathrm{NA}\). Relief geometry, oblique lighting, contamination, sampling, focus and detector noise may dominate in real coupons. [Nikon MicroscopyU, Resolution](https://www.microscopyu.com/microscopy-basics/resolution)

The Long Now Foundation's Rosetta Disk is a useful precedent for using visible markings or text to lead to progressively smaller etched pages. Its reported readout is relevant to its own geometry and process. C2 needs its own measurements. [Long Now Foundation, *Care and Feeding of Your Rosetta Disk*](https://media.longnow.org/files/2/Disk_Care_Feeding.pdf)

C2 supplies a visual locator and a way to demonstrate geometric enlargement. A recipient would still need a usable readout method and a detectable material response. The mock-up provides no measured evidence about fine feature manufacture, illumination, focus, magnification, damage tolerance or independent interpretation. Data alignment across multiple physical sheets or carrier faces, and the link from raw states to a protected production archive, require further work.

## Reproduce and evaluate

Run `python tools/build_primer_c2.py` to regenerate the drawings from the structured sources. Run `python tools/build_primer_c2.py --check` to check byte-for-byte reproducibility. Facilitators can use the separate [C2 trial procedure](primer-c2-trial.md). The ordinary project website should use the training panels and this rationale. The facilitator supplies the task and records responses in an isolated session.
