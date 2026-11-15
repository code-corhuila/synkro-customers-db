# Contact rollout

Detailed procedures and delivery notes moved from the repository README at
[source 57febd8](https://github.com/code-corhuila/synkro-customers-db/blob/57febd822c9c25739ac2a8e464cae144d7ad322f/README.md).
Recorded execution results retain their original scope; moving them does not
constitute a new execution or certify a different revision.

Run commands from the repository root unless a step explicitly changes directory.

## Contact rollout, search and reactivation

V008–V014 are additive and compatible with the earlier API: they do not change V001–V007 or their checksums. They add fold_search_text, customer_audit (application SELECT/INSERT only), its FK/index, generated name_search/document_search columns, a search index and the owning grants.

The CHECK requiring email, a ten-ASCII-digit phone and address is not active. It is prepared/tested under scripts/pending-activation/, outside Flyway, and requires a later activation PR. Until then the API enforces required contacts. Historical customers keep their UUID/data; no repair, deletion or fabricated contacts are performed.

scripts/contact-inventory.sql produces aggregate counts without personal data; scripts/benchmark-search.mjs reproduces the search measurement.

[Historical-data migration policy](hu-cli-05-contacts-migration-policy.md) · [Search cost](hu-cli-05-search-benchmark.md)

[Design](design.md) · [Recovery](recovery.md) · [Infrastructure/API handoff](handoff.md) · [Historical evidence](evidence.md) · [Corrections](corrections-evidence.md) · [Acceptance](acceptance.md)
