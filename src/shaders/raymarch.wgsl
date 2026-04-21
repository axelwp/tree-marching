struct VSOut {
    @builtin(position) pos: vec4f,
    @location(0) uv: vec2f,
}

struct Uniforms {
    time: f32,          // offset 0
    resolution: vec2f,  // offset 4
    camAzimuth: f32,    // offset 12
    camElevation: f32,  // offset 16
    camDistance: f32,   // offset 20
}

@group(0) @binding(0) var<uniform> u: Uniforms;

struct Branch {
    a: vec3f,       // offset 0
    ra: f32,        //offset 12
    b: vec3f,       //offset 16
    rb: f32,        //offset 28
    c: vec3f,       //offset 32
    growth: f32,    //offset 44
    spawnTime: f32  //offset 48
    // rounds up to 64 bytes
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

fn sdBezier(p: vec3f, a: vec3f, c: vec3f, b: vec3f, ra: f32, rb: f32, growth: f32) -> f32 {
    let v = a - 2.0 * c + b;

    // fix for a bug caused when a, c, and b are collinear, resulting in a value of 0 for v -> divide by 0 error in kk calc
    if(dot(v, v) < 1e-6) {
        let bEff = mix(a, b, growth);
        let rbEff = mix(ra, rb, growth);
        return sdRoundCone(p, a, bEff, ra, rbEff);
    }
    let u = c - a;
    let w = a - p;

    // normalize cubic: t³ + 3kx·t² + 3ky·t + kz = 0 
    let kk = 1.0 / dot(v, v);
    let kx = kk * dot(u, v);
    let ky = kk * (2.0 * dot(u, u) + dot(w, v)) / 3.0;
    let kz = kk * dot(w, u);

    // depressed cubic after t = 2 - kx: s³ + 3p·s + q = 0
    let p_ = ky - kx * kx;
    let q_ = kx * (2.0 * kx * kx - 3.0 * ky) + kz;

    // discriminant sign tells us which branch to take
    let h = q_ * q_ + 4.0 * p_ * p_ * p_;

    var t: f32;
    if (h >= 0.0) {
        // three real roots - trigonometric from
        let sh = sqrt(h);
        let xy = (vec2f(sh, -sh) - q_) * 0.5;
        // real cube root
        let uvc = sign(xy) * pow(abs(xy), vec2f(1.0 / 3.0));
        t = clamp(uvc.x + uvc.y - kx, 0.0, 1.0);
    } else {
        // three real roots - trigonometric form
        let z = sqrt(-p_);
        let phi = acos(clamp(q_ / (p_ * z * 2.0), -1.0, 1.0)) / 3.0;
        let m = cos(phi);
        let n = sin(phi) * 1.732050808;     // sqrt(3)
        let roots = clamp(vec3f(m + m, -n - m, n - m) * z - kx, vec3f(0.0), vec3f(1.0));

        // evaluate each root, pick the smallest distance
        let q0 = a + (2.0 * u + v * roots.x) * roots.x - p;
        let q1 = a + (2.0 * u + v * roots.y) * roots.y - p;
        let q2 = a + (2.0 * u + v * roots.z) * roots.z - p;
        let d0 = dot(q0, q0);
        let d1 = dot(q1, q1);
        let d2 = dot(q2, q2);

        var bestT = roots.x;
        var bestD = d0;
        if (d1 < bestD) { bestT = roots.y; bestD = d1; }
        if (d2 < bestD) { bestT = roots.z; }
        t = bestT;
    }
    // growth clipping - cap at current growth
    t = min(t, growth);

    let pt = a + (2.0 * u + v * t) * t;
    let rad = mix(ra, rb, t);
    return length(pt - p) - rad;
}

fn smin(a: f32, b: f32, k: f32) -> f32 { // where k is the blend radius
    let h = max(k - abs(a - b), 0.0) / k;
    return min(a, b) - h * h * k * 0.25;
}

fn sdScene(p: vec3f) -> f32 {
    let n = arrayLength(&branches);
    var d = 1000.0;
    var growthDuration = 1.0;
    for (var i = 0u; i < n; i++) {
        let br = branches[i];
        // cheap bounding sphere around the branch
        let mid = (br.a + br.b + br.c) / 3.0;
        let halfLen = length(br.b - br.a) * 0.5;
        let bound = max(max(length(br.a - mid), length(br.b - mid)), length(br.c - mid)) + max(br.ra, br.rb);
        let sphereDist = length(p - mid) - bound;

        // skip smin if far from the branch
        if (sphereDist > 0.2) {  // 0.2 = smin blend radius, tune as needed
            d = min(d, sphereDist);
            continue;
        }

        let growth = clamp((u.time - br.spawnTime) / growthDuration, 0.0, 1.0);
        if (growth <= 0.0) { continue; }                                          // hasnt spawned yet

        d = smin(d, sdBezier(p, br.a, br.c, br.b, br.ra, br.rb, growth), 0.03);
    }                
    return d;
}

fn hardShadow(ro: vec3f, rd: vec3f, maxt: f32) -> f32 {
    var t = 0.05;
    for (var i = 0; i < 48; i++) {
        let h = sdScene(ro + rd * t);
        if (h < 0.001) { return 0.0; }
        t += h;
        if (t > maxt) { break; }
    }
    return 1.0;
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
    let scenceCenter = vec3f(0.0, 1.0, 0.0);
    let sceneRadius = 4.0;
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

    let ce = cos(u.camElevation);
    let se = sin(u.camElevation);
    let ca = cos(u.camAzimuth);
    let sa = sin(u.camAzimuth);

    let lookAt = vec3f(0.0, 1.5, 0.0);
    let camPos = lookAt + u.camDistance * vec3f(ce * sa, se, ce * ca);

    let forward = normalize(lookAt - camPos);
    let right = normalize(cross(forward, vec3f(0, 1, 0)));
    let up = cross(right, forward);

    let fov = 0.6;

    let rd = normalize(forward + right * ndc.x * fov + up * ndc.y * fov);

    let t = march(camPos, rd);
    if(t < 0.0 ) {
        return vec4f(0.05, 0.05, 0.08, 1.0); // if it misses, return background color
    }
    let p = camPos + rd * t;
    let n = getNormal(p);

    
    let lightDir = normalize(vec3f(0.3, 0.3, -0.1)); //directional light
    let shadow = hardShadow(p + n * 0.01, lightDir, 20.0);
    let diffuse = max(dot(n, lightDir), 0.0) * shadow + 0.2; //ambient light
    let color = diffuse;;

    return vec4f(vec3f(color), 1.0); // [-1, 1] -> [0, 1]
}

