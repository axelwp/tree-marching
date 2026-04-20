import { type Vec3, scale, add, anyPerpendicular, rotateAroundAxis, normalize } from "../lib/vec3"


const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5)) // ≈ 137.5° 
const startFraction = 0.6
// matches Branch struct in ../shaders/raymarch.wgsl
export type Branch = {
    a: [number, number, number]
    ra: number
    b: [number, number, number]
    rb: number
    c: [number, number, number]
    growth: number
    spawnTime: number
}

//flattens Branch[] into a Float32Array
export function packBranches(branches: Branch[]): Float32Array {
    const out = new Float32Array(branches.length * 16)
    branches.forEach((br, i) => {
        const o = i * 16
        out[o+0] = br.a[0]; out[o+1] = br.a[1]; out[o+2] = br.a[2]
        out[o+3] = br.ra
        out[o+4] = br.b[0]; out[o+5] = br.b[1]; out[o+6] = br.b[2]
        out[o+7] = br.rb
        out[o+8] = br.c[0]; out[o+9] = br.c[1]; out[o+10] = br.c[2]
        out[o+11] = br.growth
        out[o+12] = br.spawnTime
    })
    return out
}

 export function generateTree(params: {
    depth: number           // levels of recursion
    trunkLength: number
    trunkRadius: number
    lengthRatio: number     // child length relative to parent
    radiusRatio: number     // ^^
    tiltAngle: number       // in radians
    childrenPerNode: number
    growthDuration: number
 }) : Branch[] {
    const out: Branch[] = []

    function recurse(base: Vec3, dir: Vec3, length: number, radius: number, depth: number, parentAzimuth: number, parentSpawnTime: number) {
        const b = add(base, scale(dir, length))
        const perp = anyPerpendicular(dir)
        const curveAmount = length * 0.2
        const c = add(add(base, scale(dir, length/ 2)), scale(perp, curveAmount))
        const branch: Branch = {a: base, b: b, ra: radius, rb: radius * params.radiusRatio, c: c,  growth: 1, spawnTime: parentSpawnTime}
        out.push(branch)
        if(depth == 0)
            return

        for(let i = 0; i < params.childrenPerNode; i++){
            const isAxial = i == 0
            const tilt = isAxial ? params.tiltAngle * 0.2 : params.tiltAngle
            const childLength = length * (isAxial ? params.lengthRatio * 1.3 : params.lengthRatio)
            const t = isAxial ? 1.0 : (i / params.childrenPerNode) * 0.7 + 0.3
            const omt = 1 - t
            const sproutBase: Vec3 = [
                omt*omt*base[0] + 2*omt*t*c[0] + t*t*b[0],
                omt*omt*base[1] + 2*omt*t*c[1] + t*t*b[1],
                omt*omt*base[2] + 2*omt*t*c[2] + t*t*b[2],
            ]
            const tangentRaw: Vec3 = [
                2*omt*(c[0]-base[0]) + 2*t*(b[0]-c[0]),
                2*omt*(c[1]-base[1]) + 2*t*(b[1]-c[1]),
                2*omt*(c[2]-base[2]) + 2*t*(b[2]-c[2]),
            ]
            const tangent = normalize(tangentRaw)

            const siblingAzimuth = (i / params.childrenPerNode) * 2 * Math.PI
            const azimuth = parentAzimuth + siblingAzimuth

            const childSpawnTime = parentSpawnTime + params.growthDuration * startFraction

            let perp = anyPerpendicular(tangent)
            let newAngle = rotateAroundAxis(tangent, perp, tilt)
            newAngle = rotateAroundAxis(newAngle, tangent, azimuth)
            recurse(sproutBase, newAngle, childLength, radius * params.radiusRatio, depth - 1, azimuth + GOLDEN_ANGLE, childSpawnTime)
        }
        
    }

    recurse([0, -1.5, 0], [0, 1, 0], params.trunkLength, params.trunkRadius, params.depth, 0, 0)
    return out
 }