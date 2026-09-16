shader_type spatial;
render_mode blend_add, cull_disabled, unshaded;

// Demo 8b: hologram — fresnel + scanlines + additive blending
uniform vec3 holo_color : source_color = vec3(0.3, 0.75, 1.0);
uniform float scan_count = 22.0;
uniform float scan_speed = 1.5;
uniform float fresnel_power : hint_range(0.5, 8.0) = 2.5;

void fragment() {
	float fresnel = pow(1.0 - clamp(dot(NORMAL, VIEW), 0.0, 1.0), fresnel_power);
	float scan = 0.55 + 0.45 * sin(UV.y * scan_count * 6.2831 + TIME * scan_speed);
	float flicker = 0.92 + 0.08 * sin(TIME * 40.0);
	ALBEDO = holo_color * 2.0;
	ALPHA = clamp(fresnel * 1.8 * scan * flicker, 0.0, 1.0);
}
