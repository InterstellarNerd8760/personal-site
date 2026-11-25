# Centauri Archive decoding primer C1

C1 is an experimental sequence of diagrams for testing how unfamiliar readers infer a set of physical and mathematical conventions. The diagrams exist as reproducible digital mock-ups. Manufacture, independent interpretation trials and complete archive reconstruction remain open.

- [Text-free specimen](primer-ladder.svg)
- [Annotated specimen](primer-ladder-annotated.svg)
- [Held-out trial sheet](primer-ladder-trial.svg)
- [Earlier calibration and blind specimens](physical-primer.md)

Run `python tools/build_primer.py` from the repository root to regenerate the three SVGs from [the structured examples](primer-ladder-data.json). Run `python tools/build_primer.py --check` to compare the results byte for byte. SVG here is a drawing and manufacturing source format. A recipient of a carrier would observe the marks themselves.

## A · Find and orient the marks

The outer boundary has a break and two unequal marks at one corner. Each example starts with an isolated dot, continues with an evenly spaced line of filled or open positions, and ends at a bar. Three sequences agree and a fourth differs at one position. The group of repeats gives a candidate reference against which a local disagreement can be noticed. A systematic error or a deliberately distinct sequence can defeat majority interpretation. A surface experiment should repeat the frame near multiple edges and compare a reference specimen to measured defects.

Photographs of candidate materials under different illumination should establish a reproducible way to tell the two surface states apart. Filled areas in the SVG could correspond to pits, raised features or optical contrast. Which state to associate with each quantity is established in stage B, independently of material polarity.

## B · Count and compare

Count the dots within each boundary. The empty container pairs with an all-open positional pattern. Counting examples pair zero through seven with three positions. The separated dot groups underneath the last example encode the weights four, two and one. A filled location contributes its weight and an open location contributes zero. The eight-position groups on E reuse this ordering rule with weights 128 through one.

The left column successively pairs glyphs with dot-group comparisons, sums, differences, products, quotients and equivalent fractions. For example, a group of one and a group of two pair with a group of three, then a different pair using the same join glyph gives a group of five. Empty and identical groups illustrate equality. A narrow-to-wide glyph pairs smaller with larger twice. The signed line places negative groups on the opposite side of the empty group from positive groups, and two repeated sums combine negative and positive groups to give zero. A diamond occupies a quantity position and is replaced by a value in the adjacent worked equation. This is an experimental introduction to an unknown in a relation.

The right column uses square grids to support two examples of squaring and taking the positive square root. A cube example uses two square slices. Equal rows and columns make multiplication and factorization visible. The single-row groups of seven and five illustrate the trivial arrangement for primes. Interpreting primeness also requires trying other equal-group arrangements. For five, two-per-row leaves one. For seven, grouping in twos leaves one and grouping in threes leaves one. These arrangements are shown beside an example that divides into complete groups.

## C · Build relationships before naming units

Points mark ends of a segment and a small internal square marks one example of a right angle. Paired triangles and circles share shape while varying scale. Similar triangles can establish ratios of lengths, followed by area growth observed through four unit squares and volume growth through eight unit cubes when every side doubles. The projections retain human drawing conventions and need interpretation trials.

An open circle identifies the lattice origin. Pairs of groups distinguish horizontal from vertical offsets, and three placed points probe competing axis assignments. The succession below the cube shows one object at three locations, linked to increasing counts of equally spaced time steps. It can be read as a motion hypothesis. It could also depict separate stationary objects or a sequence with variable timing. A moving physical demonstrator would test those interpretations.

## D · Define a reference by measurement

The historical comparisons are specific. Voyager's cover uses the period associated with the neutral hydrogen transition as a clock reference for the record rotation and image timing. Pioneer uses the same transition for a time reference in its pulsar map and the associated wavelength as a length reference for the human silhouette. Both place a schematic reference next to encoded quantities. [NASA, Golden Record Cover](https://science.nasa.gov/mission/voyager/golden-record-cover/) · [C. Sagan, L. S. Sagan and F. Drake, “A Message from Earth,” *Science* 175, 881–884 (1972)](https://doi.org/10.1126/science.175.4024.881)

### Identify the reference phenomenon

