shader_type spatial;
render_mode unshaded;

// Demo 3: world position passed from vertex() to fragment() via a varying
varying vec3 world_pos;

void vertex() {
	world_pos = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
}

void fragment() {
	ALBEDO = fract(world_pos);
}
