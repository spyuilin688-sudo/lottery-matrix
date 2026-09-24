"""One Realtime listener per API process; HTTP reads remain safe if it disconnects."""
import asyncio
import logging
from threading import Event

from realtime import RealtimeSubscribeStates
from supabase import acreate_client


async def listen_public_result_updates(url, key, cache, stop: Event, *, client_factory=acreate_client):
    client = await client_factory(url, key)
    channel = client.channel('matrix-public-api-cache')

    def on_status(status, error):
        if status == RealtimeSubscribeStates.SUBSCRIBED or status == 'SUBSCRIBED':
            # Recover updates missed while the socket was disconnected.
            cache.invalidate()

    try:
        await channel.on_postgres_changes(
            'UPDATE', schema='public', table='matrix_card_signals',
            callback=lambda message: cache.invalidate(),
        ).subscribe(on_status)
        while not stop.is_set():
            await asyncio.sleep(1)
    finally:
        await client.remove_channel(channel)


def run_public_result_updates(url, key, cache, stop: Event):
    while not stop.is_set():
        try:
            asyncio.run(listen_public_result_updates(url, key, cache, stop))
        except Exception as error:
            logging.getLogger(__name__).warning('public-result-update-channel %s', type(error).__name__)
        stop.wait(30)
