REVOKE customers_writer FROM customers_app;
REVOKE SELECT, INSERT, UPDATE ON customers_schema.customer, customers_schema.idempotency_key FROM customers_writer;
REVOKE SELECT ON customers_schema.customer, customers_schema.idempotency_key FROM customers_reader;
REVOKE USAGE ON SCHEMA customers_schema FROM customers_reader, customers_writer;
