# Centauri Encyclopedia — development specification

Status: original editorial drafts; independent factual and cultural review pending.

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

Existing records and image links are contextual material, not substitutes for independent claim verification. The sources array is intentionally empty until exact references are checked. Draft articles must not be represented as scientifically validated. Original prose is used; no encyclopedia articles were copied.

## Acceptance gates

- Verify each claim against exact authoritative sources, record citations and access dates; quantitative claims require units and uncertainty.
- Obtain scientific and cultural review, confirm publication rights and record revisions.
- Maintain a directed acyclic prerequisite graph and resolve all image/record links.
- Test translations, symbol mappings and independent reconstruction separately.
- Preserve original photographic master files and consent where appropriate.
- Develop a simpler physical/raw representation; JSON and ZIP alone are not universal decoding methods.

The first 25 entries constitute an introductory skeleton, not comprehensive knowledge. Future batches should fill gaps in mathematics, physics, chemistry, planetary science, anatomy, reproduction, history, medicine, engineering, world cultures, mission context and language.

## Public collection consolidation

The Image Library and Encyclopedia are the two public collection interfaces. Earlier plain-text records remain in the archive and are linked as supplementary source files, not treated as independently verified references. Revision 2 of the water, cells, history and everyday-experience articles incorporates substantive material from the existing project drafts. The old raw-file reader remains reachable by legacy URL only; no primary navigation links to it. Photo metadata and provenance are displayed in the Image Library itself.

### Collection cross-reference pass — November 23, 2026

All 104 planned photographic IDs now have at least one relevant encyclopedia article link. The remaining introductory primer and unapproved message drafts are linked as supplementary records; they retain their original bytes and editorial status. Links are thematic navigation aids, not independent evidence for article claims. Image inclusion metadata does not substitute for a verified package, a rights review, or scientific and cultural review.
