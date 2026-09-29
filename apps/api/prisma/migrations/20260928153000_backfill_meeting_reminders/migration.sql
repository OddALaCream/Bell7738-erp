-- Schedule future offsets for meetings that predate persistent reminders.
-- Past offsets are deliberately not sent retroactively.
INSERT INTO "meeting_reminders" ("id", "meetingId", "offsetMinutes", "scheduledFor", "updatedAt")
SELECT gen_random_uuid(), m."id", offsets.minutes,
       m."startsAt" - offsets.minutes * INTERVAL '1 minute', CURRENT_TIMESTAMP
FROM "meetings" m
JOIN "projects" p ON p."id" = m."projectId"
CROSS JOIN (VALUES (1440), (60)) AS offsets(minutes)
WHERE m."deletedAt" IS NULL AND p."deletedAt" IS NULL
  AND m."startsAt" - offsets.minutes * INTERVAL '1 minute' > CURRENT_TIMESTAMP
ON CONFLICT ("meetingId", "offsetMinutes") DO NOTHING;
