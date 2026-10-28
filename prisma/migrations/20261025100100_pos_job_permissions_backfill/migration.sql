-- Nobody loses access overnight.
--
-- Until now a single POS grant opened the tables, the kitchen and the diary as well as the till.
-- Splitting it would silently take those screens away from every existing role, so each role that
-- holds POS is given the same rights on the three new permissions. The result is exactly the
-- access it had yesterday; an administrator then unticks what a role should not have had.
--
-- Only roles that actually hold POS are touched, and `ON CONFLICT DO NOTHING` means re-running
-- this is harmless and never overwrites a grant somebody has already adjusted.

INSERT INTO "RolePermission" ("id", "roleId", "module", "canView", "canCreate", "canEdit", "canDelete")
SELECT
    -- cuid() is not available in SQL; a prefixed random id keeps the column's shape and stays unique.
    'bf' || replace(gen_random_uuid()::text, '-', ''),
    rp."roleId",
    m."module",
    rp."canView",
    rp."canCreate",
    rp."canEdit",
    rp."canDelete"
FROM "RolePermission" rp
CROSS JOIN (VALUES ('POS_ORDERS'::"PermissionModule"), ('POS_KITCHEN'::"PermissionModule"), ('POS_BOOKINGS'::"PermissionModule")) AS m("module")
WHERE rp."module" = 'POS'
ON CONFLICT ("roleId", "module") DO NOTHING;
