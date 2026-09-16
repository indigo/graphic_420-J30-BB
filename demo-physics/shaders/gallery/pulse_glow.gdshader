shader_type spatial;

// Demo 5: TIME uniform — pulsing emission
uniform vec3 glow_color : source_color = vec3(1.0, 0.35, 0.1);
uniform float speed : hint_range(0.0, 10.0) = 2.0;

void fragment() {
	float pulse = 0.5 + 0.5 * sin(TIME * speed);
	ALBEDO = vec3(0.02);
	ROUGHNESS = 1.0;
	EMISSION = glow_color * (0.15 + pulse * 2.5);
}
