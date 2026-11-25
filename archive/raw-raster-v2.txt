# Experimental raw raster v2

Version 2 reconstructs actual photographic derivatives as rectangular arrays of samples. A decoder needs integer arithmetic and two-state data boundaries to recover the samples. Integrity verification also requires SHA-256. JPEG is an Earth-side source format, and PGM or PPM is an optional Earth-side preview. The binary frame requires neither format, a JSON parser, nor the development ZIP. The [monochrome raster v1 experiment](raw-raster-experiment.md) remains separately decodable. Physical retrieval and language-independent interpretation are open experiments.

## Frame layout

Each frame contains one raster; offsets count from zero. An octet has eight bits, numbered 7 through 0 from highest to lowest weight. Store its bits in that order. Integers spanning multiple octets are unsigned and big-endian. Hexadecimal here is documentation shorthand for human developers.

| Offset | Octets | Field |
| ---: | ---: | --- |
| 0 | 8 | Fixed marker `ff 00 ff 00 00 ff 00 ff` |
| 8 | 1 | Version `02` |
| 9 | 1 | Mode `01` (monochrome), `08` (grayscale), or `18` (RGB) |
| 10 | 2 | Width in pixels |
| 12 | 2 | Height in pixels |
| 14 | 4 | Positive record identifier |
| 18 | 4 | Payload length `N`, in octets |
| 22 | `N` | Raster payload |
| `22 + N` | 32 | Raw SHA-256 digest of bytes 0 through `21 + N` inclusive |

Valid dimensions are each 1 through 16,384 with a product of at most 16,777,216. The expected payload length is the ceiling of width × height × mode / 8, interpreting the mode as the indicated numeric bit depth. A standalone frame is exactly `54 + N` octets. A catalog photograph's ID is the decimal number in its existing `IMG-…` identifier. The top 65,536 IDs (`ffff0000` through `ffffffff`) are reserved for fixtures and demonstrations. The same image can use the same ID at multiple resolutions and depths; an external inventory represents those as separate derivatives.

In a displayed rectangle, the first sample represents the upper left. The horizontal coordinate increases to the right within a row. After the last column, the next sample begins at the left edge of the next row down.

- **Monochrome** uses one bit per pixel, 0 black and 1 white. Fill bit 7 through bit 0 in each octet. Packing continues across row boundaries. Set unused low bits of the last octet to zero.
- **Grayscale** uses one octet per pixel and gives 256 ordered display levels from 0 black to 255 white. Under the Earth-side display convention, map level `n` to the neutral sRGB triplet `(n, n, n)`.
- **RGB** uses three successive octets per pixel in red, green, blue order. Full range is 0 through 255 in each channel; alpha is absent. The display interpretation uses the sRGB convention below.

