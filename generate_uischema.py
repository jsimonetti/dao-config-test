#!/usr/bin/env python3
"""
Generate UISchema from Pydantic models with embedded UI metadata.

Extracts x-ui-* properties from Field json_schema_extra and generates
a complete JSONForms UISchema with proper grouping, ordering, and controls.
"""

import json
import sys
import argparse
from pathlib import Path
from typing import Any, Dict, Tuple
from collections import defaultdict
import subprocess

# Global flag for quiet mode
QUIET = False


def replace_flexvalue_refs(schema: Dict[str, Any]) -> Dict[str, Any]:
    """
    Replace FlexValue $ref objects with plain string type in anyOf arrays.
    
    FlexValue fields should accept either numbers or entity ID strings,
    so we replace the FlexValue object reference with {type: string}.
    Also moves validation constraints (minimum, maximum, etc.) into the 
    integer/number option in the anyOf.
    """
    if isinstance(schema, dict):
        # If this is an anyOf with a FlexValue reference, replace it
        if "anyOf" in schema and isinstance(schema["anyOf"], list):
            new_anyof = []
            number_constraints = {}
            
            # Collect number validation constraints from root
            for key in ["minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "multipleOf"]:
                if key in schema:
                    number_constraints[key] = schema.pop(key)
            
            # Also check for Pydantic-style constraints
            if "ge" in schema:
                number_constraints["minimum"] = schema.pop("ge")
            if "le" in schema:
                number_constraints["maximum"] = schema.pop("le")
            if "gt" in schema:
                number_constraints["exclusiveMinimum"] = schema.pop("gt")
            if "lt" in schema:
                number_constraints["exclusiveMaximum"] = schema.pop("lt")
            
            for item in schema["anyOf"]:
                if isinstance(item, dict) and "$ref" in item:
                    # Check if it's a FlexValue reference
                    if "FlexValue" in item["$ref"]:
                        # Replace with string type
                        new_anyof.append({"type": "string"})
                    else:
                        new_anyof.append(item)
                elif isinstance(item, dict) and item.get("type") in ["integer", "number"]:
                    # Convert integer to number for FlexValue compatibility
                    # Add constraints to number type
                    new_item = {**item, **number_constraints}
                    new_item["type"] = "number"  # Always use number, not integer
                    new_anyof.append(new_item)
                else:
                    new_anyof.append(item)
            
            schema["anyOf"] = new_anyof
        
        # Recursively process nested objects
        for key, value in schema.items():
            if isinstance(value, dict):
                schema[key] = replace_flexvalue_refs(value)
            elif isinstance(value, list):
                schema[key] = [replace_flexvalue_refs(item) if isinstance(item, dict) else item for item in value]
    
    return schema


def flatten_optional_anyof(schema: Dict[str, Any]) -> Dict[str, Any]:
    """
    Flatten Optional-style anyOf patterns to avoid JSONForms combinator rendering.
    
    Converts: {"anyOf": [{"$ref": "#/$defs/Model"}, {"type": "null"}]}
    To: {"$ref": "#/$defs/Model"} (and ensures field is not in required array)
    
    This prevents JSONForms from showing ANYOF-1/ANYOF-2 tabs for optional fields.
    Only flattens simple Optional patterns (Model | null), not complex unions.
    """
    if isinstance(schema, dict):
        # Check if this is a simple Optional pattern: anyOf with exactly 2 items,
        # one being a $ref or simple type, the other being null
        if "anyOf" in schema and isinstance(schema["anyOf"], list) and len(schema["anyOf"]) == 2:
            has_null = False
            non_null_item = None
            
            for item in schema["anyOf"]:
                if isinstance(item, dict) and item.get("type") == "null":
                    has_null = True
                elif isinstance(item, dict):
                    non_null_item = item
            
            # If we have exactly one null and one non-null, flatten it
            if has_null and non_null_item is not None:
                # Replace anyOf with the non-null item
                del schema["anyOf"]
                # Copy all properties from non_null_item to schema
                for key, value in non_null_item.items():
                    if key not in schema:  # Don't overwrite existing keys like 'default', 'description'
                        schema[key] = value
        
        # Recursively process nested objects and arrays
        for key, value in schema.items():
            if isinstance(value, dict):
                schema[key] = flatten_optional_anyof(value)
            elif isinstance(value, list):
                schema[key] = [flatten_optional_anyof(item) if isinstance(item, dict) else item for item in value]
    
    return schema


def resolve_ref(ref: str, defs: Dict[str, Any]) -> Dict[str, Any]:
    """Resolve a $ref pointer to its definition."""
    if ref.startswith("#/$defs/"):
        def_name = ref.replace("#/$defs/", "")
        return defs.get(def_name, {})
    return {}


def extract_x_ui_group_from_property(prop_schema: Dict[str, Any], defs: Dict[str, Any]) -> Tuple[str, int]:
    """
    Extract x-ui-group and x-order from a property schema.
    
    For object types, check the schema directly.
    For array types, check the items $ref definition.
    For $ref types, resolve and check the definition.
    For anyOf types (complex unions), check the first non-null option.
    """
    # Check if property has x-ui-group or x-order directly
    group = prop_schema.get("x-ui-group", None)
    order = prop_schema.get("x-order", 999)
    
    if group is not None:
        return group, order
    
    # Check if it's a $ref - resolve it (handles flattened Optional types)
    if "$ref" in prop_schema:
        resolved = resolve_ref(prop_schema["$ref"], defs)
        if "x-ui-group" in resolved:
            return resolved.get("x-ui-group", "General"), resolved.get("x-order", 999)
    
    # Check if it's an anyOf (complex unions that weren't flattened)
    if "anyOf" in prop_schema:
        for option in prop_schema["anyOf"]:
            # Skip null types
            if isinstance(option, dict) and option.get("type") == "null":
                continue
            # Check if this option has a $ref
            if isinstance(option, dict) and "$ref" in option:
                resolved = resolve_ref(option["$ref"], defs)
                if "x-ui-group" in resolved:
                    return resolved.get("x-ui-group", "General"), resolved.get("x-order", 999)
    
    # Check if it's an array - look at items
    if prop_schema.get("type") == "array" and "items" in prop_schema:
        items = prop_schema["items"]
        if "$ref" in items:
            resolved = resolve_ref(items["$ref"], defs)
            if "x-ui-group" in resolved:
                return resolved.get("x-ui-group", "General"), resolved.get("x-order", 999)
    
    return "General", order


def validate_entity_picker_filters(schema: Dict[str, Any], defs: Dict[str, Any]) -> None:
    """
    Validate that all entity picker widgets have x-ui-widget-filter defined.
    
    Only checks entity-picker and entity-list-picker. The entity-picker-or-X variants
    don't need filters since the X type (number, boolean) already infers the HA type.
    
    Raises ValueError if any entity picker widget is missing the filter property.
    This helps catch configuration errors at build time.
    """
    entity_picker_widgets = {
        "entity-picker",
        "entity-list-picker"
    }
    
    violations = []
    
    def check_property(prop_name: str, prop_schema: Dict[str, Any], path: str = "") -> None:
        """Recursively check a property and its nested properties."""
        full_path = f"{path}.{prop_name}" if path else prop_name
        
        # Check direct widget property
        widget = prop_schema.get("x-ui-widget")
        if widget in entity_picker_widgets:
            if "x-ui-widget-filter" not in prop_schema:
                violations.append(f"{full_path} (widget: {widget})")
        
        # Check in resolved $ref
        if "$ref" in prop_schema:
            resolved = resolve_ref(prop_schema["$ref"], defs)
            widget = resolved.get("x-ui-widget")
            if widget in entity_picker_widgets:
                if "x-ui-widget-filter" not in resolved:
                    violations.append(f"{full_path} -> {prop_schema['$ref']} (widget: {widget})")
            
            # Recursively check nested properties in resolved definition
            if "properties" in resolved:
                for nested_name, nested_schema in resolved["properties"].items():
                    check_property(nested_name, nested_schema, full_path)
        
        # Check in anyOf options
        if "anyOf" in prop_schema:
            for option in prop_schema["anyOf"]:
                if isinstance(option, dict) and option.get("type") != "null":
                    if "$ref" in option:
                        resolved = resolve_ref(option["$ref"], defs)
                        widget = resolved.get("x-ui-widget")
                        if widget in entity_picker_widgets:
                            if "x-ui-widget-filter" not in resolved:
                                violations.append(f"{full_path} -> {option['$ref']} (widget: {widget})")
                        
                        # Recursively check nested properties
                        if "properties" in resolved:
                            for nested_name, nested_schema in resolved["properties"].items():
                                check_property(nested_name, nested_schema, full_path)
        
        # Check in array items
        if prop_schema.get("type") == "array" and "items" in prop_schema:
            items = prop_schema["items"]
            if "$ref" in items:
                resolved = resolve_ref(items["$ref"], defs)
                widget = resolved.get("x-ui-widget")
                if widget in entity_picker_widgets:
                    if "x-ui-widget-filter" not in resolved:
                        violations.append(f"{full_path}[] -> {items['$ref']} (widget: {widget})")
                
                # Recursively check nested properties in array item definition
                if "properties" in resolved:
                    for nested_name, nested_schema in resolved["properties"].items():
                        check_property(nested_name, nested_schema, f"{full_path}[]")
    
    # Check all root properties
    properties = schema.get("properties", {})
    for prop_name, prop_schema in properties.items():
        check_property(prop_name, prop_schema)
    
    if violations:
        error_msg = (
            "❌ Entity picker widgets missing x-ui-widget-filter:\n" +
            "\n".join(f"  - {v}" for v in violations) +
            "\n\nAll entity picker widgets must have x-ui-widget-filter defined."
        )
        raise ValueError(error_msg)


def generate_uischema_for_property(prop_name: str, prop_schema: Dict[str, Any], defs: Dict[str, Any], source_class: str = None) -> Dict[str, Any] | list[Dict[str, Any]]:
    """
    Generate UISchema element(s) for a single property from the root schema.
    
    Handles objects, arrays, anyOf (complex unions), $refs, and primitive types.
    
    For arrays with help text, returns a list: [HelpButton, Control]
    Otherwise returns a single Control dict.
    
    Args:
        prop_name: Property name
        prop_schema: Property JSON schema
        defs: Schema definitions
        source_class: Python class name for source tracking (e.g., "PricingConfig")
    """
    scope = f"#/properties/{prop_name}"
    
    # Extract options from the property
    options = {}
    if "x-help" in prop_schema:
        options["help"] = prop_schema["x-help"]
    if "description" in prop_schema:
        options["description"] = prop_schema["description"]
    if "x-unit" in prop_schema:
        options["unit"] = prop_schema["x-unit"]
    if "x-ui-widget" in prop_schema:
        options["widget"] = prop_schema["x-ui-widget"]
    if "x-ui-widget-filter" in prop_schema:
        options["widgetFilter"] = prop_schema["x-ui-widget-filter"]
    
    # Add source location for debugging
    if source_class:
        options["x-source"] = f"{source_class}.{prop_name}"
    
    # Extract rule from x-ui-rules
    rule = None
    if "x-ui-rules" in prop_schema:
        rule = prop_schema["x-ui-rules"]
    
    # For direct $ref (flattened Optional types), extract metadata from definition
    if "$ref" in prop_schema:
        resolved = resolve_ref(prop_schema["$ref"], defs)
        if "x-help" in resolved and "help" not in options:
            options["help"] = resolved.get("x-help")
        if "description" in resolved and "description" not in options:
            options["description"] = resolved.get("description")
        if "x-unit" in resolved and "unit" not in options:
            options["unit"] = resolved.get("x-unit")
        if "x-ui-widget" in resolved and "widget" not in options:
            options["widget"] = resolved.get("x-ui-widget")
        if "x-ui-widget-filter" in resolved and "widgetFilter" not in options:
            options["widgetFilter"] = resolved.get("x-ui-widget-filter")
        if "x-ui-rules" in resolved and rule is None:
            rule = resolved.get("x-ui-rules")
        
        # Generate detail UISchema for nested objects (like HADatabaseConfig)
        if "properties" in resolved:
            # Extract source class from resolved definition
            nested_class = resolved.get("title", prop_name)
            detail_elements = generate_detail_uischema(resolved, defs, nested_class)
            if detail_elements:
                options["detail"] = {
                    "type": "VerticalLayout",
                    "elements": detail_elements
                }
    
    # For arrays, check items definition for metadata AND generate detail UISchema
    if prop_schema.get("type") == "array":
        if "items" in prop_schema and "$ref" in prop_schema["items"]:
            resolved = resolve_ref(prop_schema["items"]["$ref"], defs)
            # Extract all relevant metadata from the array item model
            if "x-help" in resolved and "help" not in options:
                options["help"] = resolved.get("x-help")
            if "description" in resolved and "description" not in options:
                options["description"] = resolved.get("description")
            if "title" in resolved and "title" not in options:
                options["title"] = resolved.get("title")
            if "x-docs-url" in resolved and "docsUrl" not in options:
                options["docsUrl"] = resolved.get("x-docs-url")
            if "x-icon" in resolved and "icon" not in options:
                options["icon"] = resolved.get("x-icon")
            
            # Generate detail UISchema for array items
            nested_class = resolved.get("title", prop_name)
            detail_elements = generate_detail_uischema(resolved, defs, nested_class)
            if detail_elements:
                options["detail"] = {
                    "type": "VerticalLayout",
                    "elements": detail_elements
                }
    
    # For anyOf (complex unions that weren't flattened), check inside for metadata
    if "anyOf" in prop_schema:
        for option_item in prop_schema["anyOf"]:
            # Skip null types
            if isinstance(option_item, dict) and option_item.get("type") == "null":
                continue
            # Check if this option has a $ref - resolve it for metadata
            if isinstance(option_item, dict) and "$ref" in option_item:
                resolved = resolve_ref(option_item["$ref"], defs)
                # Extract metadata from resolved definition if not already present
                if "x-help" in resolved and "help" not in options:
                    options["help"] = resolved.get("x-help")
                if "description" in resolved and "description" not in options:
                    options["description"] = resolved.get("description")
                if "x-unit" in resolved and "unit" not in options:
                    options["unit"] = resolved.get("x-unit")
                if "x-ui-widget" in resolved and "widget" not in options:
                    options["widget"] = resolved.get("x-ui-widget")
                if "x-ui-widget-filter" in resolved and "widgetFilter" not in options:
                    options["widgetFilter"] = resolved.get("x-ui-widget-filter")
                if "x-ui-rules" in resolved and rule is None:
                    rule = resolved.get("x-ui-rules")
                # Found the main type, stop looking
                break
    
    control = {
        "type": "Control",
        "scope": scope,
        "options": options if options else {}
    }
    
    # Add rule if present
    if rule:
        control["rule"] = rule
    
    # For arrays with help text, return a list with HelpButton + Control
    # This matches the pattern used for nested objects
    if prop_schema.get("type") == "array" and "help" in options:
        help_text = options["help"]
        # Remove help from control options since we're showing it as a button
        del options["help"]
        
        return [
            {
                "type": "HelpButton",
                "options": {
                    "helpText": help_text,
                    "helpTitle": "Help"
                }
            },
            control
        ]
    
    return control


def extract_section_info(prop_schema: Dict[str, Any], defs: Dict[str, Any]) -> Tuple[str, Any]:
    """
    Extract x-ui-section and x-ui-collapse from a property schema.
    
    Returns (section_name, collapse_state) where collapse_state is:
    - None: not collapsible
    - True: collapsible and collapsed by default
    - False: collapsible and expanded by default
    """
    section = "General"
    collapse = None
    
    # Check direct properties
    if "x-ui-section" in prop_schema:
        section = prop_schema["x-ui-section"]
    if "x-ui-collapse" in prop_schema:
        collapse = prop_schema["x-ui-collapse"]
    
    # Check in resolved $ref
    # BUT: Don't extract section from nested objects (with properties) since they handle their own internal grouping
    if "$ref" in prop_schema:
        resolved = resolve_ref(prop_schema["$ref"], defs)
        # Only extract section if this is NOT a nested object
        if "properties" not in resolved:
            if "x-ui-section" in resolved and section == "General":
                section = resolved["x-ui-section"]
            if "x-ui-collapse" in resolved and collapse is None:
                collapse = resolved["x-ui-collapse"]
    
    # Check in anyOf options
    # BUT: Don't extract section from nested objects (with properties) since they handle their own internal grouping
    if "anyOf" in prop_schema:
        for option in prop_schema["anyOf"]:
            if isinstance(option, dict) and option.get("type") != "null":
                if "$ref" in option:
                    resolved = resolve_ref(option["$ref"], defs)
                    # Only extract section if this is NOT a nested object
                    if "properties" not in resolved:
                        if "x-ui-section" in resolved and section == "General":
                            section = resolved["x-ui-section"]
                        if "x-ui-collapse" in resolved and collapse is None:
                            collapse = resolved["x-ui-collapse"]
                    break
    
    return section, collapse


def group_controls_by_section(controls_with_meta: list, model_help: str = None) -> list:
    """
    Group controls by x-ui-section and create Group layouts.
    
    Args:
        controls_with_meta: List of (control_dict, section_name, collapse_state, order) tuples
        model_help: Optional model-level help text to prepend to first section
    
    Returns:
        List of Group elements or flat Control elements if only one section
    """
    # Group controls by section with order
    sections = defaultdict(lambda: {"controls": [], "collapse": None, "min_order": 999})
    
    for control, section_name, collapse_state, order in controls_with_meta:
        sections[section_name]["controls"].append((control, order))
        # Track the minimum order value for section ordering
        if order < sections[section_name]["min_order"]:
            sections[section_name]["min_order"] = order
        # Use the first non-None collapse state found for this section
        if sections[section_name]["collapse"] is None and collapse_state is not None:
            sections[section_name]["collapse"] = collapse_state
    
    # If only one section and it's "General", return flat controls
    if len(sections) == 1 and "General" in sections:
        # Sort by order and extract just the controls (not the order values)
        sorted_controls = sorted(sections["General"]["controls"], key=lambda x: x[1])
        return [control for control, order in sorted_controls]
    
    # Create Group elements for each section
    elements = []
    # Sort sections by their minimum order value, then alphabetically
    section_names = sorted(sections.keys(), key=lambda name: (sections[name]["min_order"], name))
    
    for idx, section_name in enumerate(section_names):
        section_data = sections[section_name]
        section_elements = []
        
        # Add model-level help as a HelpButton in first section
        if idx == 0 and model_help:
            help_button = {
                "type": "HelpButton",
                "options": {
                    "helpText": model_help,
                    "helpTitle": "Help"
                }
            }
            section_elements.append(help_button)
        
        # Sort controls by order and add to section
        sorted_controls = sorted(section_data["controls"], key=lambda x: x[1])
        section_elements.extend([control for control, order in sorted_controls])
        
        group = {
            "type": "Group",
            "label": section_name,
            "elements": section_elements
        }
        
        # Add collapsible options if x-ui-collapse was specified
        if section_data["collapse"] is not None:
            group["options"] = {
                "collapsed": section_data["collapse"]
            }
        
        elements.append(group)
    
    return elements


def generate_detail_uischema(item_def: Dict[str, Any], defs: Dict[str, Any], source_class: str = None) -> list:
    """
    Generate UISchema elements for properties within an array item or nested object.
    
    Extracts x-* extensions, creates Control elements with proper options,
    and groups them by x-ui-section into Group layouts.
    
    If the item_def has x-help at root level, adds a collapsible Help section at the bottom.
    
    Args:
        item_def: Item definition with properties
        defs: Schema definitions
        source_class: Python class name for source tracking
    """
    if "properties" not in item_def:
        return []
    
    elements = []
    
    # Collect all controls with their section information
    controls_with_meta = []
    
    for prop_name, prop_schema in item_def["properties"].items():
        # Extract section information
        section_name, collapse_state = extract_section_info(prop_schema, defs)
        
        # Extract order (default to 999 if not specified)
        order = prop_schema.get("x-order", 999)
        
        # Extract options from the property
        options = {}
        rule = None
        
        # Check direct properties first
        for x_key, option_key in [
            ("x-help", "help"),
            ("description", "description"),
            ("x-unit", "unit"),
            ("x-ui-widget", "widget"),
            ("x-ui-widget-filter", "widgetFilter"),
            ("x-validation-hint", "validationHint")
        ]:
            if x_key in prop_schema:
                options[option_key] = prop_schema[x_key]
        
        if "x-ui-rules" in prop_schema:
            rule = prop_schema["x-ui-rules"]
        
        # For $ref, resolve and extract metadata
        if "$ref" in prop_schema:
            resolved = resolve_ref(prop_schema["$ref"], defs)
            # Extract order from resolved if not in prop_schema
            if order == 999 and "x-order" in resolved:
                order = resolved["x-order"]
            
            for x_key, option_key in [
                ("x-help", "help"),
                ("description", "description"),
                ("x-unit", "unit"),
                ("x-ui-widget", "widget"),
                ("x-ui-widget-filter", "widgetFilter"),
                ("x-validation-hint", "validationHint")
            ]:
                if x_key in resolved and option_key not in options:
                    options[option_key] = resolved[x_key]
            
            if "x-ui-rules" in resolved and rule is None:
                rule = resolved["x-ui-rules"]
        
        # For anyOf, check options for metadata
        if "anyOf" in prop_schema:
            for option_item in prop_schema["anyOf"]:
                if isinstance(option_item, dict) and option_item.get("type") != "null":
                    if "$ref" in option_item:
                        resolved = resolve_ref(option_item["$ref"], defs)
                        # Extract order from resolved if not set
                        if order == 999 and "x-order" in resolved:
                            order = resolved["x-order"]
                        
                        for x_key, option_key in [
                            ("x-help", "help"),
                            ("description", "description"),
                            ("x-unit", "unit"),
                            ("x-ui-widget", "widget"),
                            ("x-ui-widget-filter", "widgetFilter"),
                            ("x-validation-hint", "validationHint")
                        ]:
                            if x_key in resolved and option_key not in options:
                                options[option_key] = resolved[x_key]
                        
                        if "x-ui-rules" in resolved and rule is None:
                            rule = resolved["x-ui-rules"]
                        break
        
        control = {
            "type": "Control",
            "scope": f"#/properties/{prop_name}",
            "options": options if options else {}
        }
        
        # Add source location for debugging
        if source_class:
            control["options"]["x-source"] = f"{source_class}.{prop_name}"
        
        # Add rule if present
        if rule:
            control["rule"] = rule
        
        controls_with_meta.append((control, section_name, collapse_state, order))
    
    # Extract model-level help if present
    model_help = item_def.get("x-help")
    
    # Group controls by section and create Group layouts, passing model help
    grouped_controls = group_controls_by_section(controls_with_meta, model_help)
    elements.extend(grouped_controls)
    
    return elements


def validate_uischema(uischema: Dict[str, Any]) -> None:
    """
    Validate the generated UISchema using TypeScript type checking.
    
    This validates against JSONForms' official TypeScript type definitions,
    ensuring type safety and automatic sync with JSONForms updates.
    
    Prerequisites: Run 'source activate.sh' before running this script
    Uses: npm run validate-uischema (tsc --noEmit validate-uischema.ts)
    
    Args:
        uischema: The generated UISchema (already written to file)
        
    Raises:
        RuntimeError: If TypeScript validation fails
    """
    gui_poc_dir = Path(__file__).parent / "config-gui-poc"
    
    try:
        # Run TypeScript validation
        result = subprocess.run(
            ["npm", "run", "validate-uischema"],
            cwd=gui_poc_dir,
            capture_output=True,
            text=True,
            timeout=30
        )
        
        if result.returncode == 0:
            if not QUIET:
                print("✅ UISchema TypeScript validation passed")
        else:
            print("\n❌ UISchema TypeScript Validation Failed:")
            print(result.stdout)
            if result.stderr:
                print(result.stderr)
            sys.exit(1)
            
    except subprocess.TimeoutExpired:
        print("⚠️  TypeScript validation timed out")
        sys.exit(1)
    except FileNotFoundError:
        print("⚠️  npm not found - did you run 'source activate.sh'?")
        print("   Run: source activate.sh && python generate_uischema.py")
        sys.exit(1)


def main():
    """Generate UISchema and JSON Schema from ConfigurationV0 root model."""
    # Import root configuration model
    sys.path.insert(0, str(Path(__file__).parent))
    from config.versions.v0 import ConfigurationV0
    
    if not QUIET:
        print("Generating schema from ConfigurationV0...")
    
    # Generate JSON Schema from root model
    schema = ConfigurationV0.model_json_schema(mode='serialization')
    
    # Replace FlexValue references with string type
    schema = replace_flexvalue_refs(schema)
    
    # Flatten Optional-style anyOf to prevent ANYOF tabs in JSONForms
    schema = flatten_optional_anyof(schema)
    
    # Get properties and definitions
    properties = schema.get("properties", {})
    defs = schema.get("$defs", {})
    
    if not QUIET:
        print(f"Found {len(properties)} root properties")
        print(f"Found {len(defs)} definitions")
    
    # Validate entity picker widgets have filters defined
    if not QUIET:
        print("\nValidating entity picker widgets...")
    validate_entity_picker_filters(schema, defs)
    if not QUIET:
        print("✅ All entity picker widgets have filters")
    
    # Group properties by x-ui-group
    # Structure: {group_name: [(order, prop_name, prop_schema)]}
    groups = defaultdict(list)
    
    for prop_name, prop_schema in properties.items():
        # Skip const fields (non-configurable like config_version)
        if "const" in prop_schema:
            continue
        
        # Extract source class name from $ref if present
        source_class = None
        if "$ref" in prop_schema:
            ref_name = prop_schema["$ref"].split("/")[-1]
            ref_def = defs.get(ref_name, {})
            source_class = ref_def.get("title", ref_name)
        
        group, order = extract_x_ui_group_from_property(prop_schema, defs)
        groups[group].append((order, prop_name, prop_schema, source_class))
        if not QUIET:
            print(f"  {prop_name} -> {group} (order: {order})")
    
    # Generate UISchema with Categorization (tabs)
    # Define fixed order for predefined tabs
    FIXED_TAB_ORDER = ["General", "Energy", "Devices"]
    
    categories = []
    
    # First, add predefined tabs in fixed order (if they exist)
    for group_name in FIXED_TAB_ORDER:
        if group_name in groups:
            props_list = groups[group_name]
            # Sort properties within group by order
            props_list.sort(key=lambda x: x[0])
            
            # Collect controls with their section information
            controls_with_meta = []
            for order, prop_name, prop_schema, source_class in props_list:
                section_name, collapse_state = extract_section_info(prop_schema, defs)
                element = generate_uischema_for_property(prop_name, prop_schema, defs, source_class)
                # Handle both single elements and lists (arrays with help text return [HelpButton, Control])
                if isinstance(element, list):
                    for elem in element:
                        controls_with_meta.append((elem, section_name, collapse_state, order))
                else:
                    controls_with_meta.append((element, section_name, collapse_state, order))
            
            # Group controls by section and create Group layouts
            group_elements = group_controls_by_section(controls_with_meta)
            
            categories.append({
                "type": "Category",
                "label": group_name,
                "elements": group_elements
            })
    
    # Then, add remaining groups in sorted order
    remaining_groups = sorted(set(groups.keys()) - set(FIXED_TAB_ORDER))
    for group_name in remaining_groups:
        props_list = groups[group_name]
        # Sort properties within group by order
        props_list.sort(key=lambda x: x[0])
        
        # Collect controls with their section information
        controls_with_meta = []
        for order, prop_name, prop_schema, source_class in props_list:
            section_name, collapse_state = extract_section_info(prop_schema, defs)
            element = generate_uischema_for_property(prop_name, prop_schema, defs, source_class)
            # Handle both single elements and lists (arrays with help text return [HelpButton, Control])
            if isinstance(element, list):
                for elem in element:
                    controls_with_meta.append((elem, section_name, collapse_state, order))
            else:
                controls_with_meta.append((element, section_name, collapse_state, order))
        
        # Group controls by section and create Group layouts
        group_elements = group_controls_by_section(controls_with_meta)
        
        categories.append({
            "type": "Category",
            "label": group_name,
            "elements": group_elements
        })
    
    combined_uischema = {
        "type": "Categorization",
        "elements": categories
    }
    
    # Write UISchema first
    uischema_file = Path(__file__).parent / "config-gui-poc" / "public" / "uischema.json"
    uischema_file.parent.mkdir(parents=True, exist_ok=True)
    
    with open(uischema_file, "w") as f:
        json.dump(combined_uischema, f, indent=2)
    
    # Now validate the written file with TypeScript
    if not QUIET:
        print("\nValidating UISchema...")
    validate_uischema(combined_uischema)
    
    # Write JSON Schema
    schema_file = Path(__file__).parent / "config-gui-poc" / "public" / "schema.json"
    
    with open(schema_file, "w") as f:
        json.dump(schema, f, indent=2)
    
    if not QUIET:
        print(f"\n✅ Generated UISchema: {uischema_file}")
        print(f"✅ Generated JSON Schema: {schema_file}")
        print(f"   Properties: {len(properties)}")
        print(f"   Definitions: {len(defs)}")
        print(f"   Tabs created: {', '.join([cat['label'] for cat in categories])}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Generate UISchema and JSON Schema from Pydantic models"
    )
    parser.add_argument(
        "-q", "--quiet",
        action="store_true",
        help="Suppress non-error output"
    )
    args = parser.parse_args()
    
    QUIET = args.quiet
    main()
