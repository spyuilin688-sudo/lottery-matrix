from threading import Event
from app.recovery import RecoveryCoordinator


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
