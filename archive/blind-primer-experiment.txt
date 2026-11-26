# Blind interpretation experiment B

Status: untested, printable 2D mock-up, not an engraved carrier or proof of extraterrestrial readability.

The text-free specimen is [primer-blind-panel.svg](primer-blind-panel.svg). It pairs quantities (including an empty group) with three two-state positions, pairs the two physical states with image cells, and shows three rectangular rasters with asymmetric patterns. Repeated paired examples are intended to make the row grouping, dimensions and correspondence inferable. They do not demonstrate byte boundaries, frame synchronization, a physical unit of measurement, or the interpretation of a photograph. Black ink is the marked input state (1); the paired output cell is white, consistent with the raw raster v1 convention. The unmarked input state (0) maps to a black output cell. This mapping is illustrated, not proven inferable. Neither panel has been fabricated or tested.

## Blind protocol

Give each participant the specimen only (without the filename, captions, source code, or discussion of binary). Ask them to describe any rules they see and reconstruct an unseen rectangular pattern from a separate grouped stream. Do not confirm guesses before they submit. Use fresh volunteers for subsequent revisions, and record prior familiarity with binary and images, since human conventions bias this test.

Score each of these separately:
- Identifies the two symbol states.
- Associates grouped quantities with corresponding three-position patterns, including zero.
- Infers positional weights and orientation, demonstrated on a previously unseen quantity.
- Infers row length and number of rows from physical marks.
- Reconstructs an unseen asymmetric rectangular image without a hint.
- Explains ambiguities or alternate interpretations.

Record attempted answers, time, hints (if any), alternate interpretations and failure modes. Repeat with rotated, mirrored and partly obscured copies. Pre-register the task and scoring before collecting results. No real participant outcomes are claimed.

## Separate software interoperability test

Run `node tests/raw_raster_independent.cjs`. The JavaScript implementation follows the existing v1 byte layout without importing the Python decoder. It checks the 29-byte reference frame, dimensions, all 128 possible individual bit flips in the payload and complement, truncation, excess bytes, nonzero padding and an explicit common-mode corruption counterexample. The full Node test was executed successfully during development.

C1 extends this work with physically paired toy frames, scale and intensity demonstrations. Preserve the original ZIP and photograph masters.


## Trial C1 · Progressive interpretation

Use the text-free [training specimen](primer-ladder.svg) and [held-out task
sheet](primer-ladder-trial.svg). The [annotated guide](primer-ladder.md) is
for facilitators. Keep it, filenames, source data, answers and the annotated
SVG out of the participant session. If printing to separate pages, preserve
the complete outer frame of each panel and log the scale, print method and
lighting. Confirm that grayscale levels remain visually separable and log any
color compression or conversion. A monochrome replication should treat RGB
scoring as a different trial condition.

1. Register the stimuli, scoring, stopping time, participant eligibility and
   experimental conditions before recruitment. Give participants the unguided
   training specimen. Use a neutral prompt such as “Describe the relationships
   you find. Use those relationships to complete the next sheet.” The facilitator
   can deliver the prompt in a language the participant understands. The prompt
   supplies no interpretation rules, task answers or subject vocabulary.
2. Collect the first interpretation and give the task sheet without confirming
   any guess. Have participants mark orientation, demonstrate a new number,
   complete an equation and place a point. Ask them to reconstruct the three
   unfamiliar grids on blank paper. Leave the training specimen available for reference. For D, collect a free-form proposed
   measurement method from the specimen. Accept a drawing or an explanation
   in the participant's preferred language. Record alternate interpretations
   before showing any answer.
3. Give fresh participants a rotated, mirrored, inverted or partially obscured
   copy in a separate condition. Record the exact transformation and which
   cue is obscured. Assign conditions across volunteers before the trial, and
   keep a complete, untransformed baseline. A paired condition may use the
   older panel B to compare binary or raster interpretation. If participants see
   more than one specimen, record the order and treat earlier exposure as a
   potential learning effect.
4. A scorer who does not know the condition records the first response on each
   criterion. Use **2** for an exact unassisted response, **1** for a partially
   correct or internally coherent competing interpretation, **0** for an
   incompatible response, and **NA** for missing or inapplicable work. Mark
   multiple mutually exclusive guesses as ambiguity even if one is correct.
   Record assisted attempts separately.

| Stage | Exact unassisted response | Common alternatives to record |
| --- | --- | --- |
| A | Finds two distinguishable cell states, the asymmetric corner and start/end relation, and identifies the third training sequence's differing fourth state | Reversed scan, mirrored frame, added header cell, inversion, intentional variant |
| B | Converts the held-out four-position number to ten, and supplies six for the missing sum | Counts filled cells only, uses the wrong weight, treats the diamond as an operator |
| C | Places the point three lattice intervals right and two intervals up from the open corner | Swaps axes, counts endpoints, places the point in a cell instead of at an intersection |
| D | Separately identifies the candidate as the lower transition of ground-state neutral protium, gives one wave period as a time reference and one vacuum wavelength as a distance reference | Interprets the isotope markers as charges or energy levels, uses the emission lifetime, treats phase or amplitude as the length |
| E | Gives all IDs, modes and dimensions and reconstructs the three held-out rasters exactly | Swaps width and height, scans down columns, reverses polarity, counts channel values as pixels |

Score stage A's state, orientation and mismatch separately. Score B's
quantity and arithmetic independently. Record D's isotope, transition, time
and length separately. For E, record header field accuracy, placement
accuracy and intensity ordering independently. The held-out monochrome
record has rows `0101, 1100, 0010`. The held-out grayscale record has rows
`[7,0], [2,4], [1,6], [5,3]`. For the color task, accept three correctly
ordered numeric components per cell or the same triplets expressed as marks.
The RGB reference rows are
`[(0,0,0), (7,0,0), (2,0,5)]`,
`[(0,7,0), (0,0,0), (0,0,7)]`, and
`[(4,1,0), (3,2,6), (7,7,7)]`.

Log a pseudonymous session ID, specimen edition, condition, print or display
details, prior familiarity with binary and scientific diagrams if disclosed,
start/end times, each stage and criterion, first answer, alternative answer,
assistance, score and reason. Secure any consent and privacy review appropriate
to the recruiting institution before collecting data. Report counts and
denominators per condition, missing outcomes, completion-time summaries and
qualitative disagreements. Keep failed and ambiguous cases in the record.
No C1 interpretation results have been collected.
