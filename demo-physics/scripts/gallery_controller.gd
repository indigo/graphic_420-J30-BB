extends Node3D
## Animates shader uniforms across the gallery so every demo moves.

var _t := 0.0

func _process(delta: float) -> void:
	_t += delta
	for child in get_children():
		if child is MeshInstance3D:
			var mat := child.get_active_material(0) as ShaderMaterial
			if mat == null:
				continue
			if mat.get_shader_parameter("explode_amount") != null:
				mat.set_shader_parameter("explode_amount", 0.45 * (0.5 + 0.5 * sin(_t * 1.2)))
			elif mat.get_shader_parameter("dissolve_amount") != null:
				mat.set_shader_parameter("dissolve_amount", 0.5 + 0.5 * sin(_t * 0.6))
			elif mat.get_shader_parameter("power") != null:
				mat.set_shader_parameter("power", 2.0 + 2.0 * sin(_t * 0.5))
			elif mat.get_shader_parameter("steps") != null:
				mat.set_shader_parameter("steps", 2.0 + 8.0 * (0.5 + 0.5 * sin(_t * 0.35)))
