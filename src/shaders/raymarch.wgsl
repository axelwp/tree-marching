struct VSOut {
    @builtin(position) pos: vec4f,
    @location(0) uv: vec2f,
}

struct Uniforms {
    time: f32,          //offset 0
    resolution: vec2f,  //offset 4
    // rounds up to 16 bytes
}

@group(0) @binding(0) var<uniform> u: Uniforms;

struct Branch {
    a: vec3f,       // offset 0
    ra: f32,        //offset 12
    b: vec3f,       //offset 16
    rb: f32,        //offset 28
    growth: f32,    //offset 32
    spawnTime: f32  //offset 36
    // rounds up to 48 bytes
}

@group(0) @binding(1) var<storage, read> branches: array<Branch>;

//using a quad here for the "screen" instead of a triangle to make computation more efficient.
@vertex
fn vs(@builtin(vertex_index) i: u32) -> VSOut {
    let p = array(vec2f(-1, -1), vec2f(3, -1), vec2f(-1, 3))[i];
    var out: VSOut;
    out.pos = vec4f(p, 0, 1);
    out.uv = (p + 1.0) * 0.5;
    return out;
}


fn sdSphere(p: vec3f, c: vec3f, r: f32) -> f32 {
    return length(p - c) - r;
}

fn sdCapsule(p: vec3f, a: vec3f, b: vec3f, r: f32) -> f32 {
    let pa = p - a;
    let ba = b - a;
    let h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
    return length(pa - ba * h) - r;
}

fn sdRoundCone(p: vec3f, a: vec3f, b: vec3f, ra: f32, rb: f32) -> f32 {
    let ba = b - a;
    let l2 = dot(ba, ba);
    let rr = ra - rb;
    let a2 = l2 - rr * rr;
    let il2 = 1.0 / l2;

    let pa = p - a;
    let y = dot(pa, ba);
    let z = y - l2;
    let xp = pa * l2 - ba * y;
    let x2 = dot(xp, xp);
    let y2 = y * y* l2;
    let z2 = z * z * l2;

    let k = sign(rr) * rr * rr * x2;
    if (sign(z) * a2 * z2 > k) {return sqrt(x2 + z2) * il2 -rb; }
    if (sign(y) * a2 * y2 < k) {return sqrt(x2 + y2) * il2 - ra; }
    return (sqrt(x2 * a2 * il2) + y * rr) *il2 - ra;
}

fn smin(a: f32, b: f32, k: f32) -> f32 { // where k is the blend radius
    let h = max(k - abs(a - b), 0.0) / k;
    return min(a, b) - h * h * k * 0.25;
}

fn sdScene(p: vec3f) -> f32 {
    let n = arrayLength(&branches);
    var d = 1000.0;                                                                                                                                   
    for (var i = 0u; i < n; i++) {                                    
      let br = branches[i];                                                                                                                           
      // cheap bounding sphere around the branch                                                                                                      
      let mid = (br.a + br.b) * 0.5;                                                                                                                  
      let halfLen = length(br.b - br.a) * 0.5;                                                                                                        
      let bound = halfLen + max(br.ra, br.rb);                                                                                                        
      let sphereDist = length(p - mid) - bound;
                                                                                                                                                      
      // far from this branch? skip the expensive op                  
      if (sphereDist > 0.2) {  // 0.2 = smin blend radius, tune as needed                                                                             
        d = min(d, sphereDist);                                       
        continue;                                                                                                                                     
      }                                                               
                                                                                                                                                      
      d = smin(d, sdRoundCone(p, br.a, br.b, br.ra, br.rb), 0.05);                                                                                    
    }                
    return d;
}

fn softShadow(ro: vec3f, rd: vec3f, maxt: f32, k: f32) -> f32 { // k controls penumbra softness (higher k -> harder shadows)
    var res = 1.0;
    var t = 0.02;
    for (var i = 0; i < 32; i++) {
        let h = sdScene(ro + rd * t);
        if (h < 0.001) { return 0.0; }
        res = min(res, k * h / t);
        t += h;
        if (t > maxt) { break; }
    }
    return clamp(res, 0.0, 1.0);
}

fn getNormal(p: vec3f) -> vec3f {
    let e = 0.001;
    return normalize(vec3f(
        sdScene(p + vec3f(e, 0, 0)) - sdScene(p - vec3f(e, 0, 0)),
        sdScene(p + vec3f(0, e, 0)) - sdScene(p - vec3f(0, e, 0)),
        sdScene(p + vec3f(0, 0, e)) - sdScene(p - vec3f(0, 0, e)),
    ));
}


fn march(ro: vec3f, rd: vec3f) -> f32 {
    let scenceCenter = vec3f(0.0, 0.5, 0.0);
    let sceneRadius = 3.0;
    let oc = ro - scenceCenter;
    let b = dot(oc, rd);
    let c = dot(oc, oc) - sceneRadius * sceneRadius;
    let h = b * b - c;
    if (h < 0.0) { return -1.0; }   //ray completely misses the sceneRadius

    let sq = sqrt(h);
    var t = max(0.0, -b - sq);      // advance to near surface
    var tMax = min(20.0, -b + sq);  // don't need to march past far surfaces

    for( var i = 0; i < 64; i++) {
        if (t > tMax) { break; }
        let d = sdScene(ro + rd * t);
        if (d < 0.001) { return t; }
        t += d;
    }
    return -1;
}


@fragment
fn fs(in: VSOut) -> @location(0) vec4f {
    var ndc = in.uv * 2.0 - 1.0;

    var aspect = u.resolution.x / u.resolution.y; // using hardcoded 16:9 for now
    ndc.x *= aspect; 

    var camera = vec3f(0, 0, -3); // camera, looking down at +z

    var pinhole = normalize(vec3f(ndc, 1.0));

    let t = march(camera, pinhole);
    if(t < 0.0 ) {
        return vec4f(0.05, 0.05, 0.08, 1.0); // if it misses, return background color
    }
    let p = camera + pinhole * t;
    let n = getNormal(p);

    
    let lightDir = normalize(vec3f(0.3, 0.3, -0.1)); //directional light
    let shadow = softShadow(p + n * 0.1, lightDir, 20.0, 11.0);
    let diffuse = max(dot(n, lightDir), 0.0) * shadow + 0.1; //ambient light

    return vec4f(vec3f(diffuse), 1.0); // [-1, 1] -> [0, 1]
}

