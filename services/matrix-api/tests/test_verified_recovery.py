from threading import Event
import json
import httpx
from app.recovery import RecoveryCoordinator


def test_http_failure_records_status_and_target_without_credentials(capsys):
    done = Event()
    succeeded = []
    def targeted(*_, **__):
        request = httpx.Request('POST', 'https://example.test/private?token=hidden',
                                headers={'Authorization': 'Bearer hidden'})
        httpx.Response(403, request=request, text='private response hidden').raise_for_status()
    coordinator = RecoveryCoordinator(lambda _: None, begin_lease=lambda *_: True,
        targeted_runner=targeted, verify=lambda *_: True,
        record_success=lambda *_: succeeded.append(True), release_lease=lambda *_: done.set())
    assert coordinator.enqueue('今彩539', 'owner', draw_period='115000228', stage='analysis') == 'accepted'
    assert done.wait(2)
    output = capsys.readouterr().out
    record = json.loads(output)
    assert record['errorType'] == 'HTTPStatusError'
    assert record['httpStatus'] == 403
    assert record['lottery'] == '今彩539'
    assert record['period'] == '115000228'
    assert record['stage'] == 'analysis'
    assert 'hidden' not in output and 'example.test' not in output
    assert succeeded == []


def test_accepted_request_is_not_verified_success():
    done = Event()
    events = []
    coordinator = RecoveryCoordinator(
        lambda _: None, begin_lease=lambda *_: True,
        verify=lambda *_: False, record_success=lambda *_: events.append('success'),
        release_lease=lambda *_: done.set(),
    )
    assert coordinator.enqueue('天天樂', 'owner') == 'accepted'
    assert done.wait(2)
    assert events == []


def test_verified_success_precedes_lease_release():
    done = Event()
    events = []
    coordinator = RecoveryCoordinator(
        lambda _: None, begin_lease=lambda *_: True,
        verify=lambda *_: True, record_success=lambda *_: events.append('verified'),
        release_lease=lambda *_: (events.append('release'), done.set()),
    )
    coordinator.enqueue('天天樂', 'owner')
    assert done.wait(2)
    assert events == ['verified', 'release']


def test_heartbeat_is_drained_before_success_deletes_lease():
    renewing = Event()
    allow_renewal = Event()
    drained = Event()
    done = Event()
    lost = []
    events = []

    def renew(*_):
        renewing.set()
        assert allow_renewal.wait(2)
        drained.set()
        return True

    def run(_):
        assert renewing.wait(2)
        allow_renewal.set()

    def record(*_):
        assert drained.is_set()
        events.append('verified')

    coordinator = RecoveryCoordinator(run, begin_lease=lambda *_: True,
        renew_lease=renew, heartbeat_seconds=0.01, verify=lambda *_: True,
        record_success=record, release_lease=lambda *_: done.set(),
        on_lease_lost=lambda *_: lost.append(True))
    coordinator.enqueue('天天樂', 'owner')
    assert done.wait(2)
    assert events == ['verified']
    assert lost == []


def test_targeted_recovery_receives_the_claimed_lease_identity():
    done = Event()
    calls = []
    def targeted(*args, **kwargs):
        calls.append((args, kwargs))
        return '12004'
    coordinator = RecoveryCoordinator(lambda _: None, begin_lease=lambda *_: True,
        targeted_runner=targeted, runner_id_factory=lambda: 'runner',
        release_lease=lambda *_: done.set())
    coordinator.enqueue('天天樂', 'owner', draw_period='12004', stage='analysis')
    assert done.wait(2)
    assert calls == [(('天天樂', '12004', 'analysis', None), {'lease_owner': 'owner', 'runner_id': 'runner'})]


def test_failed_verification_records_specific_reason_before_release(capsys):
    for verified, completed, reason in [
        (False, True, 'CHAIN_INCOMPLETE'),
        (True, False, 'COMPLETION_NOT_RECORDED'),
    ]:
        done = Event()
        calls = []
        coordinator = RecoveryCoordinator(lambda _: None, begin_lease=lambda *_: True,
            targeted_runner=lambda *_, **__: '115000228', verify=lambda *_: verified,
            record_success=lambda *_: (calls.append('record'), completed)[1],
            release_lease=lambda *_: done.set())
        coordinator.enqueue('今彩539', 'owner', draw_period='115000228', stage='analysis')
        assert done.wait(2)
        record = json.loads(capsys.readouterr().out)
        assert record == {'event': 'recovery-not-verified', 'lottery': '今彩539',
            'period': '115000228', 'stage': 'analysis', 'reason': reason}
        assert calls == (['record'] if verified else [])
