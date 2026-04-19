import { type Vec3, scale, add, anyPerpendicular, rotateAroundAxis } from "../lib/vec3"


const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5)) // ≈ 137.5° 
// matches Branch struct in ../shaders/raymarch.wgsl
export type Branch = {
    a: [number, number, number]
    ra: number
    b: [number, number, number]
    rb: number
    growth: number
    spawnTime: number
}

//flattens Branch[] into a Float32Array
export function packBranches(branches: Branch[]): Float32Array {
    const out = new Float32Array(branches.length * 12)
    branches.forEach((br, i) => {
        const o = i * 12
        out[o+0] = br.a[0]; out[o+1] = br.a[1]; out[o+2] = br.a[2]
        out[o+3] = br.ra
        out[o+4] = br.b[0]; out[o+5] = br.b[1]; out[o+6] = br.b[2]
        out[o+7] = br.rb
        out[o+8] = br.growth
        out[o+9] = br.spawnTime
    })
    return out
}


// hardcoded from example tree in raymarch.wgsl
/*
export function generateTree(): Branch[] {                                 
    return [                                                                                                                                          
      // trunk                                                        
      { a: [0, -1.5, 0], b: [0, 1.5, 0],     ra: 0.25, rb: 0.15, growth: 1, spawnTime: 0 },                                                           
      // lowest branch                                                                                                                                
      { a: [0, -0.2, 0], b: [1.2, 0.5, 0.2], ra: 0.17, rb: 0.02, growth: 1, spawnTime: 0 },
      // offshoot from lowest branch                                                                                                                  
      { a: [0.6, 0.1, 0.1], b: [1.1, 0, -0.2], ra: 0.08, rb: 0.02, growth: 1, spawnTime: 0 },
      // left branch                                                                                                                                  
      { a: [0, 0.3, 0], b: [-1.2, 0.8, 0.2], ra: 0.14, rb: 0.02, growth: 1, spawnTime: 0 },
      // top-right                                                                                                                                    
      { a: [0, 1.4, 0], b: [0.5, 2.1, -0.1], ra: 0.1, rb: 0.02, growth: 1, spawnTime: 0 },
      // top-left                                                                                                                                     
      { a: [0, 1.4, 0], b: [-0.4, 2.3, -0.08], ra: 0.11, rb: 0.02, growth: 1, spawnTime: 0 },
    ]                                                                                                                                                 
  }*/
 export function generateTree(params: {
    depth: number           // levels of recursion
    trunkLength: number
    trunkRadius: number
    lengthRatio: number     // child length relative to parent
    radiusRatio: number     // ^^
    tiltAngle: number       // in radians
    childrenPerNode: number
 }) : Branch[] {
    const out: Branch[] = []

    function recurse(base: Vec3, dir: Vec3, length: number, radius: number, depth: number, parentAzimuth: number) {
        const b = add(base, scale(dir, length))
        const branch: Branch = {a: base, b: b, ra: radius, rb: radius * params.radiusRatio, growth: 1, spawnTime: 0}
        out.push(branch)
        if(depth == 0)
            return

        for(let i = 0; i < params.childrenPerNode; i++){
            const isAxial = i == 0
            const tilt = isAxial ? params.tiltAngle * 0.2 : params.tiltAngle
            const childLength = length * (isAxial ? params.lengthRatio * 1.3 : params.lengthRatio)
            const t = isAxial ? 1.0 : (i / params.childrenPerNode) * 0.7 + 0.3
            const sproutBase = add(base, scale(dir, length * t))

            const siblingAzimuth = (i / params.childrenPerNode) * 2 * Math.PI
            const azimuth = parentAzimuth + siblingAzimuth

            let perp = anyPerpendicular(dir)
            let newAngle = rotateAroundAxis(dir, perp, tilt)
            newAngle = rotateAroundAxis(newAngle, dir, azimuth)
            recurse(sproutBase, newAngle, childLength, radius * params.radiusRatio, depth - 1, azimuth + GOLDEN_ANGLE)
        }
        
    }

    recurse([0, -1.5, 0], [0, 1, 0], params.trunkLength, params.trunkRadius, params.depth, 0)
    return out
 }