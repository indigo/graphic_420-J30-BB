@tool
extends EditorScript

func _run():
	var vs = load("res://shaders/test_visualshader.tres")
	
	# Remove all nodes except Output (ID 0)
	for id in vs.get_node_list(vs.TYPE_FRAGMENT):
		if id != 0:
			vs.remove_node(vs.TYPE_FRAGMENT, id)
	
	# Add Input node at ID 2 (IDs 0 and 1 are reserved)
	var input_node = VisualShaderNodeInput.new()
	input_node.input_name = "normal"
	vs.add_node(vs.TYPE_FRAGMENT, input_node, Vector2(100, 300), 2)
	
	# Connect: Input(2).port(0) → Output(0).port(0 = ALBEDO)
	vs.connect_nodes(vs.TYPE_FRAGMENT, 2, 0, 0, 0)
	
	ResourceSaver.save(vs, "res://shaders/test_visualshader.tres")
	print("Done: Input(normal) → Output(ALBEDO)")
