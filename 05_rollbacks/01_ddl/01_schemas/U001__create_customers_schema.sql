-- The disposable Flyway history must be removed explicitly before this script.
-- No CASCADE: unexpected dependencies stop recovery rather than being deleted.
DROP SCHEMA customers_schema;
