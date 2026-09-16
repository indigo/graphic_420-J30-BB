shader_type spatial;

// Simple shader that colors the surface based on its normal
// This is a starting point — you can convert this to a VisualShader
// by creating a new VisualShader resource in the Inspector.

void fragment() {
    // Map the normal ([-1,1]) to a color ([0,1])
    ALBEDO = NORMAL * 0.5 + 0.5;
}