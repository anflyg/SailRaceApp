import Foundation

@main struct Tests {
    static func main() {
        var phone = Authority()
        let (generation, state) = phone.refresh()
        precondition(state == .ready)
        let first = phone.execute(id: "a", generation: generation, action: .start)
        precondition(first.0 && first.1 == .running)
        let duplicate = phone.execute(id: "a", generation: generation, action: .start)
        precondition(duplicate.0 && duplicate.1 == .running)
        precondition(!phone.execute(id: "b", generation: generation, action: .start).0)
        precondition(phone.execute(id: "c", generation: generation, action: .pause).1 == .paused)
        precondition(phone.execute(id: "d", generation: generation, action: .resume).1 == .running)
        let (newGeneration, _) = phone.refresh()
        precondition(!phone.execute(id: "e", generation: generation, action: .reset).0)
        precondition(phone.execute(id: "f", generation: newGeneration, action: .reset).1 == .ready)
        print("Control tests passed")
    }
}
