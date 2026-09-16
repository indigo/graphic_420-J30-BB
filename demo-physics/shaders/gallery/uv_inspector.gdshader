shader_type spatial;
render_mode unshaded;

// Demo 2: visualize UV coordinates (also interpolated varyings)
void fragment() {
	ALBEDO = vec3(UV, 0.0);
}
