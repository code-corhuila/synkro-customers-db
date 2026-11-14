-- HU-CLI-05: inventory of customers whose contacts do not meet the mandatory rules.
--
-- READ-ONLY and AGGREGATE-ONLY: it returns counters, never names, documents, e-mails, phones or addresses, so the
-- result can be pasted in a ticket or a pull request. Run it with a role that can SELECT customers_schema.customer
-- (customers_reader, customers_writer or the administrative role), once per environment, before and after any repair:
--
--   psql "$URL" -X -v ON_ERROR_STOP=1 -f scripts/contact-inventory.sql
--
-- The rules mirror exactly the API and the prepared chk_customer_contacts_required constraint (scripts/pending-activation, not yet applied):
--   email   present, no whitespace or '@' inside the parts, one '@', a '.' after it, at most 255 characters;
--   phone   exactly ten ASCII digits;
--   address at least one non-blank character, at most 255 characters.
\set QUIET on
\pset format aligned
\pset border 2
\pset null '(none)'

WITH rules AS (
    SELECT
        active,
        email IS NULL                                                                          AS email_missing,
        email IS NOT NULL AND (email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' OR char_length(email) > 255) AS email_invalid,
        phone IS NULL                                                                          AS phone_missing,
        phone IS NOT NULL AND phone !~ '^[0-9]{10}$'                                           AS phone_invalid,
        address IS NULL                                                                        AS address_missing,
        address IS NOT NULL AND (address !~ '[^[:space:]]' OR char_length(address) > 255)      AS address_invalid
    FROM customers_schema.customer
), flagged AS (
    SELECT *, (email_missing OR email_invalid OR phone_missing OR phone_invalid OR address_missing OR address_invalid) AS incomplete
    FROM rules
)
SELECT
    count(*)                                                    AS customers_total,
    count(*) FILTER (WHERE active)                              AS active,
    count(*) FILTER (WHERE NOT active)                          AS inactive,
    count(*) FILTER (WHERE incomplete)                          AS incomplete_total,
    count(*) FILTER (WHERE incomplete AND active)               AS incomplete_active,
    count(*) FILTER (WHERE incomplete AND NOT active)           AS incomplete_inactive,
    count(*) FILTER (WHERE email_missing)                       AS email_missing,
    count(*) FILTER (WHERE email_invalid)                       AS email_invalid,
    count(*) FILTER (WHERE phone_missing)                       AS phone_missing,
    count(*) FILTER (WHERE phone_invalid)                       AS phone_invalid,
    count(*) FILTER (WHERE address_missing)                     AS address_missing,
    count(*) FILTER (WHERE address_invalid)                     AS address_invalid
FROM flagged;

-- The decision gate for removing the historical exemption (a future migration): this counter must be zero.
SELECT count(*) AS incomplete_rows_blocking_the_definitive_constraint
FROM customers_schema.customer
WHERE email IS NULL OR phone IS NULL OR address IS NULL
   OR email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' OR char_length(email) > 255
   OR phone !~ '^[0-9]{10}$'
   OR address !~ '[^[:space:]]' OR char_length(address) > 255;

-- Documents are unique across active and inactive customers; this must also be zero (V002 guarantees it).
SELECT count(*) AS duplicate_document_groups
FROM (SELECT identity_document FROM customers_schema.customer GROUP BY identity_document HAVING count(*) > 1) AS d;
