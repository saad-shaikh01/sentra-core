-- Migration: remove_old_notification_models
-- Removes deprecated Notification, PmNotification models and NotificationType,
-- PmNotificationStatus enums. All notification delivery now goes through GlobalNotification.

-- Drop old Notification table
DROP TABLE IF EXISTS "Notification";

-- Drop old PmNotification table (also removes the FK to PmProject)
DROP TABLE IF EXISTS "PmNotification";

-- Drop old NotificationType enum
DROP TYPE IF EXISTS "NotificationType";

-- Drop old PmNotificationStatus enum
DROP TYPE IF EXISTS "PmNotificationStatus";
