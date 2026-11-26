# Centauri Core feasibility proposal for Fermi Explorer

**Prepared for the Fermi Explorer mission team · 26 November 2026**

**Prepared by Centauri Archive, an independent open-source research project**

## Executive summary

We propose a feasibility collaboration to investigate carrying **Centauri Core**, a compact archive of Earth, life, humanity and foundational knowledge. Core would combine a directly observable decoding primer with passively readable records. The proposal starts with a logical content target of approximately 100 MB or less, including record framing and content metadata. Physical copies, error-control overhead, carrier, shielding and mounts require separate budgets. The proposal has no payload allocation, verified interface constraints, approval or integration agreement. We seek feedback on whether a small passive demonstrator merits further study and what requirements would govern it.

## Purpose and precedents

A physical record outlasting its builders creates a testable preservation problem. Can another observer detect deliberate markings, reconstruct information without the original playback system, and distinguish measurements or scientific models from messages and cultural accounts? A successful interpretation could tell a future reader what one technological species learned and what its home world was like. The project also produces open methods for teaching scientific concepts and preserving information independently of today’s platforms. Finding or interpreting the artifact remains uncertain.

Pioneer’s plaque uses an engraved message and a hydrogen scale. Voyager’s Golden Record combines images, sound and greetings with cover engravings that instruct playback and use the neutral hydrogen hyperfine transition as a clock reference. The Arecibo broadcast explored the opposite end of the design space with a short bit sequence that could be arranged into a picture. We propose a complementary contribution with linked factual explanations, reproducible encoding, and explicit recovery limits. [Pioneer authors’ paper][pioneer] · [NASA Voyager cover instructions][voyager] · [NAIC Arecibo technical paper][arecibo]

## Relationship to the published mission concept

Fermi Explorer’s FAQ describes an Alpha Centauri approach within 80,000 years and a spacecraft-wide payload objective of at least 1 kg and 10 × 10 × 10 cm. The FAQ and September 1 announcement also describe an intent to carry a Golden Record copy and solicit scientific and artistic contributions. The FAQ anticipates loss of spacecraft power after departure from the Solar System. These are published objectives and expectations. Any Centauri Archive envelope, location, connectivity, documentation and environmental limits would have to come from the applicable mission interface and integration team. [Official FAQ, primary and additional objectives and spacecraft design][faq] · [September 1, 2026 launch announcement][release]

The July 2026 Physical Superintelligence report commissioned by Fermi Explorer uses a 500,000-year arrival bound for its initial feasibility case. It studies a multi-revolution solar-electric perihelion-pumping trajectory, with a geostationary transfer orbit (GTO) departure emerging as a feasible modeled route under the report’s assumptions. The authors state that the report did not undergo comprehensive human peer review. The mission’s public engineering calculator explores further architecture trades. We use the studies to identify environmental questions and defer component limits to verified interface documentation. A distant passage near Alpha Centauri allows no assumption of interception or recovery. [PSI report, cover, abstract and executive summary][psi] · [Public trade calculator][calculator] · [Repository source review](fermi-mission-sources-2026.md)

## Minimum useful contribution and proposed contents

The initial hardware candidate is a small passive marked coupon with orientation witnesses, a paired thumbnail and short protected scientific records. It is a feasibility specimen, not a fixed flight configuration. The Core byte target is scalable and is not a minimum requirement. If the mission cannot accommodate a useful, accessible, protected configuration within an agreed mass and volume allocation, do not proceed to flight integration. Extended remains optional research.

| Edition | Logical content study target | Contents and independence |
| --- | ---: | --- |
| **Centauri Core** | Approximately 100 MB or less | Physical mathematics and science primer, curated photographic collection with provenance, explanatory diagrams, essential encyclopedia, selected expanded articles if the budget permits, trial visual vocabulary and language bridge, cultural and historical records, selected human messages, format specifications, and test vectors. Each complete Core copy would carry its own primer, index, framing and recovery instructions. |
| **Centauri Extended** | Approximately 64 GB or more, subject to a measured corpus and capacity trade | A self-contained Core copy plus full or nearly full English Wikipedia article text with preserved attribution, more scientific, historical and cultural records, and optional multilingual or multimedia additions. Expansion records would have independently recoverable framing, indexes and specifications. |

