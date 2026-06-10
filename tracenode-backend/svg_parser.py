import re
import xml.etree.ElementTree as ET

def parse_path_commands(d):
    """
    Parses the SVG path 'd' attribute into a list of commands and their numeric arguments.
    Example: "M 10,20 C 30 40, 50 60, 70 80" -> [('M', [10.0, 20.0]), ('C', [30.0, 40.0, 50.0, 60.0, 70.0, 80.0])]
    """
    # Tokenize: find all commands and numeric values (integers, floats, scientific notation)
    token_pattern = re.compile(r'([a-df-zA-DF-Z])|(-?\d*\.?\d+(?:[eE][-+]?\d+)?)')
    tokens = []
    for match in token_pattern.finditer(d):
        cmd, val = match.groups()
        if cmd:
            tokens.append(('cmd', cmd))
        elif val:
            tokens.append(('val', float(val)))
            
    commands = []
    current_cmd = None
    current_args = []
    
    for token_type, token_val in tokens:
        if token_type == 'cmd':
            if current_cmd is not None:
                commands.append((current_cmd, current_args))
            current_cmd = token_val
            current_args = []
        elif token_type == 'val':
            # Handle implicit commands (e.g. multiple coordinate pairs after M act as L)
            if current_cmd is None:
                continue # Ignore values before any command
            current_args.append(token_val)
            
    if current_cmd is not None:
        commands.append((current_cmd, current_args))
        
    return commands

def count_nodes_in_commands(commands):
    """
    Counts the number of anchor points (nodes) in the path commands.
    In vector graphics, nodes are the start/end points of path segments.
    Control points are not counted as separate nodes.
    """
    node_count = 0
    
    # Argument lengths for standard commands
    # M/m: 2, L/l: 2, H/h: 1, V/v: 1, C/c: 6, S/s: 4, Q/q: 4, T/t: 2, A/a: 7
    for cmd, args in commands:
        cmd_lower = cmd.lower()
        
        if cmd_lower in ('m', 'l', 't'):
            # These commands take coordinate pairs (x, y)
            # Each pair is a node
            node_count += len(args) // 2
        elif cmd_lower in ('h', 'v'):
            # Horizontal / vertical lineto
            # Each value represents a coordinate change, adding a node
            node_count += len(args)
        elif cmd_lower == 'c':
            # Cubic Bezier: (x1, y1, x2, y2, x, y)
            # Each 6 numbers represent one curve segment ending at (x, y)
            node_count += len(args) // 6
        elif cmd_lower in ('s', 'q'):
            # Smooth cubic / quadratic Bezier: (x2, y2, x, y) / (x1, y1, x, y)
            # Each 4 numbers represent one segment ending at (x, y)
            node_count += len(args) // 4
        elif cmd_lower == 'a':
            # Arc: (rx, ry, x-axis-rotation, large-arc-flag, sweep-flag, x, y)
            # Each 7 numbers represent one segment ending at (x, y)
            node_count += len(args) // 7
        elif cmd_lower == 'z':
            # Close path: does not add a new node (just connects back to start)
            pass
            
    return node_count

def get_svg_node_count(svg_filepath):
    """
    Parses the SVG file, extracts all path elements, and returns the total node count.
    """
    try:
        # Register namespaces to prevent parsing failures or prefixing issues
        tree = ET.parse(svg_filepath)
        root = tree.getroot()
        
        # Remove namespace prefix from tag names to simplify XPath matching
        # SVG files usually have namespace xmlns="http://www.w3.org/2000/svg"
        namespaces = {'svg': 'http://www.w3.org/2000/svg'}
        
        # Find all path elements (handle both with and without namespace)
        paths = root.findall('.//svg:path', namespaces)
        if not paths:
            # Fallback if no namespace is defined or default parsing is used
            paths = root.findall('.//path')
            
        total_nodes = 0
        for path in paths:
            d = path.attrib.get('d', '')
            if d:
                commands = parse_path_commands(d)
                total_nodes += count_nodes_in_commands(commands)
                
        return total_nodes
    except Exception as e:
        print(f"Error parsing SVG node count: {e}")
        return 0

# Simple test block
if __name__ == '__main__':
    # Test path string
    test_d = "M 10,20 L 30,40 C 50,60 70,80 90,100 Z"
    cmds = parse_path_commands(test_d)
    print("Parsed commands:", cmds)
    nodes = count_nodes_in_commands(cmds)
    print("Node count:", nodes) # Should be 3: M(1), L(1), C(1)
