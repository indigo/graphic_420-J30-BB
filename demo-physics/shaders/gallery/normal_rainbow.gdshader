shader_type spatial;
render_mode unshaded;

// Demo 1: visualize interpolated normals (a varying!)
void fragment() {
	ALBEDO = NORMAL * 0.5 + 0.5;
}
