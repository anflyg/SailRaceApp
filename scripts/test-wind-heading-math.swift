import Foundation

@main struct WindHeadingMathTests {
    static func main() {
        // Construct an orthonormal reference-to-device matrix. Its third row
        // is device +Z expressed in the world frame; other rows vary with roll.
        for heading in [0.0, 90, 180, 270, 359, 0.01] {
            for pitch in [0.0, 0.3, -0.4] {
                for roll in [0.0, 0.35, -0.25] {
                    let h = heading * .pi / 180
                    let z = (-cos(h) * cos(pitch), sin(h) * cos(pitch), sin(pitch))
                    let u = (sin(h), cos(h), 0.0)
                    let v = (-sin(pitch) * cos(h), sin(pitch) * sin(h), -cos(pitch))
                    let x = (cos(roll)*u.0 + sin(roll)*v.0, cos(roll)*u.1 + sin(roll)*v.1, cos(roll)*u.2 + sin(roll)*v.2)
                    let y = (-sin(roll)*u.0 + cos(roll)*v.0, -sin(roll)*u.1 + cos(roll)*v.1, -sin(roll)*u.2 + cos(roll)*v.2)
                    precondition(abs(x.0*z.0+x.1*z.1+x.2*z.2) < 1e-12)
                    precondition(abs(y.0*z.0+y.1*z.1+y.2*z.2) < 1e-12)
                    let result = WindHeadingMath.backHeading(m31: z.0, m32: z.1)!
                    let delta = (result - heading + 540).truncatingRemainder(dividingBy: 360) - 180
                    precondition(abs(delta) < 1e-9)
                }
            }
        }
        precondition(WindHeadingMath.backHeading(m31: 0, m32: 0) == nil)
        precondition(WindHeadingMath.backHeading(m31: .nan, m32: 0) == nil)
        print("Wind heading math: PASS (conditional on matrix convention)")
    }
}
