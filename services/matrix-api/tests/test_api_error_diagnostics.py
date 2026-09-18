import logging

import httpx

from app.api_server import handle_api_request


def test_internal_error_records_safe_exception_chain_without_secrets(caplog):
    class Repository:
        def list_draws(self, lottery, limit):
            try:
                raise httpx.RemoteProtocolError('private authorization secret')
            except httpx.RemoteProtocolError as cause:
                raise RuntimeError('private database payload') from cause

    with caplog.at_level(logging.ERROR):
        status, payload = handle_api_request('GET', '/api/matrix/history/今彩539', None, Repository())
    assert (status, payload) == (500, {'error': 'INTERNAL_ERROR'})
    assert 'RuntimeError' in caplog.text
    assert 'RemoteProtocolError' in caplog.text
    assert 'list_draws' in caplog.text
    assert 'private' not in caplog.text
    assert 'secret' not in caplog.text
