"""Run one publication check, also used to bootstrap/repair static cards.

Uses the existing Supabase service configuration and respects publication
leases and source validation; this manual repair command sends no notifications.
"""
import argparse
import json

from app.repositories.analysis_repository import create_supabase_repository
from app.repositories.card_repository import SupabaseCardRepository
from app.services.card_publication import CardPublicationService, LOTTERY_CODES
from app.settings import load_settings


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description='Generate eligible fixed Matrix PNG cards')
    parser.add_argument('--lottery', choices=[*LOTTERY_CODES, 'all'], default='all')
    args = parser.parse_args(argv)
    settings = load_settings()
    repository = create_supabase_repository(settings.supabase_url, settings.supabase_secret_key)
    publisher = CardPublicationService(repository, SupabaseCardRepository(repository.client))
    failed = False
    for lottery in LOTTERY_CODES if args.lottery == 'all' else [args.lottery]:
        try:
            manifest = publisher.ensure_current(lottery)
            print(json.dumps({'lottery': lottery, 'status': 'available' if manifest else 'waiting-card',
                              'period': manifest['period'] if manifest else None}, ensure_ascii=False))
        except Exception as error:
            failed = True
            print(json.dumps({'lottery': lottery, 'status': 'failed', 'code': type(error).__name__}, ensure_ascii=False))
    return int(failed)


if __name__ == '__main__':
    raise SystemExit(main())
