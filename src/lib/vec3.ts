export type Vec3 = [number, number, number]

export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]

export const scale = (v: Vec3, s: number): Vec3 => [v[0]*s, v[1]*s, v[2]*s]

export const dot = (a: Vec3, b: Vec3) => a[0]*b[0] + a[1]*b[1] + a[2]*b[2]

export const cross = (a: Vec3, b: Vec3): Vec3 => [
    a[1]*b[2] - a[2]*b[1],
    a[2]*b[0] - a[0]*b[2],
    a[0]*b[1] - a[1]*b[0],
]

export const normalize = (v: Vec3): Vec3 => {
    const l = Math.hypot(v[0], v[1], v[2])
    return [v[0]/l, v[1]/l, v[2]/l]
}

// Rodrigues :: rotate v around unit axis by angle radians
export function rotateAroundAxis(v: Vec3, axis: Vec3, angle: number): Vec3 {
    const c = Math.cos(angle), s = Math.sin(angle)
    const k = normalize(axis)
    const kv = cross(k, v)
    const kkv = scale(k, dot(k, v) * (1 - c))
    return [
        v[0]*c + kv[0]*s + kkv[0],
        v[1]*c + kv[1]*s + kkv[1],
        v[2]*c + kv[2]*s + kkv[2],
    ]
}

// Pick any unit vector perpindicular to v
export function anyPerpendicular(v: Vec3): Vec3 {
    const [x, y, z] = v
    const ref: Vec3 = Math.abs(x) < 0.9? [1, 0, 0] : [0, 1, 0]
    return normalize(cross(v, ref))
}