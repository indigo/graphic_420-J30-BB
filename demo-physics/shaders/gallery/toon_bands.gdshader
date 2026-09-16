shader_type spatial;

// Demo 8: toon shading — quantized light in the light() pass
uniform vec3 base_color : source_color = vec3(0.85, 0.3, 0.2);
uniform float steps : hint_range(1.0, 20.0) = 3.0;

void fragment() {
	ALBEDO = base_color;
	ROUGHNESS = 1.0;
}

void light() {
	float ndl = clamp(dot(NORMAL, LIGHT), 0.0, 1.0);
	float banded = ceil(ndl * steps) / steps;
	DIFFUSE_LIGHT += ALBEDO * LIGHT_COLOR * (0.15 + 0.85 * banded) * ATTENUATION;
}
