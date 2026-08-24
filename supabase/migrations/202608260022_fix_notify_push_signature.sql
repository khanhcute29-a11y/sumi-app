-- Fix: notify_push function signature conflict
-- Drop old 3-param version, keep only 4-param version with optional p_staff_id

BEGIN;

-- Drop old function that takes only 3 params
DROP FUNCTION IF EXISTS public.notify_push(text, text, text) CASCADE;

-- Recreate with 4 params (p_staff_id optional)
CREATE OR REPLACE FUNCTION public.notify_push(
  p_title text,
  p_body text,
  p_url text DEFAULT '/',
  p_staff_id uuid DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM net.http_post(
    url := 'https://sumibakery.shop/api/send-push',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := jsonb_build_object('title', p_title, 'body', p_body, 'url', p_url, 'staffId', p_staff_id),
    timeout_milliseconds := 8000
  );
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'notify_push failed: %', SQLERRM;
END;
$$;

-- Recreate triggers with new function signature
CREATE OR REPLACE FUNCTION public.trg_notify_new_order()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM public.notify_push('🔔 Đơn hàng mới', 'Mã đơn ' || COALESCE(new.order_code, '') || ' vừa được tạo.', '/');
  RETURN new;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_notify_order_completed()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (new.status = 'hoan_thanh' AND COALESCE(old.status, '') <> 'hoan_thanh')
     OR (new.status_v2 = 'completed' AND COALESCE(old.status_v2, '') <> 'completed') THEN
    PERFORM public.notify_push('✅ Giao hàng hoàn thành', 'Đơn ' || COALESCE(new.order_code, '') || ' đã giao xong.', '/');
  END IF;
  RETURN new;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_notify_order_note()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_code text;
BEGIN
  SELECT order_code INTO v_code FROM public.orders WHERE id = new.order_id;
  PERFORM public.notify_push(
    '💬 Ghi chú đơn hàng mới',
    COALESCE(new.author_name, 'Nhân viên') || ' vừa ghi chú đơn ' || COALESCE(v_code, '') || ': ' || COALESCE(new.message, ''),
    '/'
  );
  RETURN new;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_notify_incident_report()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM public.notify_push(
    '⚠ Báo sự cố mới',
    COALESCE(new.reporter_name, 'Nhân viên') || ' báo ' || COALESCE(new.code, '') || ' - ' || COALESCE(new.label, ''),
    '/'
  );
  RETURN new;
END;
$$;

INSERT INTO public.migration_runs(migration_key, status, finished_at, notes)
VALUES('202608260022_fix_notify_push_signature', 'completed', now(),
  'Fixed notify_push function signature conflict. Dropped old 3-param version, kept only 4-param version with optional p_staff_id for targeted notifications.')
ON CONFLICT(migration_key) DO UPDATE SET status='completed', finished_at=now(), notes=excluded.notes;

COMMIT;
