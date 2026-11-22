import Foundation

@main struct PhoneStateTests {
    static func main() {
        var sent: [ControlSnapshot] = []
        let phone = PhoneModel(startServices: false, publishOverride: { sent.append($0) })
        let generation = phone.authority.generation
        phone.local(.start)
        precondition(sent.count == 1 && sent.last?.phase == .running)
        let pauseID = UUID().uuidString
        precondition(phone.perform(.pause, id: pauseID, generation: generation).0)
        precondition(sent.count == 2 && sent.last?.phase == .paused)
        precondition(phone.perform(.pause, id: pauseID, generation: generation).0)
        precondition(sent.count == 2, "duplicate must not publish or repeat timer effects")
        precondition(!phone.perform(.pause, id: UUID().uuidString, generation: generation).0)
        precondition(sent.count == 2, "rejected command must not publish")
        phone.local(.resume)
        precondition(sent.count == 3 && sent.last?.phase == .running)
        phone.tick(at: Date().addingTimeInterval(600))
        precondition(sent.count == 4 && sent.last?.phase == .ready)
        precondition(zip(sent, sent.dropFirst()).allSatisfy { $0.revision < $1.revision })
        precondition(sent.allSatisfy { Set($0.message.keys) == Set(["kind", "epoch", "generation", "revision", "phase"]) })
        print("Phone state publication tests passed")
    }
}
