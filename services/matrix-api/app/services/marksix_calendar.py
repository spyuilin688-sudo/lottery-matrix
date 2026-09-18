"""Read HKJC's published calendar and update the existing notification calendar."""
from calendar import monthrange
from datetime import UTC, date, datetime
import re
from typing import Any
from uuid import uuid4
from zoneinfo import ZoneInfo

import httpx


CONFIG_URL = 'https://bet.hkjc.com/Config/GlobalConfig.js'
CALENDAR_URL = 'https://consvc.hkjc.com/JCBW/api/graph'
CALENDAR_PATH = '/sitecore/content/Sites/JCBW/NextDrawSchedule/Schedule'
# These are the fields used by the official /ch/marksix/fixtures page.
# PresellDrawDates are sales dates, not draw dates.
CALENDAR_QUERY = '''query MarksixFixtures($path: String!, $lang: String!) {
  item(path: $path, language: $lang) {
    years: children { year: name months: children {
      month: field(name: "DrawMonth") { value }
      dates: field(name: "NormalDrawDates") {
        ... on MultilistField { date: targetItems { value: name } }
      }
      snowballs: field(name: "SnowballDrawDates") {
        ... on MultilistField { date: targetItems { value: name } }
      }
    } }
  }
}'''


def parse_hkjc_calendar(payload: Any, today: date) -> list[dict[str, Any]]:
    try:
        if not isinstance(payload, dict) or payload.get('errors'):
            raise ValueError
        years = payload['data']['item']['years']
        if not isinstance(years, list):
            raise ValueError
        next_month = (today.year + today.month // 12, today.month % 12 + 1)
        wanted = [(today.year, today.month), next_month]
        months: dict[tuple[int, int], set[int]] = {}
        for year in years:
            for month in year['months']:
                key = (int(year['year']), int(month['month']['value']))
                if key not in wanted:
                    continue
                if key in months:
                    raise ValueError
                draws: set[int] = set()
                for field in ('dates', 'snowballs'):
                    entries = month[field]['date']
                    if not isinstance(entries, list):
                        raise ValueError
                    for entry in entries:
                        value = entry['value']
                        if not isinstance(value, str) or not re.fullmatch(r'\d{1,2}', value):
                            raise ValueError
                        day = int(value)
                        date(*key, day)  # Reject invalid dates, including month length.
                        draws.add(day)
                if not draws:
                    raise ValueError
                months[key] = draws
        if wanted[0] not in months:
            raise ValueError
        return [
            {'date': date(*key, day).isoformat(), 'isDrawDay': day in months[key]}
            for key in wanted if key in months
            for day in range(1, monthrange(*key)[1] + 1)
        ]
    except (KeyError, TypeError, ValueError, OverflowError) as error:
        raise ValueError('OFFICIAL_CALENDAR_INVALID') from error


def fetch_hkjc_calendar(client: httpx.Client, today: date) -> list[dict[str, Any]]:
    config = client.get(CONFIG_URL, timeout=15, follow_redirects=False)
    config.raise_for_status()
    # This is HKJC's public website CMS key, read from its public configuration
    # to follow rotations. It is never stored in our database, logs or frontend.
    keys = set(re.findall(r"SITECORE_APIKEY:\s*'([^']+)'", config.text))
    if len(keys) != 1:
        raise ValueError('OFFICIAL_CALENDAR_INVALID')
    response = client.post(CALENDAR_URL, timeout=15, follow_redirects=False,
        headers={'sc_apikey': keys.pop(), 'Origin': 'https://bet.hkjc.com'},
        json={'query': CALENDAR_QUERY, 'variables': {'path': CALENDAR_PATH, 'lang': 'zh-HK'}})
    response.raise_for_status()
    if len(response.content) > 1_000_000:
        raise ValueError('OFFICIAL_CALENDAR_INVALID')
    return parse_hkjc_calendar(response.json(), today)


def sync_marksix_calendar(repository: Any, client: httpx.Client, *, today: date | None = None) -> dict[str, Any]:
    owner = str(uuid4())
    acquired = False
    try:
        database = repository.client
        acquired = database.rpc('notification_draw_calendar_acquire', {'p_owner_id': owner}).execute().data is True
        if not acquired:
            return {'status': 'not-due'}
        days = fetch_hkjc_calendar(client, today or datetime.now(ZoneInfo('Asia/Taipei')).date())
        completed = database.rpc('notification_draw_calendar_complete', {
            'p_owner_id': owner, 'p_days': days, 'p_fetched_at': datetime.now(UTC).isoformat(),
        }).execute().data is True
        return {'status': 'synced' if completed else 'lease-lost', 'days': len(days)}
    except Exception:
        if acquired:
            try:
                database.rpc('notification_draw_calendar_fail', {'p_owner_id': owner}).execute()
            except Exception:
                pass  # Fencing/expiry still protects writes; never block crawlers.
        return {'status': 'unavailable'}
