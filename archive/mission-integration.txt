# Mission integration and carrier trade study

**Concept study · 24 November 2026**

Centauri Core is the candidate for an initial Fermi Explorer feasibility discussion. Its compact logical budget creates room for choices about readout and protection. All project-specific mission interfaces and allocations remain unknown. Fermi Explorer’s public FAQ and PSI feasibility report describe mission concepts with different study assumptions. Use the applicable spacecraft interface documents for engineering. [Proposal](fermi-explorer-proposal.md) · [Source comparison](fermi-mission-sources-2026.md)

## Engineering questionnaire

| Topic | Requested mission input | Status |
| --- | --- | --- |
| Available mass | Allowable contributor mass including mount, shielding, fasteners, harness and mass margin; mass-property and center-of-mass limits | Unknown |
| Dimensions and area | Maximum bounding dimensions, footprint, exposed area, volume, keep-outs, access and handling envelopes | Unknown |
| Geometry and mounting | Relevant integration drawings, candidate interior and exterior locations, line of sight and future access assumptions, coordinate frame, orientation, load path and attachment options | Unknown |
| Loads | Acceleration and limit loads by axis, random vibration spectrum, shock response spectrum and relevant launch or maneuver cases | Unknown |
| Thermal | Operational and non-operational temperatures, gradients and cycles, hot/cold dwell, conductive and radiative interfaces, perihelion exposure and attitude assumptions | Unknown |
| Radiation | Expected ionizing dose, displacement damage, particle species and energy distributions, fluence, spectra and shielding by location | Unknown |
| Dust and particle impacts | Expected flux, speed and angle distributions by mission phase, erosion and puncture assumptions, upstream structures and debris requirements | Unknown |
| Mission duration | Launch/operations phases, powered interval, cruise and target encounter assumptions, and the mission’s verification horizon | Unknown |
| Power and data | Available voltage, peak and average current, energy budget by phase, boot and shutdown policy, data interfaces and possible downlink | Unknown |
| Storage and visibility | Permission for a passive exterior primer, passive internal storage, separated placement with an independent surface witness, access markings and possible active memory or payload health sensing | Unknown |
| Materials and contamination | Prohibited substances, outgassing and particulate limits, bakeout and cleaning processes, surface treatments, handling, bioburden and any sterilization | Unknown |
| Mechanical integration | Attachment materials, fastener retention, allowable preload, differential expansion, fragment containment, ground handling and installation sequence | Unknown |
| Verification and schedule | Application dates, design freezes, responsible interface owners, qualification versus acceptance tests, workmanship requirements, reviews and documentation | Unknown |

Record each response with its source, revision, applicable spacecraft configuration, approval status and date. Derive project limits and keep margins explicit.

## Placement options

| Concept | Inspection and recovery | Spacecraft trade |
| --- | --- | --- |
| Exterior plate and exterior storage | Directly visible marks and a short readout path | Direct exposure, surface accommodation, abrasion and possible common-mode damage |
| Exterior marker and recessed carrier | An enlarged marked guide points to a protected stack | Adds shielding and removable or inspectable interfaces whose accessibility must survive damage |
| Exterior marker and internal carrier | Primer points to an internal structural location; independent exterior witness panel if feasible | Depends on recognizable access after enclosure changes; check placement against spacecraft hazards |

An optional electrical interface could support monitoring or active storage during the powered mission phase. Dense passive media still need a reader, such as reflected light and magnification or a polarization-sensitive optical instrument. The primer must describe relevant illumination, feature pitch, retrieval, and symbol reconstruction. A second copy earns a reliability benefit only where its failure modes differ. Comparing access and damage paths is more informative than doubling byte count alone.

## Media candidates and evidence

| Candidate and maturity | Density and mass to measure | Readout after power loss | Damage, stability and integration questions |
| --- | --- | --- | --- |
| Engraved metal, fabricated precedent | Coarse patterns optimize legibility. Dense analog microetching is a separate process. Use measured mark pitch, actual area, alloy density and thickness. | Visible/indirect light, then microscope; no spacecraft power | Scratches, impact craters and erosion can erase local areas. Test alloy/coating surface chemistry, contact corrosion, thermal expansion, detachment and contrast. The Voyager cover and Long Now nickel Rosetta Disk illustrate manufacturing approaches. [NASA][voyager] · [Rosetta Disk fabrication][rosetta] |
| Microetched silicon, established fabrication process; archive specimen proposed | A fine 2D pattern is plausible. Wafer thickness, process depth, yield and usable area control capacity and mass. | Optical or electron microscope depending on feature scale and contrast; no spacecraft power | Thermal stress at clamps and fragile edges can cause common-mode fracture. Study oxide/surface change, etch aspect ratio, cross-axis shock, radiation and impacts at the selected pitch. [Laermer and Schilp etching patent][bosch] |
| Fused silica or quartz-glass, archival laboratory/demonstration system | Volumetric features support multiple planes; usable layer count, defects and optical depth require measurement. Mount and enclosure may dominate mass. | A custom optical reader can extract data without a surviving spacecraft controller; precise optics, calibration and decoding remain necessary. | Compare stress, optical changes from exposure, readout after scratches, cracks and shock, and effects of damaged layers. Terrestrial system evidence is for the tested media and process. [Project Silica, ACM SOSP 2023][silica] |
| Optical discs, commercially available examples | Moderate/high density relative to hand-inspectable marks; measure the chosen substrate, metallization, geometry and framing overhead. | Powered external optical reader; servo, timing and physical-layer format need specifications and witnesses | Multilayer assemblies can degrade, scratch or delaminate. Check coatings, binders, thermal and chemical changes, radiation and whether sections remain readable. [Slattery et al., NIST JRES 109(5), 2004][optical] |
| Radiation-tolerant semiconductor memory, part-specific option | High density in components plus board, leads, shielding, connectors and containment. Request up-to-date component characterization. | Requires powered circuit and a usable or reconstructable controller and protocol. No assumption of onboard power on arrival. | Nonvolatile retention, total ionizing dose and single-event response are different measurements. Test the selected part, package, firmware, controller, interfaces and temperature together. [NASA NAND irradiation characterization, 2012][nand] |

