import asyncio
from threading import Event

from app.draw_read_cache import DrawReadCache


def test_published_card_signal_invalidates_shared_public_result_cache():
    from app.public_result_updates import listen_public_result_updates

    cache = DrawReadCache()
    cache.read('latest-result', lambda: {'period': 'old'})
    stop = Event()

    class Channel:
        def on_postgres_changes(self, event, *, schema, table, callback):
            assert (event, schema, table) == ('UPDATE', 'public', 'matrix_card_signals')
            self.on_change = callback
            return self

        async def subscribe(self, callback):
            callback('SUBSCRIBED', None)
            assert cache.read('latest-result', lambda: {'period': 'after reconnect'}) == {'period': 'after reconnect'}
            self.on_change({'data': {'record': {'lottery': '今彩539', 'revision': 2}}})
            assert cache.read('latest-result', lambda: {'period': 'after publication'}) == {'period': 'after publication'}
            stop.set()

    class Client:
        def channel(self, name):
            assert name == 'matrix-public-api-cache'
            return Channel()

        async def remove_channel(self, channel):
            self.removed = channel

    client = Client()

    async def factory(url, key):
        assert (url, key) == ('https://supabase.test', 'service-test')
        return client

    asyncio.run(listen_public_result_updates('https://supabase.test', 'service-test', cache, stop, client_factory=factory))
    assert isinstance(client.removed, Channel)
