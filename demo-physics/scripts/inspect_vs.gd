@tool
extends EditorScript

func _run():
	var vs = load("res://shaders/test_visualshader.tres")
	print("Mode: ", vs.mode)
	var nodes = vs.get_node_list(vs.TYPE_FRAGMENT)
	print("Nodes: ", nodes)
	for id in nodes:
		var node = vs.get_node(vs.TYPE_FRAGMENT, id)
		print("  ", id, ": ", node.get_class())
		if node is VisualShaderNodeInput:
			print("    input_name: ", node.input_name)
	print("Connections: ", vs.get_node_connections(vs.TYPE_FRAGMENT))