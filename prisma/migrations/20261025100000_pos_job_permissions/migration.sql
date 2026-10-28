-- Split the POS permission by job, so a kitchen hand, a waiter and a cashier can work the same
-- shop without seeing each other's screens. The values are added here and *used* in the next
-- migration: PostgreSQL will not let a transaction insert a value it added itself.

-- AlterEnum
ALTER TYPE "PermissionModule" ADD VALUE 'POS_ORDERS';
ALTER TYPE "PermissionModule" ADD VALUE 'POS_KITCHEN';
ALTER TYPE "PermissionModule" ADD VALUE 'POS_BOOKINGS';
