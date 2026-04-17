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

@fragment
fn fs(in: VSOut) -> @location(0) vec4f {
    return vec4f(in.uv, 0, 1);
}