1. The candidate is isolated neutral protium, containing one proton and one electron. The isotope comparison shows nuclei with zero, one and two neutrons. The electron's location on the page is a diagram convention.
2. Select the lowest electronic state, 1S. Within that state, the *total* spin quantum numbers are one for the upper triplet and zero for the lower singlet. The diagrams distinguish these by three and one possible spin projections. At zero external magnetic field the three upper projections have the same energy. The candidate transition changes the hyperfine level while leaving the electronic state the same. The upper-to-lower transition releases one electromagnetic quantum.
3. On Earth, identify it by exciting and detecting the ground-state hyperfine resonance of an atomic hydrogen beam or a hydrogen maser in an apparatus with controlled perturbations. Establish the transition frequency in the atom's rest frame, with the center extrapolated to zero magnetic field or corrected with a measured field model. Control Doppler effects, applied fields, collisions and apparatus shifts for the precision required. In the sky, the same line is useful for identification, subject to motion, gravitational shifts and line broadening. The line as received from a moving source does not define the clock without a rest-frame correction.
4. The associated electromagnetic cycle is one complete electromagnetic field oscillation. The reference time is its period and the reference length is the distance light travels in vacuum during that period. Neither quantity depends on the duration an atom waits before an emission. The two repeated wave trains illustrate counting whole cycles or wavelengths. The rest frequency used for the conversion below comes from the maser literature value reported by Diermaier and colleagues, 1,420,405,751.768(2) Hz. [M. Diermaier et al., “In-beam measurement of the hydrogen hyperfine splitting and prospects for antihydrogen spectroscopy,” *Nature Communications* 8, 15749 (2017)](https://doi.org/10.1038/ncomms15749)

| Quantity | Definition for the candidate units | Approximate SI equivalent |
| --- | --- | --- |
| Frequency | The unperturbed rest frequency of the selected line, νₕ | 1.4204 GHz |
| Time unit | One period, τ = 1/νₕ | 7.04024 × 10⁻¹⁰ s |
| Length unit | One vacuum wavelength, λ = cτ | 0.211061 m |
| Speed | λ/τ, the speed of light in vacuum | 299,792,458 m/s |
| Energy unit | The photon's energy, Eₕ = hνₕ | 9.41171 × 10⁻²⁵ J |
| Mass unit | The rest-mass equivalent, Eₕ/c² | 1.04719 × 10⁻⁴¹ kg |
| Temperature interval | A temperature change with kᴮΔT = Eₕ | 0.0681687 K |

The table provides Earth-side conversions. For a human-independent plate, length and time are multiples or ratios of the wavelength and period once the line is identified. The proposed energy unit uses the photon as the reference. Mass could be given in ratios to the proton rest mass to avoid very large counts. Temperature requires a separate teaching example. A candidate is the Maxwell–Boltzmann velocity distribution of a dilute, nonrelativistic equilibrium gas with a specified particle mass, where one Cartesian velocity component has variance kᴮT/m. The photon-energy ratio can then be tied to the measured variance. These extensions need additional demonstrations before the plate can support those measurements. [BIPM, SI Brochure](https://www.bipm.org/en/publications/si-brochure) · [NIST SP 330, §2](https://www.nist.gov/pml/special-publication-330/sp-330-section-2)

Independent dimensionless checks could help identify the atom and distinguish particle symbols. Two candidates are the proton-to-electron mass ratio, approximately 1836.152673426, and the fine-structure constant, approximately 0.0072973525643. Both would need a demonstrable definition and an error interval on the physical plate. Engraving the numbers alone would leave their meaning ambiguous. [2022 CODATA adjustment](https://doi.org/10.1103/RevModPhys.97.025002) · [NIST proton-to-electron mass ratio](https://physics.nist.gov/cgi-bin/cuu/Value?mpsme) · [NIST fine-structure constant](https://physics.nist.gov/cgi-bin/cuu/Value?alph)

The SVG encodes isotope, level multiplicity and cycle illustrations. It still lacks adequate text-free demonstrations of electromagnetic propagation, field removal, rest frame, and distinctions between ground-state hyperfine and other transitions. Stage D should be scored as a research probe with these gaps recorded explicitly.

## E · Reconstruct ordered values

Each training example begins with a dot and five four-position fields ordered as record ID, mode, width, height and pixel count. Each field uses positional weights eight, four, two and one, most significant position first. Two adjacent bars delimit the header. The payload is grouped into rows with end marks and a closing bar. The dots next to the output grid enumerate its row and column counts. The samples start at the upper left and move across each row before starting the row below. The pixel count equals width times height. Consistency among these redundant cues helps reveal competing interpretations.

| Mode | Values per raster cell | Sample meaning |
| --- | --- | --- |
| 0 | One two-state position | Open maps to dark and filled to light, as in the v1 experiment |
| 1 | One three-position number, weights four, two and one | 0–7 from darkest to lightest on the reference scale |
| 2 | Three consecutive three-position numbers | Red, green and blue channel codes, each 0–7 |

For the SVG swatches, map an intensity code to the nearest integer to `255 × code / maximum_code` and submit the resulting display codes to the SVG RGB renderer. For grayscale use the same value for each channel. These examples demonstrate code order and relative levels. The output colors depend on the renderer and the observer. They do not define universal physical sensations or imply that any primary is a uniquely specified single wavelength.

A physically grounded next experiment could provide three measured spectral power distributions for reference emitters, normalized in wavelengths relative to λ in D. Demonstrating mixtures of these spectra and the response at each code would distinguish the channels without relying on names or human sensation. Earth-side sRGB uses specified primaries, a D65 reference white, a nonlinear transfer function and a human standard observer. Spectral descriptions and viewing conditions would need to travel separately for an unfamiliar observer. [W3C, *A Standard Default Color Space for the Internet – sRGB*, Part 2 and Table 0.2](https://www.w3.org/Graphics/Color/sRGB.html)

The two pinhole diagrams show light paths from separated points crossing at an aperture and meeting a plane in reversed order. They introduce a possible physical process underlying a photograph. Future panels can pair actual objects, optical images and sampled raster cells to test whether a reader distinguishes an image from the depicted object. C1's small toy frames exercise the concept of a record. Teaching the synchronization, complete field definitions, corrupt-frame handling and error correction of a production format still requires examples.

## Blind interpretation trial

The companion [trial protocol](blind-primer-experiment.md#trial-c1--progressive-interpretation) gives a held-out task, scoring rules and reporting fields. A human trial measures the performance of these specimens with the recruited population. Familiarity with drawings, mathematics or digital images can affect the result even if no English explanatory labels appear on the specimens.
