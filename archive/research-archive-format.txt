# CAX1 experimental logical record stream

CAX1 demonstrates independent record framing. It complements the uncompressed development ZIP, CAR v2 raster format and CAEC v1 correction format. The specimen uses ordinary UTF-8 English text and SHA-256. A physical reader would still need a taught mapping from marks to bits, a verified readout path and separate explanations of the character encoding, language and digest. Correction is applied outside the stream to individual frames. This is a versioned software research format.

## Frame layout

One stream contains consecutive frames in ascending record ID order. There is no global header. Every frame starts independently. Integers are unsigned and big-endian, with most-significant bit first. Offsets below start at zero. The reference readers bound the complete input at 128 MiB and individual payloads at 16 MiB.

| Offset | Width in bytes | Meaning |
| ---: | ---: | --- |
| 0 | 4 | Synchronization witness, hex CA 1C 66 2A |
| 4 | 1 | Version, 01 |
| 5 | 1 | Type, table below |
| 6 | 1 | Knowledge layer, 0 through 5 |
| 7 | 1 | Reserved, zero |
| 8 | 4 | Record ID, 1 through 4,294,967,294 |
| 12 | 4 | Payload length N, strictly positive |
| 16 | N | Payload |
| 16 + N | 32 | SHA-256 of the 16 header bytes and payload |

A digest verifies the internal byte relationship. It cannot repair data, indicate whether an entire record has vanished or independently authenticate the source. Retrieving a later complete record does not depend on interpreting a previous one.

| Type | Meaning and payload |
| ---: | --- |
| 01 | Mathematical foundation, UTF-8 text |
| 02 | CAR v2 raster, nested record ID equals frame ID |
| 03 | UTF-8 SVG diagram source, a development representation with a separate renderer dependency |
| 04 | Visual vocabulary entry, UTF-8 text |
| 05 | Encyclopedia article, UTF-8 text |
| 06 | Sources and reference notes, UTF-8 text |
| 07 | Attribution, rights and modification notice, UTF-8 text |
| 08 | Relationship table, binary |
| 09 | Readout or recovery instructions, UTF-8 text |
| 0A | Optional index witness, binary |
| 0B | Format and test vector documentation, UTF-8 text |

In text records LF separates lines. They must decode as UTF-8, contain no NUL, and contain a character outside ASCII space and the ASCII tab/newline/control whitespace range 09–0D. Format 03 is carried as text, not interpreted or executed by the reader. Additional independently specified diagram, symbol or compression encodings would need explicit future types or versions.

## Tables and recovery

A table begins with a four-byte unsigned element count and contains exactly that many entries. No trailing padding is allowed.

- **Relationships** use nine bytes per entry: source ID (4), target ID (4) and role (1). Rows are unique and ascend lexicographically by source, target, role. Role 1 means prerequisite, 2 illustrates, 3 credited by, 4 cites and 5 related. Self-links and invalid IDs are rejected. Both endpoints are expected in an intact stream. A prerequisite target may be in the same or an earlier layer. Prerequisites must be acyclic.
- **Index** uses ten bytes per entry: ID (4), type (1), layer (1) and payload length (4). Entries ascend by unique ID. The index lists every other frame. When present the index must agree with the intact stream. It provides an optional check for a missing record. It does not control access or supply offsets.

Strict mode rejects a malformed frame, duplicate or unordered IDs, dangling relationships and a contradictory index. An absent index is reported separately because every record can be opened independently. Salvage mode searches byte-aligned input for the synchronization witness, verifies candidates and reports rejected offsets, conflicting verified revisions and unresolved, forward, or cyclic prerequisite relationships. It does not certify completeness when the inventory is missing. The inner marker gives no alignment guarantee when a capture begins mid-byte. See the physical slot experiment for that problem.

Apply CAEC to each complete CAX1 frame using its CAX1 ID as the CAEC record ID. Once recovered, verify the CAX1 header and digest again. Two individually verified blocks for different revisions must never be silently combined.

## Reproduction

```sh
python tools/research_archive.py sample build/demo.cax
python tools/research_archive.py inspect build/demo.cax
node tools/research_archive_independent.cjs build/demo.cax
python tools/research_archive.py inspect build/demo.cax --extract 19 --output build/earth.car
python tools/photo_raster.py decode build/earth.car build/earth.ppm
```

The specimen carries actual archive mathematics, a canonical Apollo 17 thumbnail, the Earth vocabulary gloss and scientific article, sources, photograph attribution, links, recovery notes, this specification and an index. It does not need JPEG, ZIP or JSON for framing. The final textual payloads still assume a taught or known character encoding and language.
