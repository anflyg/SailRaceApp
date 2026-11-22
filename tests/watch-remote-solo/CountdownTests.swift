import Foundation
@main struct Tests {
    static func main() {
        var timer = CountdownState(presetMinutes: 3)
        let now = ContinuousClock.now
        precondition(timer.selectPreset(1))
        timer.start(at: now)
        precondition(!timer.selectPreset(5))
        precondition(timer.remaining(at: now.advanced(by: .seconds(10))) == 50)
        precondition(timer.pause(at: now.advanced(by: .seconds(10))))
        precondition(timer.remaining(at: now.advanced(by: .seconds(40))) == 50)
        precondition(timer.resume(at: now.advanced(by: .seconds(40))))
        precondition(timer.remaining(at: now.advanced(by: .seconds(50))) == 40)
        timer.cancel()
        precondition(timer.phase == .ready && timer.remaining(at: now) == 60)
        precondition(CountdownCueOutput.forSecond(5)?.sound == .short)
        precondition(CountdownCueOutput.forSecond(0)?.sound == .zero)
        precondition(CountdownCueOutput.forSecond(6) == nil)
        print("SOLO countdown tests passed")
    }
}
