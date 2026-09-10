-- Read-only checkpoint after migration 202.

SELECT
  to_regclass('public.playbook_reading_assignments') IS NOT NULL
    AS assignments_table,
  to_regclass('public.playbook_reading_acknowledgements') IS NOT NULL
    AS acknowledgements_table,
  to_regclass('public.playbook_reading_reminders') IS NOT NULL
    AS reminders_table,
  to_regprocedure('public.enqueue_playbook_reading_reminders(integer)') IS NOT NULL
    AS reminder_function,
  EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'playbook_reading_assignments_updated_at'
      AND tgrelid = 'public.playbook_reading_assignments'::regclass
      AND NOT tgisinternal
  ) AS updated_at_trigger,
  public.enqueue_playbook_reading_reminders(1) = 0
    AS reminders_fail_closed;
