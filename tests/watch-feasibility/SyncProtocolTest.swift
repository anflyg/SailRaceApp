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
        var ack = command("ack")
        ack["session"] = running.session; ack["revision"] = running.revision; ack["state"] = running.state
        let acknowledged = phone.handle(ack, at: 100.2)
        precondition(acknowledged["acknowledged"] as? Bool == true && acknowledged["confirmed"] as? Bool == false)
        var confirm = command("confirm")
        confirm["session"] = running.session; confirm["revision"] = running.revision; confirm["state"] = running.state
        precondition(phone.handle(confirm, at: 100.21)["confirmed"] as? Bool == true)
        precondition(phone.handle(start, at: 100.2)["reason"] as? String == "duplicate")
        precondition(running.correlatedRemaining(roundTrip: 0.4)! > 299.7)
        precondition(running.correlatedRemaining(roundTrip: 0.6) == nil)
        var stale = command("pause")
        stale["session"] = first.session; stale["revision"] = 0; stale["lease"] = first.lease; stale["seconds"] = 0
        precondition(phone.handle(stale, at: 101)["ok"] as? Bool == false)
        let latest = TestSyncSnapshot(phone.handle(command("snapshot"), at: 101))!
        var pause = command("pause")
        pause["session"] = latest.session; pause["revision"] = latest.revision; pause["lease"] = latest.lease; pause["seconds"] = 0
        let paused = TestSyncSnapshot(phone.handle(pause, at: 101.1))!
        precondition(paused.state == "paused" && paused.revision == 2)
        var lateAck = command("ack")
        lateAck["session"] = running.session; lateAck["revision"] = running.revision; lateAck["state"] = running.state
        precondition(phone.handle(lateAck, at: 101.2)["ok"] as? Bool == false)
        var solo = command("solo"); solo["session"] = paused.session
        precondition(phone.handle(solo, at: 101.3)["solo"] as? Bool == true)
        precondition(paused.correlatedRemaining(roundTrip: 0.4) == Double(paused.remainingMilliseconds) / 1000)
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
        print("PASS: phone/watch commands, duplicate and stale rejection, expiry, correlation and preset conflict")
    }
}
