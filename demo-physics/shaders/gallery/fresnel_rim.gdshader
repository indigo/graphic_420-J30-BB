shader_type spatial;

// Demo 4: fresnel rim — driven by a uniform animated from GDScript
uniform vec3 rim_color : source_color = vec3(0.3, 0.7, 1.0);
uniform float power : hint_range(0.2, 8.0) = 3.0;

void fragment() {
	float fresnel = pow(1.0 - clamp(dot(NORMAL, VIEW), 0.0, 1.0), power);
	ALBEDO = vec3(0.02, 0.02, 0.03);
	ROUGHNESS = 0.35;
	METALLIC = 0.2;
	EMISSION = rim_color * fresnel * 3.0;
}
