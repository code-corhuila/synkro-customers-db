# Recuperación

## Fallo del runner

- Configuración (código 2): revisar URL/usuario/archivo legible, formato de URL
  y operación admitida. No imprimir el archivo ni el entorno.
- Flyway (código propagado): comprobar salud/red, autenticación administrativa,
  customers_app provisionado sin privilegios elevados, historia legacy en public
  y checksums con validate.
- El wrapper oculta logs SQL/JDBC porque pueden incluir secretos o datos. El
  operador diagnostica en una sesión administrativa protegida y comparte solo
  el código/categoría, nunca credenciales ni filas de clientes.
- Si existe public.flyway_schema_history, detener el cambio automático:
  respaldar, inventariar versiones y acordar conciliación con infraestructura.
  No mover, borrar, hacer baseline ni reparar esa historia automáticamente.
- Una V PostgreSQL fallida revierte su propia transacción. Las V anteriores
  permanecen aplicadas. Resolver la causa, comprobar estado/historia y reintentar;
  no alterar checksums de migraciones históricas para hacer pasar validate.

## Entornos con datos

En qa/main, infraestructura obtiene y verifica el backup antes de migrar, fuera
de los repositorios. Un backup fallido detiene el despliegue. Ensayar su
restauración en otra instancia sin sobrescribir datos compartidos.

Preferir una nueva V correctiva. Cambios incompatibles requieren expand/contract
y coordinación con Customers API. Las U eliminan datos: no son recuperación
automática de producción ni sustituyen el backup. Detener escritores,
inventariar y acordar la operación antes de usarlas fuera de CI.

## Reconstrucción exclusivamente desechable

La suite ejecuta cada U con psql ON_ERROR_STOP en una transacción, inversamente:

1. U007 revoca membresía y permisos.
2. U006 elimina los roles NOLOGIN, nunca customers_app.
3. U005 elimina índice; U004 elimina FK.
4. U003 elimina idempotency_key; U002 elimina customer.
5. El arnés elimina explícitamente customers_schema.flyway_schema_history.
6. U001 elimina el esquema sin CASCADE.
7. Verifica ausencia de esquema/roles, conservación de usuarios/dominio
   centinela, migra, valida y repite sin cambios.

No usar flyway undo (Community no lo incluye) ni clean. Dependencias inesperadas
deben fallar, no eliminarse con CASCADE o DROP OWNED. Si los roles ya existían,
inventariar dependencias antes de revertir: U006 supone roles de Customers.
