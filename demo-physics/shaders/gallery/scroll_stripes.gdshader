shader_type spatial;

// Demo 6: scrolling UV offset — conveyor stripes
uniform float stripe_count : hint_range(1.0, 40.0) = 10.0;
uniform vec2 scroll_speed = vec2(0.35, 0.0);

void fragment() {
	vec2 uv = UV + TIME * scroll_speed;
	float band = step(0.5, fract(uv.x * stripe_count));
	ALBEDO = mix(vec3(0.85, 0.3, 0.1), vec3(0.08, 0.09, 0.12), band);
	ROUGHNESS = 0.5;
}
