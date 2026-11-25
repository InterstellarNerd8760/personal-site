# Centauri Archive editions

Centauri Core is the recommended starting point for a Fermi Explorer feasibility discussion. Centauri Extended is an optional, independently recoverable expansion. Both budgets are provisional logical-content targets. Fermi Explorer has provided no verified Centauri Archive allocation or integration requirements.

| Content | Centauri Core | Centauri Extended |
| --- | --- | --- |
| Physical decoding primer | Directly observable examples, reference quantities, a passive bridge to framed data | Complete primer and a local bootstrap for Extended records |
| Photographs and scientific diagrams | Curated photographic collection and original explanatory diagrams, with scoped raw raster representations | Full Core plus additional images and media as capacity permits |
| Encyclopedia and language | Essential knowledge, experimental visual vocabulary and introductory human language, with room to study selected expanded articles | Full Core plus deeper scientific and cultural collections, with multilingual material where feasible |
| History, culture and messages | Small curated selection with permissions, context and provenance | Broader records and additional media if feasible |
| Encoding and recovery | Local specifications, vectors, inventory, checksums and finite correction guarantees | The same capabilities, with an independent inventory and framing for large collections |
| Wikipedia | Outside the baseline | Candidate complete or nearly complete English article-text derivative, subject to extraction coverage, rights and size measurements |

## Capacity and independence

- **Core** aims for about 100 MB or less of logical content (100,000,000 bytes). Select each retained resolution, representation and metadata record before totaling. Keep the credited JPEG sources in the repository. A future carrier could use selected raw derivatives where teaching or readout warrants the extra bytes.
- **Extended** investigates logical storage of about 64 GB or more (64,000,000,000 bytes). Published compressed snapshot sizes cannot establish the size of the transformed and attributed records.
- **Physical encoding** adds framing, correction, interleaving or layout requirements, repeated metadata, spare regions and physically separated copies. Count the actual physical bytes or marks and then add carrier, mounting, enclosure and shielding mass. The surface primer has area and mass costs even when its bytes are absent from the digital budget.
- **Recovery** starts from a locally discoverable primer and inventory in each edition. Extended must carry its own Core content, format information and decoding references. Missing Extended media must not prevent Core recovery. This is a release design requirement that still needs a physical demonstration.

The current uncompressed development ZIP uses a separate 80,000,000-byte software limit. It packages human-readable records, source photographs and manifest integrity metadata. The raw raster and error-correction experiments are separate tools. The ZIP does not instantiate either proposed physical edition.

See the [mission proposal](fermi-explorer-proposal.md), [integration questionnaire](mission-integration.md) and [development milestones](roadmap.md).

The [knowledge architecture](knowledge-architecture.md) defines layer dependencies. The [measured budget study](knowledge-budget.md) estimates when a curated expansion could fit within Core.
