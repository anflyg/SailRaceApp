import Foundation

@main struct CountdownCueOutputTest {
    static func main() {
        for second in 1...5 {
            precondition(CountdownCueOutput.forSecond(second) == CountdownCueOutput(haptic: .click, sound: .short))
        }
        precondition(CountdownCueOutput.forSecond(0) == CountdownCueOutput(haptic: .success, sound: .zero))
        precondition(CountdownCueOutput.forSecond(-1) == nil)
        precondition(CountdownCueOutput.forSecond(6) == nil)
        print("PASS: 5–1 remain click/short; zero remains success/zero; invalid cues are rejected")
    }
}
