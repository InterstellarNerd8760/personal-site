# Centauri Encyclopedia — development specification

The development edition contains AI-assisted, source-checked explanatory drafts. Independent factual and cultural review is pending.

## Canonical hierarchy

01. **Mathematics** — Numbers, logic, geometry, algebra, computation.
02. **Physical universe** — Particles, elements, forces, astronomy, cosmology.
03. **Earth** — Geology, oceans, atmosphere, geography, climate.
04. **Life** — Biochemistry, DNA, evolution, biodiversity.
05. **Humanity** — Anatomy, cognition, language, reproduction, society.
06. **Civilization** — History, cultures, institutions, economics, philosophy.
07. **Technology** — Agriculture, engineering, medicine, computing, spaceflight.
08. **Culture and experience** — Art, music, literature, everyday life.
09. **The archive and mission** — Origins, creators, purpose, spacecraft and historical context.

The encyclopedia is a conceptual learning path, not a claim that unfamiliar readers will understand English or JSON. The physical primer is an independent research program.

## Data model

The authoritative UTF-8 dataset is `archive/encyclopedia/index.json`. It is included in the verified archive package; the website is a reader of the same bytes. Stable article IDs are CA-NN.NNN, category prefixes match the nine ordered categories. IDs are never recycled. Articles include a subcategory, prerequisites, related image IDs, related existing records, original explanatory text, limitations, revision, language, editorial credit, review status, rights, and source references.

Photographs and supplementary records provide context. Claims are checked against the exact references in the `sources` array. Source-checked articles map references to numbered body paragraphs, identify the access date, and define key concepts in `terms`. Original project prose is used, with publication rights tracked separately.

### Layer and edition metadata

Each article declares a knowledge layer, unique teaching purpose, prerequisite IDs, related article IDs, vocabulary IDs and linked diagrams. The current Essential candidates sit at Layer 3. Candidate edition status leaves approval pending. The physical encoding field records dependencies on mathematical framing and the language bridge. Use stable article IDs for references and separate planning IDs for the backlog. The site creates a light summary catalog and retrieves article bodies separately. Full-text search loads its own category shards on the first query. [Knowledge architecture](knowledge-architecture.md)

## Review stages

| Stage | Evidence recorded |
| --- | --- |
| `ai-drafted` | Draft with AI assistance. Individual source leads may be present. |
| `source-checked` | Every body paragraph maps to one or more consulted references. Independent human review is pending. |
| `independently-reviewed` | An independent human reviewer has checked this revision. The `human_review` record identifies the reviewer, date, revision and review evidence, including the scope of the review. |
| `publication-ready` | The revision has human review and a `publication_record` documenting the accepted editorial decision, rights clearance and any subject-specific or cultural review. |

`status` is the human-readable form of `review_stage`. `revision_history` records an imported revision or dated changes made since the baseline. Earlier changes remain in Git. Increment `revision` and update the status when a substantive edit changes the evidence for that revision.

## Acceptance gates

- Verify each claim against exact authoritative sources, record citations and access dates; quantitative claims require units and uncertainty.
- Obtain scientific and cultural review, confirm publication rights and record revisions.
- Maintain a directed acyclic prerequisite graph and resolve all image/record links.
- Test translations, symbol mappings and independent reconstruction separately.
- Preserve original photographic master files and consent where appropriate.
- Develop a simpler physical/raw representation; JSON and ZIP alone are not universal decoding methods.

The 150–250 article goal is a roadmap for several editorial passes. The current selection is an introductory learning path. See the [editorial sourcing and coverage audit](encyclopedia-sourcing.md).

## Public collection consolidation

The Image Library and Encyclopedia are the two public collection interfaces. Earlier plain-text records remain in the archive and are linked as supplementary source files, not treated as independently verified references. Revision 2 of the water, cells, history and everyday-experience articles incorporates substantive material from the existing project drafts. The old raw-file reader remains reachable by legacy URL only; no primary navigation links to it. Photo metadata and provenance are displayed in the Image Library itself.

### Collection cross-reference pass — November 23, 2026

All 104 planned photographic IDs now have at least one relevant encyclopedia article link. The remaining introductory primer and unapproved message drafts are linked as supplementary records; they retain their original bytes and editorial status. Links are thematic navigation aids, not independent evidence for article claims. Image inclusion metadata does not substitute for a verified package, a rights review, or scientific and cultural review.
