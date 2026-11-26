# Physical decoding primer — research specification, not a finished artifact

## The essential problem

A human can unzip a file, read English and interpret a diagram. An unknown
reader can be assumed to do **none** of those things. No primer can guarantee
that another intelligence interprets marks as we intend. The aim is to design
a sequence whose interpretation can be independently tested and made less
dependent on human conventions.

The current ZIP is only a convenient software-development container. The
physical primer must be useful **without** that ZIP, electricity, or the
operational survival of the spacecraft's computers.

## Proposed reading ladder

1. **Detect artifact and orientation.** Repeated marks, a deliberately
   asymmetric corner and larger-scale repetitions help identify intentional
   structure and viewing direction. This does not prove intent to every reader.
2. **Count physical features.** Display one, two, three and other distinct
   marks, adjacent to repeated groups of the same counts. Avoid our numerals.
3. **Establish mathematical operations.** Spatial groupings express addition,
   equality and simple ratios; prime-number sequences may support hypotheses
   about intentionally organized information.
4. **Demonstrate a grid and its scan order.** Show an image directly beside
   the sequence of cells from which it is constructed. Repeat patterns with
   mirrored and asymmetric features to reveal orientation and bit ordering.
5. **Ground units in reproducible physical phenomena.** Candidate reference
   scales include atomic spectral transitions. C1 illustrates and defines a
   candidate hydrogen reference. How to teach and measure it remains open.
6. **Bridge to physical diagrams.** Use scaled diagrams and repeated pairs of
   visual representations and symbols. Slowly introduce Earth, the Solar
   System, chemistry, cells and organisms before human culture.
7. **Only then introduce a larger data store.** Define framing, symbol
   alphabet, byte order, addressing, format, error-control coding and media
   readout with examples whose decoded results are displayed physically.

The first independent-readability experiment should provide ONLY a prototype
panel, no oral instructions, and ask unfamiliar human testers to infer the
counts, image orientation and scan order. That is an imperfect but useful
test, not evidence of extraterrestrial readability.

## Proposed specimen acceptance criteria

- An engineered carrier with recorded material and manufacturing process.
- Measured feature size, optical contrast, geometry and mass.
- Before/after microscopy and a documented damage map.
- Independent interpretation trials that score each stage separately.
- Simulated local scratches, missing sections, inversion and rotation.
- A traceable relation between physical marks and a *separately specified*
  minimal raw data format, not an undocumented ZIP dependency.

We do not yet know whether etching on metal, glass, silicon or another
material is the best choice. Geometry, radiation, dust exposure, thermal
cycling, mounting, contamination, impact shielding and readout conditions
depend on the actual mission.

## Experiment A: implemented illustration, not validated

The repository includes `docs/primer-panel.svg` (a printable **concept**
drawing), `archive/primer/raster-example.txt` (eight rows of eight 0/1
symbols), and `tools/decode_raster.py` (a reference decoder that produces a
portable grayscale image). This creates a concrete correspondence between a
row-major sequence and a two-dimensional image.

The SVG's English annotations and printed binary digits are there for human
developers, not a solution to the language-independent decoding problem.
The underlying marks need to be redesigned, manufactured and blind-tested.
The later specimens below support testing whether unfamiliar readers can
infer the mapping **without** the explanatory text.

## Experiments B and C1

Experiment B tests the progression from physical counts to asymmetric,
rectangular binary rasters. Preserve it as a simple comparison specimen for
the expanded [primer C1](primer-ladder.md). C1 adds a structured, reproducible
sequence for orientation, arithmetic, geometry, a candidate hydrogen
reference and toy raster records with dimensions, identity, grayscale and
color channels. The [blind interpretation protocol](blind-primer-experiment.md)
covers both specimens. A manufactured plate, measured readout, completed
interpretation trials and a physical-to-archive decoding demonstration remain
development milestones.

## Experiment C2

[C2](primer-c2.md) adds a two-scale teaching panel, target locators and a
held-out readout exercise. Its convention catalog names the interpretation
rules shared with C1. The experiment tests the transition from an outer map
to smaller marks. Physical measurements are a later step.
