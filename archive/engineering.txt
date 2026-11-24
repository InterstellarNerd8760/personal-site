# Engineering: what we know and what we do not

## Architecture

1. **Physical primer** — a proposed passive, readable sequence of marks that
   could introduce counting, physical units, data framing and image decoding
   without relying on English or an operating computer. Not fabricated.
2. **Core records** — concise descriptions of Earth, its biosphere and human
   civilization; today these are human-readable original texts.
3. **Expanded library** — future additions such as imagery, languages,
   recordings, molecular data, chronologies and an approved personal message.

The first archive is a **digital test package**, not a flight system. A separate
physical decoding design is described in [physical-primer.md](physical-primer.md).

## Data integrity versus recovery

- **ZIP CRC and SHA-256:** identify accidental corruption relative to a
  reference. They do not reconstruct missing information. If the manifest
  and payload both change, the manifest alone does not prove authenticity.
- **Redundancy:** duplicate records in physically separated regions to reduce
  shared local failure risk.
- **Error correction:** a future Reed–Solomon or comparable scheme could
  correct defined error/erasure patterns. This has not been implemented.
- **Damage models:** random isolated bit flips, burst errors, scratches,
  missing blocks and total failure require different mitigation strategies.

A trustworthy archive-health report might include verification counts,
corrected/uncorrectable error counts, last successful scrub, temperature,
and supply voltage, **but only if power and telemetry are granted**. No
existing monitoring subsystem or accessible spacecraft interface is assumed.

## Physical and spacecraft risks

Radiation, thermal aging, electronics failure, vibration and micrometeoroid
impacts may degrade storage. Faster transit raises impact-environment
questions and mass may affect spacecraft performance. A passive etched
reference and active digital memory have very different failure modes.
No claims are made for a specific lifetime, qualification, radiation
tolerance or probability of future discovery.

A spacecraft traveling toward a stellar system is not necessarily captured
there or discoverable. A trajectory, a working communications mission and
a recoverable artifact are different design problems.

## Testing before flight consideration

Obtain spacecraft constraints; fabricate carrier coupons; measure physical
features and environmental exposure; record pre/post readout; test blind
decoding; compare protection strategies by measured data loss per added gram.
Do not extrapolate 80,000-year durability from short laboratory tests.