A strict parser validates marker, version, mode, dimensions, identifier, declared length, actual length, tail bits and digest before reporting successful reconstruction. For SHA-256, use the specified final eight 32-bit hash words, each written most significant octet first. There is no repair mechanism in this frame. A digest detects damage to fields or samples with the properties of SHA-256, and an unkeyed digest does not establish authorship. Keep any correction layer outside the frame, protect every byte including header and digest, then validate the recovered frame. A marker match alone is insufficient to locate a trustworthy boundary in damaged data. [NIST FIPS 180-4, §§ 5–6](https://doi.org/10.6028/NIST.FIPS.180-4).

## Color conventions and a physical teaching experiment

sRGB describes a human display encoding. It uses reference primaries of CIE 1931 chromaticity `(0.64, 0.33)`, `(0.30, 0.60)` and `(0.15, 0.06)`, with D65 reference white `(0.3127, 0.3290)`. For encoded sample `v`, set `c = v / 255`. The corresponding linear component is `c / 12.92` when `c <= 0.04045`, and `((c + 0.055) / 1.055)^2.4` otherwise. Component values represent additive contributions in this human color model. Appearance depends on viewing conditions and the observer. [ICC sRGB registry, IEC 61966-2-1 characterization](https://registry.color.org/rgb-registry/srgb) · [W3C CSS Color 4, sample conversion code](https://www.w3.org/TR/2026/CRD-css-color-4-20261123/#color-conversion-code).

A future primer specimen could pair a dispersive spectrum with measured vacuum wavelength ratios referenced to the [hydrogen transition](physical-primer.md). For example, wavelengths of 450, 550 and 650 nm correspond approximately to 2.13, 2.60 and 3.08 millionths of the 21 cm wavelength. Those spectral examples would locate regions to compare. Each sRGB primary describes a chromaticity, so a single wavelength cannot define the RGB channel. For an experimental calibration panel, choose a light source for each primary and record its measured spectral power distribution, the relative powers for the white mixture, and the spectra of representative mixed patches. Pair these with channel ramps, channel order and measurements of black and white. With a tabulated human color-matching model, a recipient could compute the intended tristimulus values or compare reconstructed spectra to the documented examples. The design still needs a physical readout experiment, and none of these mappings guarantees how an unfamiliar observer would perceive a scene. [CIE 1931 two-degree observer functions, CIE 018:2019 table 6](https://doi.org/10.25039/CIE.DS.xvudnb9b).

The v2 encoder assumes untagged RGB source samples should be interpreted as sRGB. Grayscale sources are replicated into the three channels before conversion. This preserves the intended range for typical previews and cannot establish calibrated scene radiance or recover an instrument's original spectrum. Some source images depict instrument measurements, including assigned display colors. The source provenance governs their scientific interpretation.

## Test vectors

The three synthetic vectors have distinct asymmetric shapes, with framing and padding visible in their documented bytes. Each file stores the concatenation of the header, payload and digest lines below. Vector identifiers are unrelated to the documentary photo catalog.

[Monochrome 3 × 5](../tests/fixtures/photo-raster-v2/mono-3x5.car)

```text
ff00ff0000ff00ff 02 01 0003 0005 ffff0001 00000002
96 b0
f9deef579e5f6e7f27a1aa276517ef9c75b348cc32c02bfcf2f30476cb60523d
```

Expected displayed rows are `100`, `101`, `101`, `011`, `000`. The least significant bit of `b0` is padding.

[Grayscale 5 × 2](../tests/fixtures/photo-raster-v2/gray-5x2.car)

```text
ff00ff0000ff00ff 02 08 0005 0002 ffff0002 0000000a
00 20 80 ff c0 10 50 70 e0 30
2d349af0a848c1b044858142b113285776cf16eb6d70fc35a77b688b67173817
```

Expected rows, in decimal, are `0 32 128 255 192` and `16 80 112 224 48`.

[RGB 2 × 3](../tests/fixtures/photo-raster-v2/rgb-2x3.car)

```text
ff00ff0000ff00ff 02 18 0002 0003 ffff0003 00000012
ff0000 008000 2040ff 10a020 ffffff 384060
e6416600a9a1f8c7818966663910ba422ee3331f5152e24c3510613192e72bdc
```

Expected rows contain two triplets apiece. They are `(255,0,0) (0,128,0)`, `(32,64,255) (16,160,32)` and `(255,255,255) (56,64,96)`.

## Reproduction

Python 3.10+ is sufficient to verify and decode a frame. Install Pillow for Earth-side encoding and budget measurements. Node.js provides an independent decoder against the same byte layout.

```sh
python -m pip install -r requirements-raster.txt
python tools/photo_raster.py encode archive/photos/earth-apollo17.jpg build/earth.car \
  --mode rgb --record-id 19 --max-edge 256
python tools/photo_raster.py inspect build/earth.car
python tools/photo_raster.py decode build/earth.car build/earth.ppm
node tools/photo_raster_independent.cjs build/earth.car > build/earth-independent.ppm
cmp build/earth.ppm build/earth-independent.ppm
python tools/photo_raster.py batch build/photo-raster-demo
python tools/photo_raster.py budget
python -m unittest discover -s tests -p test_photo_raster.py -v
```

Use `--ids IMG-019 IMG-050` and `--modes mono gray` to change the batch selection. For smaller primer samples, set `--max-edge 64`. Use a new batch output directory. Each derivative has a manifest entry with its byte length and digest, the source asset digest, and original catalog provenance including photographer, source links and rights. The manifest lives alongside the binary frames and is helpful for Earth-side accounting. Original photo assets and their metadata remain in the source collection. Redistribution requires preserving the applicable derivative terms; for example the Elodea photograph is CC BY-SA 4.0, and the family portrait's existing metadata flags a consent question before flight use. [Archive catalog](../archive/catalog.json).

The preparation sequence applies EXIF orientation then fits the uncropped image inside the requested longest edge without upscaling. Each scaled dimension is rounded to nearest with positive halves rounded up, and limited to at least one. Pillow BOX resizing operates on the encoded RGB channel values. Grayscale uses integer `(299R + 587G + 114B + 500) // 1000`; monochrome thresholds the grayscale value at 128 with no dithering. Input accepts single-frame RGB or L images without embedded ICC profiles. Different Pillow or JPEG decoder builds can change source decoding or resampling results. The manifest logs the Pillow version and JPEG implementation, and the pinned Pillow build used for this run was 12.2.0 with libjpeg-turbo 3.1.4.1 on Linux x86-64. The raw frame code has no such image-library dependency once the samples are prepared.

## Measured photo derivatives

The standard 256-pixel batch was encoded with all three modes. Counts below are complete frame lengths in bytes.

| Catalog record | Dimensions | Mono | Gray | RGB |
| --- | ---: | ---: | ---: | ---: |
| IMG-019, Apollo 17 Earth photograph | 256 × 256 | 8,246 | 65,590 | 196,662 |
| IMG-036, Grand Prismatic Spring | 256 × 171 | 5,526 | 43,830 | 131,382 |
| IMG-050, Elodea microscope image | 256 × 192 | 6,198 | 49,206 | 147,510 |
| IMG-073, three-generation family portrait | 256 × 171 | 5,526 | 43,830 | 131,382 |

At a 64-pixel maximum edge the test suite encodes each of these photographs twice, verifies deterministic bytes and provenance, decodes and re-encodes them, and compares both decoders' previews. The three synthetic vectors exercise 1,536 distinct single-bit changes throughout their bytes, plus malformed headers with recomputed digests.

## Full collection capacity

The following exact byte counts were computed from the dimensions of 104 included images and the framing rules. A temporary batch at a 64-pixel maximum edge produced and verified 312 frames across all three modes, matching the calculated totals. Larger scenarios are calculated only. The source JPEG total is 36,451,528 bytes. Each alternative includes one frame per image and 54 bytes of framing and digest for each frame. Manifest, preparation copies, other archive records, correction and physical redundancy are additional.

| Maximum long edge | Mono bytes | Gray bytes | RGB bytes |
| --- | ---: | ---: | ---: |
| 64 px | 44,880 | 319,728 | 947,952 |
| 256 px | 633,168 | 5,026,032 | 15,066,864 |
| 512 px | 2,513,312 | 20,067,184 | 60,190,320 |
| 1,024 px | 9,672,169 | 77,338,036 | 232,002,876 |
| Native | 23,146,409 | 185,131,952 | 555,384,624 |

To reproduce the full 64-pixel batch and its measured totals, run this from the repository root after installing Pillow.

```sh
PYTHONPATH=tools python - <<'PYTHON'
from pathlib import Path
from tempfile import TemporaryDirectory
from photo_raster import MODE_NAMES, batch, collection_budget, read_frame

with TemporaryDirectory() as directory:
    output = Path(directory) / "frames"
    batch(output, ids=None, edge=64, modes=[1, 8, 24])
    totals = dict.fromkeys(MODE_NAMES.values(), 0)
    for path in output.glob("*.car"):
        mode = MODE_NAMES[read_frame(path).mode]
        totals[mode] += path.stat().st_size
    assert totals == collection_budget(None, [64])["scenarios"][0]["frame_bytes"]
    print(totals)
PYTHON
```

For example, keeping source JPEGs and all 512-pixel RGB frames would consume 96,641,848 logical bytes before other content. At 256 pixels, the same pair uses 51,518,392 bytes. Choosing a useful mix for Centauri Core requires reviewing legibility at candidate resolutions, especially on photographs with small annotations, scale bars or fine anatomical detail.

## Canonical website reconstruction exhibit

The decoding guide reads the CAR v2 bytes published in `website/photo-reconstruction/`. Its source photographs are Apollo 17 Earth (IMG-019), an Elodea microscope view (IMG-050), Grand Prismatic Spring (IMG-036), a three-generation family portrait (IMG-073), and a Hubble image of Alpha Centauri A and B (IMG-011). The companion manifest includes credits, licensing terms, original sources, archive source digests, preparation changes, dimensions, and full frame digests. In particular, retain the Elodea derivative's CC BY-SA 4.0 terms and the Alpha Centauri image's exact credit, ESA/Hubble & NASA. The family portrait's catalog records a model-release question for flight use.

Each subject has 16, 32, and 64-pixel long-edge examples in all three modes. Earth also has 128-pixel examples. The page reads the actual frame fields, rejects invalid lengths or checksums, and reconstructs the sample grid from the payload. The 16-pixel samples pair marks with a row excerpt and illustrate how monochrome, grayscale and RGB represent the same grid. The selectable final preview reports its actual sample and framed byte counts.

The 32 × 32 Earth RGB frame has 3,126 bytes. The matching CAEC v1 file has 24 Reed–Solomon codewords of 255 bytes each for a total of 6,120 bytes. The browser can verify and unwrap this intact exemplar using its published inventory, then verify and reconstruct the CAR v2 frame. Use the command-line decoder to apply Reed–Solomon correction within the code's guarantees. [Archive protection specification](error-correction.md).

```sh
python -m pip install -r requirements-raster.txt
python tools/build_photo_exhibit.py build/photo-reconstruction
diff -r website/photo-reconstruction build/photo-reconstruction
python tools/protect_archive.py recover 19 build/recovered-earth.car \
  website/photo-reconstruction/img-019-e32-rgb.caec
cmp website/photo-reconstruction/img-019-e32-rgb.car build/recovered-earth.car
python tools/photo_raster.py decode build/recovered-earth.car build/recovered-earth.ppm
python -m unittest discover -s tests -p test_photo_exhibit.py -v
```

The checked-in examples were generated with Pillow 12.2.0 and libjpeg-turbo 3.1.4.1 on Linux x86-64. The ordinary site build copies these files without reinterpreting the source JPEGs. Browser-side checks require a secure context, which includes HTTPS deployments and a localhost development server.
