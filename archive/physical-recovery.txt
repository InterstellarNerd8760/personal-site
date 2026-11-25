# Self-indexing CAEC readout experiment

The CAS v1 specimen is a digital stand-in for a passive carrier readout. It stores the mixed [CAX1 research specimen](research-archive-format.md) as individually protected byte records. The reader can find intact slots without a starting bit phase or a working catalog and combine surviving slots from different readouts. A physical demonstrator would still need to establish mark polarity, scan direction, dimension, signal thresholds and a reliable reading of the raw marks.

## Reproduce the specimen

```sh
mkdir -p build
python tools/physical_recovery.py sample build/mixed-physical.cas
python tools/physical_recovery.py recover build/mixed-recovered build/mixed-physical.cas
python tools/physical_damage_study.py > build/physical-damage.json
python tools/physical_damage_study.py --timing > build/physical-damage-timing.json
python -m unittest discover -s tests -p test_physical_recovery.py -v
```

Use a new output directory for each recovery. Additional readout filenames contribute verified slots from other copies. The recovery command writes one numbered file per verified record. Its report distinguishes complete coverage (exit 0), partial or unknown coverage (exit 2), and a failed invocation (exit 1). Join the recovered CAX1 frames in ascending numeric ID order to examine the logical stream. CAX1 can inspect frames without its optional logical index.

To pack other small records, run `python tools/physical_recovery.py pack build/example.cas 1=path/to/record.bin 2=path/to/another.bin`. The same tool can recover them without interpreting their contents.

## Slot layout

Each pristine copy has contiguous 271-byte slots. Serialize bytes most significant bit first.