MB and GB are decimal throughout. Logical byte counts measure record content and framing, including its indexes and attribution. Protection bytes, physical copy count, area, volume, and carrier mass are separate engineering outputs. Media resolution and encoding are variables. Core is the initial proposal because it can be considered independently of Extended. Wikipedia inclusion depends on reproducible extraction, licensing and attribution review, measured size, and an appropriate carrier.

## Progressive knowledge and a first-read path

The proposed first encounter starts at a macroscopic orientation and access witness. Repeated coarse and fine patches point to a passive reading surface. Mathematics, physical references and image reconstruction establish a route to paired glyphs and language. The Essential encyclopedia targets 100–300 curated records. The Expanded encyclopedia targets 1,000–5,000 and can contribute selected records to Core. The optional Wikipedia corpus is a separate reference module with attribution and its own retrieval conventions. Earlier layers remain useful when later records or copies are lost. [Discovery-to-knowledge architecture](knowledge-architecture.md)

A source-ledger model projects that thousands of articles at current draft lengths could fit a 100 MB logical target alongside the source reproduction assets. Protection and redundant copies are counted separately. Longer articles, richer diagrams, physical alignment structures and material constraints could change the result. The budget does not identify a feasible carrier or favor a published spacecraft allocation. [Content and protection model](knowledge-budget.md)

## Physical architecture and installation concepts

An exposed layer would carry enlarged, asymmetric alignment marks and the first decoding exercises. Its diagrams would indicate how to locate and inspect a passive microscopic layer with detailed examples, established dimensions and access instructions. One or more dense substrates would preserve the main record. Smaller blocks with framing and error correction would help a reader recover useful portions after localized damage. A second physical copy or independently reachable subset would be considered if the spacecraft envelope permits it. Optional electronic memory would offer a separate readout path during any powered period.

For feasibility work, consider (1) a directly inspectable exterior plate, (2) an exterior marker leading to more protected contents, or (3) an internally mounted stack with an independent exterior marker, if allowed. Visibility, hardware clearances, shielding, surface finish, contamination and a mechanically secure load path need review together. The initial design trade compares engraved metal, microetched silicon and glass, other optical storage, and screened semiconductor memory. [Integration questionnaire, trade study and calculations](mission-integration.md)

## Decoding, error correction and preservation

The primer’s learning sequence progresses from repeated physical states and asymmetric alignment marks to quantity, arithmetic, geometry, measurement and ordered samples. A proposed physical reference is the frequency of radiation emitted or absorbed in the transition between the two hyperfine energy levels of neutral hydrogen in its ground electronic state. One period supplies a time interval. The vacuum distance traversed by light in one period supplies a linked distance scale. A diagram must establish which atom and transition are meant and show relationships between reference quantities before human unit symbols appear. Asymmetric small rasters with deliberately different dimensions and scan directions provide measurable reconstruction tasks before real photographs. The intended connection between RGB samples and the instrument’s representation still needs calibration examples. [Decoding primer research](physical-primer.md)

Protect each header and payload together, then verify the reconstructed record against an integrity field. A digest can detect disagreement with a reference and supplies no repair symbols. A self-contained protected index and repeated primer help recovery when an individual area fails. Error-correction guarantees depend on the number and arrangement of errors or erasures per block. A candidate scheme must report detected failures and wrong output under damage outside its budget. Length, order, record identifier and interpretation must each survive or be recovered. Independent decoder implementations and physical coupons test different claims.

## Development status and milestones

