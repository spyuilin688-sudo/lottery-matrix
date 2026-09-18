-- Use only the draw date and approved copy in Matrix card notification bodies.
CREATE OR REPLACE FUNCTION private.notification_render_payload(p_event_type text, p_event_key text, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_title text;
  v_body text;
  v_numbers text;
  v_prefix text;
  v_copy text;
  v_tag text := pg_catalog.encode(extensions.digest(p_event_key,'sha256'),'hex');
begin
  if p_event_type in ('lottery_result','matrix_status','matrix_card') then
    v_prefix := private.notification_draw_date_label(p_payload) || ' ' || coalesce(p_payload->>'lottery','') || ' ';
  end if;
  if p_event_type='lottery_result' then
    select pg_catalog.string_agg(pg_catalog.lpad(number.value,2,'0'),'-' order by number.ordinality)
      into v_numbers from pg_catalog.jsonb_array_elements_text(coalesce(p_payload->'numbers','[]'::jsonb))
      with ordinality as number(value,ordinality);
    v_title := coalesce(p_payload->>'lottery','') || ' 開獎結果';
    v_body := private.notification_draw_date_label(p_payload) || ' ' || coalesce(v_numbers,'');
  elsif p_event_type='matrix_status' then
    v_title := 'Matrix 狀態｜' || coalesce(p_payload->>'lottery','');
    v_copy := case p_payload->>'statusLabel'
      when '臨界' then '發現了極為罕見的版路！'
      when '共振' then '發現了具備強烈共振效應的版路！'
      when '聚合' then '發現了具備明顯規律集中性的版路！'
      when '啟動' then '發現了具備基本參考價值的版路！'
      else null end;
    if v_copy is null then raise exception using errcode='22023',message='NOTIFICATION_STATUS_INVALID'; end if;
    v_body := v_copy;
  elsif p_event_type='matrix_card' then
    v_title := 'Matrix 牌單｜' || coalesce(p_payload->>'lottery','');
    v_body := private.notification_draw_date_label(p_payload) || ' 最新的牌單已經更新囉！';
  elsif p_event_type='bet_reminder' then
    v_title := coalesce(p_payload->>'lottery','') || ' 選號提醒';
    v_body := '選號時間到了，記得完成你的選號。';
  elsif p_event_type='membership_expiry' then
    v_title := 'Matrix Pro 即將到期';
    v_body := '距離到期剩 ' || coalesce(p_payload->>'daysBefore','') || ' 日（' || coalesce(p_payload->>'expiryDate','') || '）';
  elsif p_event_type='system_notice' then
    v_title := coalesce(p_payload->>'title','');
    v_body := coalesce(p_payload->>'body','');
  else
    raise exception using errcode='22023',message='INVALID_NOTIFICATION_EVENT_TYPE';
  end if;
  return pg_catalog.jsonb_build_object('title',v_title,'body',v_body,'url','/','tag',v_tag);
end;
$function$;