| Bytes | Role |
| --- | --- |
| 0–7 | Exact sync token A, hex `d3 92 e7 ac 15 80 4b f9` |
| 8–15 | Exact sync token B, hex `2e 6c b0 17 f8 43 9d a5` |
| 16–270 | Existing [CAEC v1 codeword](error-correction.md#caec-v1), including its Reed–Solomon parity and block digest |

Search each of the eight binary bit phases for both tokens. A hit on A implies the slot starts at the hit. A hit on B implies the start eight bytes before that hit. Deduplicate these candidate offsets. A complete token is enough to propose a candidate. The damaged second token does not consume CAEC correction capacity. If the readout begins within token A, token B can locate an intact codeword whose inferred slot start is negative. A terminal short word can use the existing CAEC known-tail erasure rule.

Run normal CAEC correction and hash validation before accepting a candidate. Corrected CAEC metadata supplies record ID, index within the record, total block count, total length and record digest. Group independently verified blocks by record ID and use those fields and digests to reassemble a record. Lost slots can shift the subsequent phase and positions, so physical offsets are search evidence and never substitute for verified record identity.

The reader accepts arbitrary forward bit phase shifts, byte insertions/deletions between slots and phase changes within a capture. If both exact tokens of a slot are destroyed, the scanner can skip that slot and still find neighboring ones. Bit slips inside a codeword can exceed the byte-substitution model. The readout prototype does not search reversed polarity or direction, infer unknown interleaving, or claim synchronization under arbitrary damage. The tokens are fixed format constants. Their false-hit rate has yet to be measured on a physical specimen.

## Protected slot map

Reserve CAEC record ID `0xffffffff` for the physical map. A pristine copy starts and ends with the same complete, CAEC-protected map. The data slots between the maps are ordered by increasing numeric record ID and then increasing block index. Ordinary record IDs range from 1 through `0xfffffffe`.

Map integers are unsigned and big-endian.

| Bytes | Meaning |
| --- | --- |
| 0–3 | Map identifier, hex `43 41 53 4d` |
| 4 | Version, `01` |
| 5–6 | Number of non-map records |
| 7 onward | Exactly that many entries of 48 bytes each |

Each entry contains a 4-byte record ID, 8-byte complete record length, 32-byte SHA-256 digest of that complete record and 4-byte zero-based first-slot ordinal in a pristine layout. The first ordinal equals the number of map slots. For each record, advance by `max(1, ceil(record_length / 134))`. Reject noncanonical ordinals, counts, sizes and IDs. The map can be assembled from surviving parts of either bookend or different physical copies.

A verified map shows which records to expect and can select an intended digest among different damaged or revised readouts. A record must match the map's digest and length before it counts toward completeness. With two conflicting valid maps, the reader reports conflict and recovers only records whose available CAEC blocks agree independently. With no valid map, it can still recover consistent records and marks overall coverage unknown. Neither self-check validates that a specimen came from a trusted sender.

The small reference profile accepts 128 logical records at most, 500,000 bytes per record, 2 MiB per readout, eight readouts and 8,192 candidate offsets per readout. These are software resource limits. The experiment sets no spacecraft allocation, physical density, or mission packaging requirements.

## Measured synthetic damage study

The reference run used seed 20261124 and the ten CAX1 frames, including the Earth photograph with ID 19 and the optional CAX1 index with ID 506. Each accepted frame was compared byte-for-byte with the original. The run stored 11,130 logical bytes in 97 slots or 26,287 bytes per complete copy. Two copies use 52,574 bytes and three use 78,861 bytes. Per copy, the 15,157 bytes of overhead include 1,552 bytes of sync tokens and 2,168 bytes of fully framed map bookends. The latter already include 128 sync bytes. Additional overhead comes from CAEC metadata, integrity and correction symbols and unused final-slot space.

One Linux Python 3.12.14 run encoded the specimen in 104.3 ms and completed the full study in 1.32 seconds. Peak process RSS was 16,564 KiB. Recovery includes scanning, correction and record validation. Timing varies by machine and runtime. The untimed JSON keeps sizes, record digests, candidate counts and before/after slot coordinates reproducible.

| Simulated readout | Exact frames | Coverage | Recovery ms |
| --- | ---: | --- | ---: |
| Clean baseline | 10 | Complete | 60.385 |
| Unknown initial bit phase | 10 | Complete | 61.991 |
| Seven inserted bytes between slots | 10 | Complete | 59.729 |
| Three-bit slip between slots | 10 | Complete | 61.259 |
| One sync token lost and 15 CAEC symbols altered | 10 | Complete | 69.218 |
| Both sync tokens lost in an Earth slot | 9 | Earth missing | 71.376 |
| 48 consecutive changed codeword bytes | 9 | Earth missing | 64.145 |
| One Earth slot removed, shifting downstream offsets | 9 | Earth missing | 61.966 |
| Both physical map bookends removed | 10 | Unknown | 54.004 |
| Two copies lose different Earth slots, with marker and symbol damage in one surviving slot | 10 | Complete | 130.367 |
| Two copies lose the same Earth slot | 9 | Earth missing | 117.128 |
| Third copy supplies the slot missing from both other copies | 10 | Complete | 186.456 |
| Last slot loses its final 28 bytes | 10 | Complete | 63.619 |
| CAX1 index slots removed | 9 | Logical index missing | 57.984 |

No case accepted incorrect frames. The complementary-copy result used blocks from both incomplete copies to reconstruct the Earth frame. Complete copies still share common risks. A physical arrangement needs to test loss correlation across separated regions, orientation signaling, variable bit pitch and realistic damage and readout errors. The experiment injects deterministic faults into bytes and bits and provides no measured environmental tolerances or survival probability.

## Readout data for diagrams

The study exports bit offsets from the beginning of each readout, a role for map and data slots, within-record indices, intact token counts and the number of CAEC symbols changed by correction. `slots_before` lists the pristine copy. Each scenario's `slots_after` lists only verified candidates, one array per readout. Align diagrams by verified record ID and within-record index when showing which regions survived. An offset may move when slots go missing.

## Surface geometry and correction trade

`python tools/physical_surface.py` maps the actual slot stream onto a configurable raster of physical cells. Width, height and pitch are integer micrometers. Planes are sampled in order, each top-to-bottom and row-major after a reserved primer band. The model assumes one bit per cell and treats an obscured rectangular region as zero readings. The material, illumination and optical transfer function are outside the model. An illustrative 40 × 40 mm surface at 80 μm pitch gives 500 × 500 cells. Reserving four rows leaves 248,000 data cells. A full-width obscured row leaves nine verified records. An additional copy supplies the missing record. The discovery page visualizes the measured slot results and labels the geometric inputs as assumptions.

At a fixed 255-byte codeword, keeping the 89 bytes of CAEC metadata and digests would leave 150, 134 or 118 framed payload bytes with 16, 32 or 48 parity symbols respectively. Ideal Reed–Solomon bounds would then be 8, 16 or 24 unknown erroneous bytes, with up to 16, 32 or 48 known erasures in the respective cases. Only the 32-parity CAEC profile is implemented in this specimen. Denser chunks or omitted per-block digests would trade away local validation or change failure behavior. Phase I interleaving spread a contiguous burst across four codewords. A physical interleave needs its own taught layout and tests; the current CAS profile keeps each codeword within one slot.

For fabrication, ask a qualified lab to produce candidate coupons with measured pitch, edge quality and contrast in two candidate mark states. Capture an optical image at documented illumination and resolution before and after controlled abrasion and alignment changes, then score errors and erasures separately. Evaluate a second spatial placement against the same exposure. Thermal, vibration, radiation and contamination requirements depend on verified spacecraft inputs and subsequent qualification.
