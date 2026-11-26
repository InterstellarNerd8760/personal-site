# Error correction and recoverable records

Centauri Archive has two Earth-side correction experiments. Extended Hamming (8,4) makes the checks visible at the bit level. CAEC v1 protects numbered records with standard Reed–Solomon coding and separate SHA-256 integrity checks. The archive download still uses the existing ZIP development format. The [self-indexing readout experiment](physical-recovery.md) uses CAEC to recover slots after synthetic bit-phase shifts and longer losses. A physical reader still needs to establish mark polarity, reading direction and erasure positions from the carrier.

## Extended Hamming (8,4)

Arrange the four data bits, most significant first, in positions **3, 5, 6, 7**. Positions 1, 2 and 4 each make their group even:

| Parity position | Group |
| --- | --- |
| 1 | 1, 3, 5, 7 |
| 2 | 2, 3, 6, 7 |
| 4 | 4, 5, 6, 7 |
| 8 | All eight positions |

The first three groups are exactly the positions whose binary index has the corresponding bit set. A group's failure contributes its parity position to the **syndrome**. Over positions 1–7 this is the XOR of the positions with a one in the received word. Position 8 supplies the overall parity check.

For data `1011`, the three group parity bits are 0, 1 and 0. Four ones occur across the first seven positions, so parity position 8 is 0. The transmitted word, in positions 1 through 8, is `01100110`.

| Received word | Syndrome | Overall parity | Decoder action |
| --- | --- | --- | --- |
| `01100110` | 0 | Even | Accept under this code's error model |
| `01101110` | 5 | Odd | Reverse position 5 and read `1011` |
| `11100110` | 1 | Odd | Reverse parity position 1 and read `1011` |
| `01100111` | 0 | Odd | Reverse overall parity position 8 and read `1011` |
| `11000110` | 2 | Even | Reject, since positions 1 and 3 were changed |

Single-error correction and double-error detection are guaranteed. Three flips can make the decoder reverse another bit and report the wrong data. Four flips can turn one valid word into another. For example, positions 1, 2 and 3 flipped from `00000000` trigger a correction at position 8, which yields a different valid word. Flipping positions 1, 2, 3 and 8 directly reaches that word without a syndrome or overall parity failure.

