shader_type spatial;
render_mode cull_disabled;

// Demo 10: flag in the wind — vertex animation
uniform vec3 color_a : source_color = vec3(0.85, 0.25, 0.2);
uniform vec3 color_b : source_color = vec3(0.95, 0.85, 0.3);
uniform float wave_height : hint_range(0.0, 0.5) = 0.16;
uniform float wave_speed : hint_range(0.0, 12.0) = 5.0;

void vertex() {
	float sway = sin(UV.x * 9.0 - TIME * wave_speed) * wave_height * UV.x;
	VERTEX.y += sway;
	VERTEX.z += cos(UV.x * 7.0 - TIME * wave_speed * 0.7) * wave_height * 0.5 * UV.x;
}

void fragment() {
	ALBEDO = mix(color_a, color_b, UV.x);
	ROUGHNESS = 0.8;
}
