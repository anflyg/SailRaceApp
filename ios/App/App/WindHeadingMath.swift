import Foundation

enum WindHeadingMath {
    // Assumes Core Motion's attitude matrix maps reference-frame components
    // into device components; row 3 then contains the world components of +Z.
    static func backHeading(m31: Double, m32: Double) -> Double? {
        let north = -m31
        let west = -m32
        guard north.isFinite, west.isFinite, hypot(north, west) > 0.05 else { return nil }
        let degrees = atan2(-west, north) * 180 / Double.pi
        return (degrees + 360).truncatingRemainder(dividingBy: 360)
    }
}
