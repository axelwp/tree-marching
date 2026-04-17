struct VSOut {
    @builtin(position) pos: vec4f,
    @location(0) uv: vec2f,
}

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

fn smin(a: f32, b: f32, k: f32) -> f32 { // where k is the blend radius
    let h = max(k - abs(a - b), 0.0) / k;
    return min(a, b) - h * h * k * 0.25;
}

fn sdScene(p: vec3f) -> f32 {
    //let c = vec3f(0.0, sin(u.time) * 0.5, 0.0);
    let sphere = sdSphere(p, vec3f(0.0, 0.0, 0.0), 0.8);
    let capsule = sdCapsule(p, vec3f(-1.0, -1.0, 0), vec3f(0.8, 1.0, 0.0), 0.2);
    return smin(sphere, capsule, 0.3);
}

fn getNormal(p: vec3f) -> vec3f {
    let e = 0.001;
    return normalize(vec3f(
        sdScene(p + vec3f(e, 0, 0)) - sdScene(p - vec3f(e, 0, 0)),
        sdScene(p + vec3f(0, e, 0)) - sdScene(p - vec3f(0, e, 0)),
        sdScene(p + vec3f(0, 0, e)) - sdScene(p - vec3f(0, 0, e)),
    ));
}

struct Uniforms {
    time: f32,
    resolution: vec2f,
}

@group(0) @binding(0) var<uniform> u: Uniforms;


fn march(ro: vec3f, rd: vec3f) -> f32 {
    var t = 0.0;
    for(var i = 0; i < 64; i++){
        let p = ro + rd * t;
        let d = sdScene(p);
        if (d < 0.001) { return t; } // hit
        if (t > 20.0) { break; } // too far 
        t += d;
    }
    return -1.0; // miss
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
    let diffuse = max(dot(n, lightDir), 0.1); //ambient light

    return vec4f(vec3f(diffuse), 1.0); // [-1, 1] -> [0, 1]
}

