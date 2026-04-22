import { type Vec3, scale, add, anyPerpendicular, rotateAroundAxis, normalize } from "../lib/vec3"


const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5)) // ≈ 137.5° 
const startFraction = 0.6

export type TreeParams = {
    depth: number           // levels of recursion
    trunkLength: number
    trunkRadius: number
    lengthRatio: number     // child length relative to parent
    radiusRatio: number     // ^^
    tiltAngle: number       // in radians
    childrenPerNode: number
    growthDuration: number
    gravity: number
}
// matches Branch struct in ../shaders/raymarch.wgsl
type Branch = {
    a: [number, number, number]
    ra: number
    b: [number, number, number]
    rb: number
    c: [number, number, number]
    growth: number
    spawnTime: number
}
type LateralInfo = {
    cumulativeLengthAtSprout: number
    direction: Vec3
    length: number
    radius: number
    depth: number
    azimuth: number
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

 export function generateTree(params: TreeParams) : Branch[] {
    const out: Branch[] = []

    function generateChain(
        chainBase: Vec3, 
        chainTangent: Vec3, 
        startLength: number, 
        startRadius: number, 
        startDepth: number, 
        parentAzimuth: number, 
        parentSpawnTime: number,
    ) {
        let currentBase = chainBase
        let currentDir = chainTangent
        let currentLength = startLength
        let currentRadius = startRadius
        let currentDepth = startDepth
        let currentAzimuth = parentAzimuth
        let cumulativeLength = 0
        let currentSpawnTime = parentSpawnTime

        const laterals: LateralInfo[] = []

        while (currentDepth >= 0) {
            if(currentDepth > 0){
                for (let i = 1; i < params.childrenPerNode; i++) {
                    const siblingAzimuth = (i / params.childrenPerNode) * 2 * Math.PI
                    const lateralAzimuth = currentAzimuth + siblingAzimuth

                    const perp = anyPerpendicular(currentDir)
                    let lateralDir = rotateAroundAxis(currentDir, perp, params.tiltAngle)
                    lateralDir = rotateAroundAxis(lateralDir, currentDir, lateralAzimuth)

                    const tLocal = (i / params.childrenPerNode) * 0.7 + 0.3
                    const sproutCumulative = cumulativeLength + currentLength * tLocal

                    laterals.push({
                        cumulativeLengthAtSprout: sproutCumulative,
                        direction: lateralDir,
                        length: currentLength * params.lengthRatio,
                        radius: currentRadius * params.radiusRatio,
                        depth: currentDepth - 1,
                        azimuth: lateralAzimuth,
                        spawnTime: currentSpawnTime + params.growthDuration * startFraction,
                    })
                }
            }

            cumulativeLength += currentLength

            if(currentDepth === 0) break

            currentBase = add(currentBase, scale(currentDir, currentLength))
            currentLength *= params.lengthRatio * 1.3
            currentRadius *= params.radiusRatio
            currentDepth--
            currentAzimuth += GOLDEN_ANGLE
            currentSpawnTime += params.growthDuration * startFraction     
        }

        const chainTip = add(currentBase, scale(currentDir, currentLength))
        const chainTipRadius = currentRadius * params.radiusRatio

        const disp: Vec3 = [chainTip[0] - chainBase[0], chainTip[1] - chainBase[1], chainTip[2] - chainBase[2]]
        const dispDir = normalize(disp)
        const chainHorizontality = 1 - Math.abs(dispDir[1])

        const controlDist = cumulativeLength / 2
        let c = add(chainBase, scale(chainTangent, controlDist))

        const bSag = cumulativeLength * params.gravity * chainHorizontality
        const cSag = bSag * 0.4
        c = add(c, [0, -cSag, 0])
        const tip = add(chainTip, [0, -bSag, 0])

        out.push({
            a: chainBase,
            b: tip,
            c,
            ra: startRadius,
            rb: chainTipRadius,
            growth: 1,
            spawnTime: parentSpawnTime,
        })

        const totalChainLength = cumulativeLength
        for (const lat of laterals) {
            const t = lat.cumulativeLengthAtSprout / totalChainLength
            const omt = 1 - t

            const sproutBase: Vec3 = [
                omt*omt*chainBase[0] + 2*omt*t*c[0] + t*t*tip[0],
                omt*omt*chainBase[1] + 2*omt*t*c[1] + t*t*tip[1],
                omt*omt*chainBase[2] + 2*omt*t*c[2] + t*t*tip[2],
            ]

            generateChain(
                sproutBase,
                lat.direction,
                lat.length,
                lat.radius,
                lat.depth,
                lat.azimuth,
                lat.spawnTime,
            )
        }
    }

    generateChain([0, -1.5, 0], [0, 1, 0], params.trunkLength, params.trunkRadius, params.depth, 0, 0)
    return out
 }
 