The ordinary tests cover 128 single flips and 448 double flips across all 16 source values. Richard W. Hamming introduced the underlying construction in *Error Detecting and Error Correcting Codes*, Bell System Technical Journal 29 (1950), 147–160. [Original paper](https://doi.org/10.1002/j.1538-7305.1950.tb00463.x)

## Choice of practical code

| Family | Explainability and implementation | Overhead, correction and damage model |
| --- | --- | --- |
| Extended Hamming | Small XOR groups and direct bit indexing make independent decoding simple. The (8,4) example doubles storage. | Corrects one bit and detects two per word. Adjacent bit damage quickly exceeds its radius unless interleaved. |
| Reed–Solomon | Established finite-field polynomial codes and mature implementations. The reference code uses byte arithmetic, a recurrence and a linear solve. | This (255,223) code adds 32 bytes to 223 input bytes. It corrects any 16 unknown byte errors or any 32 known byte erasures in a word, with the mixed bound below. Several nearby flips in one byte count as one symbol error. Interleaving can spread longer bursts across words. |
| Binary BCH | Established algebraic decoding with finite-field arithmetic and bit-level correction. A specific code must be selected and specified. | Can be efficient when damage is dominated by sparse independent bit flips. Rates and guaranteed bit correction depend on parameters. An unspread burst can consume many bit corrections within one word. |
| LDPC | Sparse parity equations and typically iterative decoding. Requires the matrix, decoding algorithm, stopping rule and any soft-readout conventions. | Rate and performance depend on the chosen design and channel. Promising for longer blocks and a measured soft-readout channel. A guarantee cannot be inferred from the code family. |
| Separate erasure parity or copies | XOR parity is easy to teach. One extra parity block over a group can restore one known missing block. Exact copies require only identity and integrity checks to combine. | Idealized XOR overhead is one block per group. Two full copies double encoded size. Both depend on where losses occur. Copies or erasure groups must be separated enough to avoid common damage. |

The prototype is suitable for measuring software behavior, estimating costs and testing carrier readout assumptions. A choice for flight would depend on measured rates and patterns of bit errors, byte erasures, lost alignment and complete region loss. These code families were described by [Reed and Solomon, 1960](https://doi.org/10.1137/0108018), [Bose and Ray-Chaudhuri, 1960](https://doi.org/10.1016/S0019-9958(60)90287-4), and [Gallager, 1962](https://doi.org/10.1109/TIT.1962.1057683). CCSDS telemetry standards document other Reed–Solomon and LDPC designs. [CCSDS 131.0-B-5, sections 4 and 7–8](https://ccsds.org/Pubs/131x0b5.pdf)

## CAEC v1

Each codeword is **255 bytes**, including **223 systematic data symbols** followed by **32 check symbols**. The following offsets are zero-based and end-exclusive. Multibyte integers are unsigned and big-endian. Each byte carries eight bits, written most significant bit first in the serial bit-order convention.

| Byte range | Meaning |
| --- | --- |
| 0–4 | Format identifier, hex `43 41 45 43` |
| 4–5 | Version, `01` |
| 5–9 | Positive 32-bit record ID |
| 9–13 | Zero-based block index |
| 13–17 | Total blocks in this record |
| 17–25 | Total logical record bytes |
| 25–57 | SHA-256 of the complete logical record, repeated in every block |
| 57–191 | Record chunk, up to 134 bytes, with zero fill at the end of the final chunk |
| 191–223 | SHA-256 of bytes 0–190 inclusive, including the header, record digest and fill |
| 223–255 | Reed–Solomon parity over the preceding 223 bytes |

The total block count is `max(1, ceil(record bytes / 134))`. An empty record still occupies one block. All full chunks contain 134 payload bytes. The final chunk contributes only the bytes needed by the record length. A decoder validates the hashes, block dimensions and zero padding and rejects conflicting verified blocks. Only after every block is present and the assembled record passes its length and digest checks does the CLI write the recovered file. An independently trusted expected digest can select an intended revision. The stored digests guard against corruption and accidental misassembly. Authenticating originals would require an independent trust mechanism. [NIST FIPS 180-4, SHA-256](https://doi.org/10.6028/NIST.FIPS.180-4)

### Reed–Solomon conventions

A byte represents the coefficients of a binary polynomial with its low bit representing the constant. Addition is XOR. Multiplication reduces the product modulo `x^8 + x^4 + x^3 + x^2 + 1` (hex `11D` including the leading term). The primitive element α is hex `02`. This field convention is documented in RFC 5510 §8.1. CAEC uses a cyclic systematic code with the generator below. [RFC 5510 §8.1](https://www.rfc-editor.org/rfc/rfc5510.html#section-8.1)

- Interpret the data bytes in descending coefficient order as a polynomial `M(x)` with maximum degree 222. Use generator `G(x) = ∏ (x + α^j)` for `j=0…31`.
- Compute `R(x) = x^32 M(x) mod G(x)`. Append its 32 coefficients in descending degree order with leading zero coefficients as needed.
- Evaluate a received 255-byte polynomial `W(x)` at `α^j` for `j=0…31` to obtain syndromes `S[j]`. All-zero syndromes identify a codeword.
- For a zero-based damaged byte offset `p`, set `X[p] = α^(254 − p)`. A corruption of magnitude `E[p]` contributes `E[p] × X[p]^j` to `S[j]`.
- For known erasures, form `K(z) = ∏ (1 + X[p] z)`. Multiply the syndrome series by `K`, retain degrees from the erasure count through 31, and use Berlekamp–Massey on that ordered sequence to obtain the unknown-error locator `U(z)`. The combined locator `K(z)U(z)` vanishes at `X[p]^-1` for each candidate damaged position.
- Solve `S[j] = Σ E[p] X[p]^j` over the field using the first as many syndromes as positions found. XOR the solved bytes into those positions. Check all 32 syndromes and verify CAEC structure and digests before returning data. [Massey, *Shift-Register Synthesis and BCH Decoding*, 1969](https://doi.org/10.1109/TIT.1969.1054260)

The guarantee is **2 × unknown erroneous bytes + known erased bytes ≤ 32** per codeword. Positions of erased bytes must be correct. Corruption beyond the bound can produce decoding failure or a different valid codeword. The digest checks help reject the latter. An aligned short tail is treated as a known suffix erasure. Insertion, deletion or loss of alignment within the bitstream needs additional synchronization or an external slot map.

### Fixed vectors and commands

For RS data bytes `00 01 02 … DE`, the parity suffix in hexadecimal is:

```text
41841183b11fdb537421939696cda70e1db5c86684af222564b89cc6069f172e
```

The full codeword SHA-256 for CAEC record ID 42 containing the three bytes `61 62 63` is:

```text
388faca5a53ac82dd657cf0395e6fdcd25aa244a43a8cad38f4bea210e261562
```

```sh
mkdir -p build
python tools/protect_archive.py pack 42 archive/primer/raster-example.txt build/example.caec
python tools/protect_archive.py recover 42 build/example-recovered.txt build/example.caec
cmp archive/primer/raster-example.txt build/example-recovered.txt
python -m unittest discover -s tests -p test_error_correction.py -v
python tools/simulate_archive_damage.py --seed 20261124 --trials 20
```

Give the recovery command additional copy filenames to combine surviving verified blocks. The RS test vector was independently matched with `reedsolo` 1.7.0, `RSCodec(32, nsize=255, fcr=0, prim=0x11d, generator=2, c_exp=8)`. An additional 100 seed-20261124 trials matched parity and independently recovered original messages under mixed errors and erasures. The repository codec and CI tests run with the Python standard library. [reedsolo 1.7.0](https://pypi.org/project/reedsolo/1.7.0/)

## Damage simulation

Seed 20261124, 20 trials per row, four codewords per 500-byte record. Every accepted output was compared against its undisclosed original by the simulator. A local Python 3.12.14 run spent 78.896 ms packing the 20 original records. Recovery times are total wall time for each row, including validation, and depend on the machine and runtime.

| Damage case | Exact recoveries | Rejected or incomplete | Wrong accepted | Recovery ms |
| --- | ---: | ---: | ---: | ---: |
| Clean baseline | 20 | 0 | 0 | 53.571 |
| 12 random isolated bit flips per codeword | 20 | 0 | 0 | 158.028 |
| 48 consecutive changed bytes in one codeword | 0 | 20 | 0 | 61.855 |
| 48 consecutive changed bytes across an interleaved group of four | 20 | 0 | 0 | 157.144 |
| One complete missing block | 0 | 20 | 0 | 37.708 |
| Seven damaged header bytes | 20 | 0 | 0 | 70.084 |
| Sixteen damaged check bytes | 20 | 0 | 0 | 84.264 |
| 20-byte aligned tail truncation | 20 | 0 | 0 | 96.162 |
| 40-byte aligned tail truncation | 0 | 20 | 0 | 40.082 |
| 17 randomly changed bytes in one codeword | 0 | 20 | 0 | 61.128 |
| Deliberate corruption nearer to another codeword | 0 | 20 | 0 | 86.036 |
| Complementary missing blocks and correctable damage across two copies | 20 | 0 | 0 | 119.982 |
| Same block missing in both copies | 0 | 20 | 0 | 80.694 |

The deliberate corruption produced an incorrect valid Reed–Solomon codeword in all 20 trials. CAEC's separate block hash rejected all 20. These counts describe synthetic test cases and do not establish a physical error rate. The 500-byte records take 1,020 protected bytes in one copy (520 overhead) or 2,040 across two copies (1,540 overhead). Reed–Solomon alone adds 32 check bytes per 223 data bytes, or 14.35%. CAEC also spends 89 of the 223 data bytes on metadata and digests. Each partially filled slot adds padding. At full slots one copy stores 255 bytes per 134 logical bytes. For multiple records, compute and round each record separately before adding physical copies.

The tested interleave primitive lays out a complete group byte-column first. A 48-byte contiguous span at depth four visits at most 12 positions in each codeword. The CLI writes a sequential copy by default. A physical interleave would need a protected, repeated layout map, with recovery procedures for missing cells or incomplete groups.

## Archive and carrier consequences

Apply block protection to the record inventory and decode instructions where they are digitally stored. Duplicate those blocks in separated locations and repeat the physical primer. Map surviving slots by verified record ID, block index, record length and total blocks. Recover a complete record even when another record fails. A future carrier study should test synchronization, correlation across copies, readout resolution and error detection using damaged samples before setting a copy count. The present reference codec validates individual records and uses memory proportional to one reassembled record. A large-corpus comparison should measure performance with accelerated implementations, different block sizes and representative readout traces.

### Recovering a photographic record from two damaged copies

On the reference Pillow build, the 256 × 256 monochrome frame of IMG-019 contains 8,246 bytes. Protection expands it to 62 slots, or 15,810 bytes for one copy. The following experiment zeroes a different slot in each copy and corrupts twelve distinct check bytes in its usable counterpart. Each copy alone is missing a different chunk. Combining the verified chunks reconstructs the original frame and its 65,551-byte PGM preview.

```sh
mkdir -p build/photo-recovery
python tools/photo_raster.py encode archive/photos/earth-apollo17.jpg build/photo-recovery/earth.car \
  --record-id 19 --mode mono --max-edge 256
python tools/protect_archive.py pack 19 build/photo-recovery/earth.car build/photo-recovery/earth.caec
python - <<'PY'
from pathlib import Path
root = Path("build/photo-recovery")
source = (root / "earth.caec").read_bytes()
for missing, degraded in ((0, 1), (1, 0)):
    copy = bytearray(source)
    copy[missing * 255:(missing + 1) * 255] = bytes(255)
    for offset in range(223, 235):
        copy[degraded * 255 + offset] ^= 0x5A
    (root / f"copy-{missing}.caec").write_bytes(copy)
PY
python tools/protect_archive.py recover 19 build/photo-recovery/recovered.car \
  build/photo-recovery/copy-0.caec build/photo-recovery/copy-1.caec
cmp build/photo-recovery/earth.car build/photo-recovery/recovered.car
python tools/photo_raster.py decode build/photo-recovery/recovered.car build/photo-recovery/recovered.pgm
```
