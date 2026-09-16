shader_type spatial;

// Demo 7: dissolve — procedural noise + discard + glowing edge
uniform float dissolve_amount : hint_range(0.0, 1.0) = 0.0;
uniform float edge_width : hint_range(0.01, 0.2) = 0.07;
uniform float noise_scale : hint_range(1.0, 8.0) = 3.5;

varying vec3 world_pos;

void vertex() {
	world_pos = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
}

float hash13(vec3 p) {
	p = fract(p * 0.1031);
	p += dot(p, p.zyx + 31.32);
	return fract((p.x + p.y) * p.z);
}

float vnoise(vec3 p) {
	vec3 i = floor(p);
	vec3 f = fract(p);
	f = f * f * (3.0 - 2.0 * f);
	float n000 = hash13(i);
	float n100 = hash13(i + vec3(1.0, 0.0, 0.0));
	float n010 = hash13(i + vec3(0.0, 1.0, 0.0));
	float n110 = hash13(i + vec3(1.0, 1.0, 0.0));
	float n001 = hash13(i + vec3(0.0, 0.0, 1.0));
	float n101 = hash13(i + vec3(1.0, 0.0, 1.0));
	float n011 = hash13(i + vec3(0.0, 1.0, 1.0));
	float n111 = hash13(i + vec3(1.0, 1.0, 1.0));
	float nx00 = mix(n000, n100, f.x);
	float nx10 = mix(n010, n110, f.x);
	float nx01 = mix(n001, n101, f.x);
	float nx11 = mix(n011, n111, f.x);
	return mix(mix(nx00, nx10, f.y), mix(nx01, nx11, f.y), f.z);
}

void fragment() {
	float n = vnoise(world_pos * noise_scale);
	if (n < dissolve_amount) {
		discard;
	}
	float edge = 1.0 - smoothstep(dissolve_amount, dissolve_amount + edge_width, n);
	ALBEDO = vec3(0.5, 0.56, 0.62);
	ROUGHNESS = 0.45;
	METALLIC = 0.1;
	EMISSION = vec3(1.0, 0.45, 0.08) * edge * 6.0;
}
