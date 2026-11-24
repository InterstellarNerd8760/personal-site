# Centauri Bloom — founding brief

November 2026 · Proposal v0.1 · Recruiting contributors

**One model. Many contributors. Built from scratch.**

Centauri Bloom is an independent experiment in volunteer-driven language-model training. The first model's name was inspired by the Anti-Doomer community; the project is not an official initiative of that community and is unrelated to BigScience's BLOOM model. No training network or trained weights exist yet.

## Objective

Demonstrate that two or more independent computers can make reproducible, measurable contributions to the same small language model. Prioritize a working pipeline, transparent measurements and accessible participation over model size.

## Proposed architecture

- Python and PyTorch; decoder-only transformer initialized from scratch; approximately 15 million parameters, 512-token context. Verify actual parameter count before locking the config.
- Freeze tokenizer, architecture, dataset manifest and validation split for each experiment.
- GitHub for code and public technical discussion; Hugging Face proposed for versioned weights and datasets. A maintainer-run coordinator is sufficient for the first experiment.
- Assign unique training shards and a common parent checkpoint. Each worker completes a bounded local run and submits metadata plus a SafeTensors update. Do not accept executable model artifacts.
- Reject stale parents, shape/type mismatches, nonfinite or abnormal updates, duplicate jobs and unverifiable metadata. Evaluate individual and combined updates on a held-out split before promotion; retain rollback checkpoints. Never assume an update is safe merely because it passes a file-format check.
- Compare simple same-round averaging with a single-worker baseline, then evaluate a DiLoCo-style outer optimizer. Mixing independently trained models indiscriminately is not the plan.

## Milestones

1. Agree on governance, code of conduct, licensing and ownership; publish a model configuration and dataset provenance.
2. Implement reproducible CPU smoke tests and a single-worker baseline.
3. Run two independent workers from the same checkpoint and aggregate one round. Record tokens, steps, wall time, validation loss and sampling configuration.
4. Repeat several rounds, test failure/retry and rollback, document comparison results.
5. Release a contributor notebook, versioned weights with model card and limitations, and a public progress dashboard. Scale only when the measurements and volunteer resources justify it.

## Contributor roles

- ML engineering: transformer, training loop, reproducibility, aggregation.
- Infrastructure: job manifests, artifact storage, validation, CI and worker notebook.
- Data: licensing, privacy, deduplication and documentation. Only submit permitted, nonprivate data.
- Evaluation: held-out tests, regression reports and responsible-use evaluations.
- Documentation and design: tutorials, project dashboard, accessibility, independent website.

## Governance and safety

Start with public pull requests and review before execution. Use least-privilege credentials, isolated test environments and no shared tokens. Compute contributions must be voluntary, bounded and authorized by hardware/service owners. Never publish private information or credentials. Record authorship and acknowledge accepted contributions. Choose code, model and data licenses separately; do not assume a dataset license covers model redistribution. There is no promise of employment, compensation or a particular résumé outcome.

## Getting started

The standalone source repository and model hosting are not established yet. Propose a technical task through the public [website issue tracker](https://github.com/InterstellarNerd8760/personal-site/issues), with “Centauri Bloom” in its title. Keep discussions focused on the project and avoid posting personal information. An independently hosted site or domain is welcome as a proposal; no purchase is needed to participate.

Reference: [DiLoCo: Distributed Low-Communication Training of Language Models](https://arxiv.org/abs/2311.08105).
