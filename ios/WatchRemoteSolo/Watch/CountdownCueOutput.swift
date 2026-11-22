import Foundation

enum CountdownHaptic: Equatable {
    case click
    case success
}

enum CountdownSound: Equatable {
    case short
    case zero
}

struct CountdownCueOutput: Equatable {
    let haptic: CountdownHaptic
    let sound: CountdownSound

    static func forSecond(_ seconds: Int) -> CountdownCueOutput? {
        guard (0...5).contains(seconds) else { return nil }
        return CountdownCueOutput(
            haptic: seconds == 0 ? .success : .click,
            sound: seconds == 0 ? .zero : .short
        )
    }
}