Media choice balances physical legibility against density. The material, pitch, layer count, lifetime and shared failure modes remain open. Compare multiple coupons using the same reference mark design before choosing an architecture. Spacecraft-level radiation shielding and long-duration exposure are separate questions from coupon readout. The applicable verification authority defines levels, durations and margins. [NASA GSFC-STD-7000B, verification reference][gevs]

## Parametric estimates

For a rectangular storage layer with width `W` and height `H` in millimeters, square feature pitch `p` in micrometers, `L` equivalent readable planes, and assumed usable area fraction `u`, a square-cell model gives:

```text
cells_per_plane = floor(1000W / p) × floor(1000H / p)
raw_bytes_per_copy = floor(floor(cells_per_plane × L × u) / 8)
correction_bytes_per_copy = ceil(logical_bytes × correction_overhead_fraction)
protected_bytes_per_copy = logical_bytes + correction_bytes_per_copy
total_encoded_bytes = protected_bytes_per_copy × number_of_copies
substrate_volume_per_copy_cm³ = W × H × thickness_mm / 1000
substrate_mass_per_copy_g = substrate_volume_per_copy_cm³ × density_g_per_cm³
shield_mass_per_copy_g = W × H × total_equivalent_shield_thickness_mm × shield_density_g_per_cm³ / 1000
carrier_mass_g = (substrate_mass_per_copy_g + shield_mass_per_copy_g) × number_of_copies + mount_allowance_g
```

The one-bit-per-cell model gives a gross first-order comparison. Real media need measured pitch, optical margins, symbol mapping, block rounding and packing, markers, fiducials, layer spacing, thermal properties and yield. Shielding mass is a full-face equivalent estimate and gives no attenuation or particle survival credit. Each copy must fit within its own allocated byte capacity. Separately budget the exposed primer, cassette, voids, mounts, adhesive, fasteners or cables through actual geometry or explicit allowances.

For an illustrative 40 × 40 mm plate, 10 μm pitch, 70% usable area and one plane, the model gives 1.4 MB raw capacity per copy. A 100 MB logical edition with a hypothetical 15% correction allowance would require 115 MB per copy or 230 MB for two copies, before model-specific framing or block rounding not already included in the logical size. Redundancy adds a second 115 MB copy without increasing per-copy capacity. Neither case establishes achievable density or a spacecraft allocation. [Interactive model](https://interstellarnerd8760.github.io/centauri-archive/engineering.html#capacity)

The current Reed–Solomon prototype uses 255 bytes per protected block, carrying up to 134 logical record bytes after the 25-byte header, two 32-byte digests and 32 parity bytes. One copy of a record with `n` bytes uses `255 × max(1, ceil(n / 134))` bytes. Sum that function over each record before multiplying by copy count. For illustration, a single 100,000,000-byte record occupies 190,298,595 bytes per copy. Record boundaries and padding affect the total. The calculator’s percentage model leaves these record-by-record costs explicit in a separate budget. [Protection format and sizing command](error-correction.md)

## Evidence before design review

1. Freeze the exact encoded bits, documentation and primer layout for each candidate coupon. Include intentionally damaged specimens and known good reference captures.
2. Record fabrication tool, batch, alloy or glass composition, tolerances, substrate thickness and placement map. Measure local feature size, depth, contrast and imaging resolution required for reproducible readout.
3. Run independent first-read trials on printed primers, then on coupons using controlled sets of available instruments. Measure both reconstructed data and inferred semantics.
4. Compare initial and post-exposure physical features and data recovery after environment tests defined from mission inputs. Record failure classifications, location dependence, carrier/mount damage and material property changes.
5. Document life-model assumptions and uncertainty for each degradation mechanism, including localized damage, inaccessible layer or whole-carrier loss. Keep time extrapolations conditional on the model and measurement range.

[voyager]: https://science.nasa.gov/mission/voyager/golden-record-cover/
[rosetta]: https://rosettaproject.org/disk/technology/
[bosch]: https://patents.google.com/patent/US5501893A/en
[silica]: https://www.microsoft.com/en-us/research/wp-content/uploads/2023/09/ProjectSilica-SOSP23.pdf
[optical]: https://doi.org/10.6028/jres.109.038
[nand]: https://ntrs.nasa.gov/citations/20140000667
[gevs]: https://standards.nasa.gov/node/791
