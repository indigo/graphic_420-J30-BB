shader_type spatial;

// Demo 9: explode — vertex displacement along normals
uniform float explode_amount : hint_range(0.0, 1.0) = 0.0;

void vertex() {
	VERTEX += NORMAL * explode_amount;
}

void fragment() {
	float rim = pow(1.0 - clamp(dot(NORMAL, VIEW), 0.0, 1.0), 2.0);
	ALBEDO = vec3(0.85, 0.3, 0.12);
	ROUGHNESS = 0.55;
	EMISSION = vec3(1.0, 0.5, 0.1) * rim * (0.2 + explode_amount * 2.0);
}
