REVOKE EXECUTE ON FUNCTION customers_schema.fold_search_text(text) FROM customers_reader, customers_writer;
REVOKE SELECT, INSERT ON customers_schema.customer_audit FROM customers_writer;
REVOKE SELECT ON customers_schema.customer_audit FROM customers_reader;
