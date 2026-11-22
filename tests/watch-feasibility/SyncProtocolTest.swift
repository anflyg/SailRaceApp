import Foundation

@main struct SyncProtocolTest {
    static func command(_ action: String, id: String = UUID().uuidString) -> [String: Any] {
        ["kind": "watch-sync-test", "version": 1, "commandId": id, "origin": "watch", "action": action]
    }
    static func main() {
        var phone = TestSyncAuthority()
        let snap = phone.handle(command("snapshot"), at: 100)
        let first = TestSyncSnapshot(snap)!
        precondition(first.state == "ready" && first.revision == 0)
        let startID = UUID().uuidString
        var start = command("start", id: startID)
        start["session"] = first.session; start["revision"] = first.revision
        start["lease"] = first.lease; start["seconds"] = 300
        let reply = phone.handle(start, at: 100.1)
        let running = TestSyncSnapshot(reply)!
        precondition(running.revision == 1 && running.state == "running")
        precondition(running.lastCommandID == startID && running.timeline != first.timeline)
        let recoveredAfterLostReply = TestSyncSnapshot(phone.handle(command("snapshot"), at: 100.15))!
        precondition(recoveredAfterLostReply.lastCommandID == startID && recoveredAfterLostReply.timeline == running.timeline)
        var ack = command("ack")
        ack["session"] = running.session; ack["revision"] = running.revision; ack["state"] = running.state
        let acknowledged = phone.handle(ack, at: 100.2)
        precondition(acknowledged["acknowledged"] as? Bool == true && acknowledged["confirmed"] as? Bool == false)
        var confirm = command("confirm")
        confirm["session"] = running.session; confirm["revision"] = running.revision; confirm["state"] = running.state
        precondition(phone.handle(confirm, at: 100.21)["confirmed"] as? Bool == true)
        precondition(phone.handle(start, at: 100.2)["reason"] as? String == "duplicate")
        var stale = command("pause")
        stale["session"] = first.session; stale["revision"] = 0; stale["lease"] = first.lease; stale["seconds"] = 0
        precondition(phone.handle(stale, at: 101)["ok"] as? Bool == false)
        let latest = TestSyncSnapshot(phone.handle(command("snapshot"), at: 101))!
        var pause = command("pause")
        pause["session"] = latest.session; pause["revision"] = latest.revision; pause["lease"] = latest.lease; pause["seconds"] = 0
        let paused = TestSyncSnapshot(phone.handle(pause, at: 101.1))!
        precondition(paused.state == "paused" && paused.revision == 2)
        precondition(paused.timeline == running.timeline)
        var lateAck = command("ack")
        lateAck["session"] = running.session; lateAck["revision"] = running.revision; lateAck["state"] = running.state
        precondition(phone.handle(lateAck, at: 101.2)["ok"] as? Bool == false)
        var solo = command("solo"); solo["session"] = paused.session
        precondition(phone.handle(solo, at: 101.3)["solo"] as? Bool == true)
        precondition(!phone.apply(kind: "start", seconds: 300, at: 101.2))
        var other = TestSyncAuthority()
        let initial = TestSyncSnapshot(other.handle(command("snapshot"), at: 50))!
        var delayed = command("start")
        delayed["session"] = initial.session; delayed["revision"] = initial.revision; delayed["lease"] = initial.lease; delayed["seconds"] = 300
        precondition(other.handle(delayed, at: 53)["ok"] as? Bool == false)
        precondition(other.phase == "ready")
        precondition(other.selectPhonePreset(120))
        let changed = TestSyncSnapshot(other.handle(command("snapshot"), at: 54))!
        var conflict = command("start")
        conflict["session"] = changed.session; conflict["revision"] = changed.revision; conflict["lease"] = changed.lease; conflict["seconds"] = 300
        precondition(other.handle(conflict, at: 54.1)["reason"] as? String == "preset-conflict")
        precondition(other.apply(kind: "start", seconds: 120, at: 55))
        precondition(other.apply(kind: "pause", seconds: 0, at: 56))
        precondition(TestSyncSnapshot(["ok": true]) == nil)
        var extra = command("snapshot"); extra["payload"] = "not allowed"
        precondition(phone.handle(extra, at: 102)["ok"] as? Bool == false)
        var badVersion = command("snapshot"); badVersion["version"] = true
        precondition(phone.handle(badVersion, at: 102)["ok"] as? Bool == false)
        precondition(TestSyncReconciliation.compatible(localState: "running", localSeconds: 175, remoteState: "paused", remoteSeconds: 175.4, explicit: false))
        precondition(!TestSyncReconciliation.compatible(localState: "running", localSeconds: 175, remoteState: "running", remoteSeconds: 170, explicit: false))
        precondition(!TestSyncReconciliation.compatible(localState: "paused", localSeconds: 175, remoteState: "running", remoteSeconds: 175, explicit: false))
        precondition(TestSyncReconciliation.compatible(localState: "paused", localSeconds: 175, remoteState: "running", remoteSeconds: 170, explicit: true))
        precondition(TestSyncReconciliation.mayAutomaticallyJoin(localReady: true, knownTimeline: nil, remoteTimeline: running.timeline, independent: false))
        precondition(TestSyncReconciliation.mayAutomaticallyJoin(localReady: false, knownTimeline: running.timeline, remoteTimeline: paused.timeline, independent: false))
        precondition(!TestSyncReconciliation.mayAutomaticallyJoin(localReady: false, knownTimeline: UUID().uuidString, remoteTimeline: running.timeline, independent: false))
        precondition(!TestSyncReconciliation.mayAutomaticallyJoin(localReady: true, knownTimeline: running.timeline, remoteTimeline: running.timeline, independent: true))
        var calibratedPhone = TestSyncAuthority()
        precondition(calibratedPhone.apply(kind: "start", seconds: 300, at: 1100))
        func calibrationSnapshot(_ time: Double) -> TestSyncSnapshot {
            var data = calibratedPhone.snapshot(at: time); data["ok"] = true
            return TestSyncSnapshot(data)!
        }
        var malformedClock = calibratedPhone.snapshot(at: 1101); malformedClock["ok"] = true
        malformedClock["clockReceive"] = true
        precondition(TestSyncSnapshot(malformedClock) == nil)
        precondition(TestSyncReconciliation.commandIsFresh(expiry: 110, now: 109))
        precondition(!TestSyncReconciliation.commandIsFresh(expiry: 110, now: 111))
        precondition(!TestSyncReconciliation.commandIsFresh(expiry: .infinity, now: 109))
        var correlation = TestSyncCorrelation()
        let slowForward = calibrationSnapshot(1101.8) // Watch epoch differs by 1000 s.
        precondition(correlation.observe(slowForward, sent: 100, received: 102))
        precondition(correlation.remaining(slowForward, at: 102) == nil)
        let slowReturn = calibrationSnapshot(1104.1)
        precondition(correlation.observe(slowReturn, sent: 104, received: 106))
        precondition(correlation.uncertainty <= 0.25)
        precondition(abs(correlation.remaining(slowReturn, at: 106)! - 294) < 0.25)
        precondition(correlation.remaining(slowReturn, at: 117) == nil)
        var pausedCorrelation = TestSyncCorrelation()
        precondition(pausedCorrelation.observe(paused, sent: 10, received: 12))
        precondition(pausedCorrelation.uncertainty > 0.25)
        precondition(pausedCorrelation.remaining(paused, at: 12) == Double(paused.remainingMilliseconds) / 1000)
        let clockJump = calibrationSnapshot(1208)
        precondition(correlation.observe(clockJump, sent: 108, received: 110))
        precondition(correlation.remaining(clockJump, at: 110) == nil)
        print("PASS: phone/watch commands, duplicate and stale rejection, expiry, correlation and preset conflict")
    }
}