The development package includes 104 credited photographic records and 56 source-checked encyclopedia drafts. The photographs can be decoded in independent software implementations. The C2 primer adds paired coarse/fine patterns and a held-out readout exercise. A mixed CAX1 prototype frames actual mathematical, photographic, vocabulary and science records with citations and provenance. CAS v1 recovered a complete logical specimen from complementary damaged digital readouts even when the initial bit phase was unknown. With no surviving physical slot map, verified records may be recovered while completeness stays unknown. These tests start after a signal has been sampled. Physical mark acquisition and environmental testing are open. The C2 first-read pilot did not achieve exact unaided reconstruction; independent human trials are necessary to evaluate whether orientation, state mapping, dimensions and scan order can be inferred without hints. Such trials cannot establish extraterrestrial interpretability. [CAX1 specification](research-archive-format.md) · [CAS experiment](physical-recovery.md)

Propose a small marked coupon with observable orientation witnesses, two feature pitches, a paired thumbnail, and short protected records duplicated in accessible parts of the coupon. Measure optical contrast, feature classification and usable density. Ask independent readers to infer the sequence and separate readout success from interpretation. Collect scientific and cultural review and resolve rights before any edition is approved. The mission team would need to provide current engineering constraints before spacecraft compatibility could be evaluated.

| Milestone | Evidence to bring to review |
| --- | --- |
| 1. Proposal and screening | Candidate contents and provisional budgets, permitted payload class, interface questionnaire and study decision |
| 2. Encoding bench prototype | Documented primer stages, raw photographic records, deterministic builds and independent decoder agreement |
| 3. Recoverable records | Protected headers and records, seeded damage trials with failures reported, and recovery from an incomplete or damaged copy |
| 4. Scientifically reviewed collection | Verified claims and sources, reviewed vocabulary and captions, rights and attribution records |
| 5. Physical demonstrator | Coupons, recorded fabrication process, optical readout measurements, raw captures and independent interpretation trials |
| 6. Mission feasibility and qualification | Allocated interfaces, envelope and mass properties, reviewed mounting and material data, mission-approved environmental test matrix and results |

Coupon testing should record changes in feature readability and decoded data after exposure, alongside structural and contamination outcomes. Sample tests and analog human interpretation trials support specific claims within their measurement limits. Lifetime models require measured degradation mechanisms, defensible inputs and uncertainty bounds.

## Request to the Fermi Explorer team

The immediate decision is whether a feasibility study is of interest, not whether to approve a flight payload. The mission team may adopt the concept independently, collaborate on a demonstrator, or provide constraints and feedback for independent research. We would welcome clarification of the contribution pathway, compatibility with existing record plans, actual mass and volume allocation including protection and margin, candidate mounting locations, expected launch and cruise environments, verification criteria and deadlines.

Would Fermi Explorer consider a passive archive demonstrator under a prospective scientific or cultural payload pathway? If so, we request a technical point of contact, the current payload and verification documents, and guidance on the relevant solicitation dates. Centauri Archive could contribute content curation, encoding software and a bounded concept study for review. Physical fabrication, materials selection, qualification, funding and integration responsibilities would need to be agreed with the mission team and qualified engineering or manufacturing collaborators. This proposal does not commit the project to delivering flight hardware independently. We welcome early feedback on placement, cleanliness, prior record plans, fault containment, and whether an optional powered experiment would have any value. The companion questionnaire lists the information needed to scope that work. [Integration questionnaire](mission-integration.md)

[faq]: https://www.fermiexplorer.org/faqs
[release]: https://www.fermiexplorer.org/news/fermi-explorer-set-to-launch-humanitys-first-journey-to-another-star
[psi]: https://fermiexplorer.github.io/PSI.pdf#page=1
[calculator]: https://fermiexplorer.github.io/
[pioneer]: https://doi.org/10.1126/science.175.4024.881
[voyager]: https://science.nasa.gov/mission/voyager/golden-record-cover/
[arecibo]: https://doi.org/10.1016/0019-1035(75)90116-5
