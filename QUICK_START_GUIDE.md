# Day Ahead Optimizer - Config GUI Development Guide

**Complete reference for developing Pydantic models and the configuration GUI**

---

## Table of Contents

1. [Environment Setup](#step-0-activate-virtual-environments)
2. [Supported x- Extensions](#supported-x--metadata-extensions)
3. [Model Validation](#model-validation)
4. [Custom Renderers](#custom-renderers)
5. [Development Workflow](#development-workflow)
6. [Project Structure](#project-structure)

---

## Step 0: Activate Virtual Environments

**IMPORTANT**: Always activate both virtual environments before working on this project!

```bash
# Navigate to project root
cd /Users/jeroens/dev/simonetti/config

# Activate Python virtual environment
source .venv/bin/activate

# Activate Node.js virtual environment
source .nodeenv/bin/activate

# Verify installations
node --version   # Should show Node.js version
npm --version    # Should show npm version
python --version # Should show Python version
```

**Remember**: Run these activation commands in every new terminal session!

---

## Supported x- Metadata Extensions

The `generate_uischema.py` script extracts custom metadata from Pydantic models to enhance the UI. Add these to your Field's `json_schema_extra` dictionary:

### Field-Level Extensions

| Extension | Type | Description | Example |
|-----------|------|-------------|---------|
| `x-help` | `str` | Help text for the field (supports markdown) | `"Database engine where Home Assistant stores history"` |
| `x-unit` | `str` | Display unit for numeric fields | `"Wh"`, `"€/kWh"`, `"port"` |
| `x-ui-widget` | `str` | Custom widget type for rendering | `"entity-picker"`, `"entity-list-picker"`, `"entity-picker-or-boolean"` |
| `x-ui-widget-filter` | `str` | Home Assistant entity domain filter (**required** for entity pickers) | `"sensor"`, `"switch"`, `"binary_sensor"` |
| `x-ui-section` | `str` | Group fields into collapsible sections within a tab | `"Connection Settings"`, `"Database Config"` |
| `x-ui-collapse` | `bool` | Whether section is collapsed by default | `true` (collapsed), `false` (expanded) |
| `x-ui-rules` | `dict` | Conditional visibility rules (JSONForms rule format). **Must be a dict, not a list**. | `{"effect": "SHOW", "condition": {"scope": "#/properties/field", "schema": {...}}}` |
| `x-validation-hint` | `str` | Additional validation guidance text | `"Required for mysql/postgresql engines"` |
| `x-order` | `int` | Sort order within section (also used for section ordering) | `1`, `10`, `100` |

**Note on `x-order`**: This field serves two purposes:
- **Within a section**: Fields are sorted by their `x-order` value (lower values appear first)
- **Section ordering**: Sections are ordered by the minimum `x-order` value found in that section, then alphabetically
  - Example: Section "A" with fields having `x-order: 10, 20` appears before Section "B" with `x-order: 100`
  - This allows logical ordering without renaming sections

### Model-Level Extensions

Add these to your model's `model_config.json_schema_extra` dictionary:

| Extension | Type | Description | Example |
|-----------|------|-------------|---------|
| `x-help` | `str` | Model-level help text (markdown, appears as collapsible panel) | `"# Database Config\n\nComplete guide..."` |
| `x-ui-group` | `str` | Tab name for this model's properties | `"Integration"`, `"Energy"`, `"Devices"` |
| `x-order` | `int` | Sort order within tab | `10`, `20`, `30` |
| `x-icon` | `str` | Icon identifier for the tab (future use) | `"database"`, `"solar"` |
| `x-docs-url` | `str` | External documentation URL (future use) | `"https://github.com/.../wiki"` |

### Fixed Tab Order

The generator uses predefined tab ordering:
1. **General** (displayed first)
2. **Energy** (displayed second)
3. **Devices** (displayed third)
4. All other tabs (sorted alphabetically)

Define tabs using `x-ui-group` on your model's `model_config.json_schema_extra`.

### Entity Picker Validation

**CRITICAL**: All entity picker widgets MUST have `x-ui-widget-filter` defined, or schema generation will fail.

```python
# ✅ Correct
entity_id: str = Field(
    description="Entity ID",
    json_schema_extra={
        "x-ui-widget": "entity-picker",
        "x-ui-widget-filter": "sensor"  # Required!
    }
)

# ❌ Incorrect - will raise ValueError
entity_id: str = Field(
    description="Entity ID",
    json_schema_extra={
        "x-ui-widget": "entity-picker"
        # Missing x-ui-widget-filter!
    }
)
```

---

## Model Validation

The Pydantic models use multiple validation approaches:

### 1. Pydantic Field Validators

Built-in Pydantic constraints:
- `ge`, `le`, `gt`, `lt`: Numeric range constraints
- `min_length`, `max_length`: String length constraints
- `pattern`: Regex pattern matching

```python
port: int = Field(
    ge=1, le=65535,
    description="Port number"
)
```

### 2. JSON Schema Conditionals

Use `if`/`then`/`else` in `model_config.json_schema_extra` for conditional requirements:

```python
model_config = ConfigDict(
    json_schema_extra={
        "if": {
            "properties": {"engine": {"enum": ["mysql", "postgresql"]}}
        },
        "then": {
            "required": ["server", "port", "username"]
        }
    }
)
```

### 3. Custom Model Validators

Use `@model_validator` for complex cross-field validation:

```python
@model_validator(mode='after')
def validate_engine_requirements(self) -> 'DatabaseConfig':
    """Validate engine-specific requirements."""
    if self.engine in ('mysql', 'postgresql'):
        if not self.server:
            raise ValueError("'server' is required for mysql/postgresql")
    return self
```

### 4. Generic JSON Schema Validator

Use the `jsonschema` library to automatically validate JSON Schema conditionals:

```python
@model_validator(mode='after')
def validate_conditional_requirements(self) -> 'HADatabaseConfig':
    """Generic validator that enforces JSON Schema conditionals."""
    schema = self.model_json_schema()
    instance = self.model_dump(exclude_none=True)
    
    try:
        jsonschema.validate(instance=instance, schema=schema)
    except jsonschema.ValidationError as e:
        field_path = '.'.join(str(p) for p in e.path) if e.path else 'root'
        raise ValueError(f"Validation failed at {field_path}: {e.message}")
    
    return self
```

**Benefit**: Validation logic stays in sync with JSON Schema conditionals automatically.

---

## Custom Renderers

The config GUI uses custom renderers to handle complex field types. Here's what's implemented:

### Completed Renderers

| Renderer | Widget Type | Description |
|----------|-------------|-------------|
| **HelpButtonRenderer** | `HelpButton` (UISchema element) | Renders collapsible inline help panels with markdown support. Triggered by model-level `x-help`. |
| **MarkdownLabelRenderer** | `Label` (UISchema element) | Renders Label elements with full markdown formatting (headings, lists, code, links). |
| **BoolOrStringRenderer** | N/A (anyOf boolean/string) | Toggle between boolean and string input for optional string fields. |
| **OptionalStringRenderer** | N/A (nullable string) | Text input for optional string fields with proper null handling. |
| **DateDictRenderer** | N/A (DateDict object) | Date picker for dictionary objects with year/month/day keys. |
| **EnumRenderer** | N/A (enum) | Dropdown for enum/Literal fields with proper typing. |
| **NumberRenderer** | N/A (number) | Numeric input with validation, units display, and help text. |
| **StringRenderer** | N/A (string) | Text input with validation hints and help text. |

### TODO: Incomplete Renderers

| Renderer | Widget Type | Status | Description |
|----------|-------------|--------|-------------|
| **EntityPickerRenderer** | `entity-picker` (⚠️ TODO - text input) | ⚠️ TODO | Placeholder text field. Needs implementation: dropdown with HA entity filtering by domain specified in `x-ui-widget-filter`. |
| **EntityListPickerRenderer** | `entity-list-picker` (⚠️ TODO - text input) | ⚠️ TODO | Comma-separated text field. Needs implementation: multi-select dropdown with chips, filtered by `x-ui-widget-filter` domain. |
| **EntityPickerOrBooleanRenderer** | `entity-picker-or-boolean` (⚠️ TODO - text toggle) | ⚠️ TODO | Toggle between boolean checkbox and text field. Needs implementation: use proper entity picker dropdown when in entity mode. |
| **EntityPickerOrNumberRenderer** | `entity-picker-or-number` (⚠️ TODO - text toggle) | ⚠️ TODO | Toggle between numeric input and text field. Needs implementation: use proper entity picker dropdown when in entity mode. Handles FlexValue fields. |

### Renderer Priority

Renderers are checked in order of registration (see `src/components/renderers/index.ts`):
1. HelpButton (rank 10) - custom UISchema element
2. MarkdownLabel (rank 5) - override default Label renderer
3. EntityPickerOrNumber - FlexValue fields (⚠️ TODO - currently placeholder)
4. EntityPicker - single entity fields (⚠️ TODO - currently placeholder)
5. EntityListPicker - multiple entity fields (⚠️ TODO - currently placeholder)
6. EntityPickerOrBoolean - boolean or entity fields (⚠️ TODO - currently placeholder)
7. OptionalString - nullable strings
8. BoolOrString - boolean/string anyOf
9. DateDict - date object fields
10. Enum - enum/Literal fields
11. Number - numeric fields
12. String - string fields
13. Material renderers (default fallback)

---

## Development Workflow

### Modifying Pydantic Models

1. **Edit model** in `config/models/*.py`
2. **Add x- extensions** to `Field(..., json_schema_extra={...})`
3. **Add model-level help** to `model_config.json_schema_extra['x-help']`
4. **Regenerate schemas**: 
   ```bash
   cd /Users/jeroens/dev/simonetti/config
   source activate.sh  # Required: activates Python + Node environments
   python ./generate_uischema.py
   ```
   
   **Automatic validation**: The generator automatically validates the UISchema against JSONForms' TypeScript type definitions. This catches errors like:
   - Invalid rule format (e.g., using list instead of dict)
   - Missing required properties
   - Invalid element types
   - Any structural issues
   
   The validation uses JSONForms' official types, so it stays in sync with library updates automatically.

5. **Test in GUI**:
   ```bash
   cd config-gui-poc
   npm run dev
   ```

### Adding New Custom Renderers

1. **Create renderer** in `config-gui-poc/src/components/renderers/NewRenderer.tsx`
2. **Export renderer and tester** from the file
3. **Register in index.ts**:
   ```typescript
   import NewRenderer, { newTester } from './NewRenderer'
   
   export const customRenderers = [
     { tester: newTester, renderer: NewRenderer },
     // ... existing renderers
   ]
   ```
4. **Test with sample data** that matches your tester condition

### Schema Generation Flow

```
Pydantic Models (config/models/*.py)
         ↓
  ConfigurationV0 root model (config/versions/v0.py)
         ↓
  generate_uischema.py
         ↓
    ┌─────────┴─────────┐
    ↓                    ↓
schema.json        uischema.json
    |                    |
    |                    ↓
    |          TypeScript Validation
    |          (JSONForms types)
    |                    |
    └──────────┬─────────┘
               ↓
    config-gui-poc/public/
         ↓
   React App (JSONForms)
         ↓
  Custom Renderers
```

**Validation**: UISchema is automatically validated against JSONForms' TypeScript type definitions during generation. This ensures type safety and catches structural errors early.

---

## Project Structure

```
config/
├── config/
│   ├── models/           # Pydantic model definitions
│   │   ├── database.py   # Database configs (HADatabaseConfig, DatabaseConfig)
│   │   ├── energy.py     # Energy-related configs
│   │   └── ...
│   └── versions/
│       └── v0.py         # ConfigurationV0 root model
├── generate_uischema.py  # Schema/UISchema generator (includes validation)
├── activate.sh           # Environment activation (Python + Node.js)
├── config-gui-poc/
│   ├── public/
│   │   ├── schema.json     # Generated JSON Schema
│   │   └── uischema.json   # Generated UISchema
│   ├── validate-uischema.ts      # TypeScript validator
│   ├── tsconfig.validate.json    # TypeScript config for validation
│   ├── src/
│   │   ├── components/
│   │   │   └── renderers/  # Custom field renderers
│   │   │       ├── HelpButtonRenderer.tsx
│   │   │       ├── MarkdownLabelRenderer.tsx
│   │   │       ├── EntityPickerRenderer.tsx  # ⚠️ TODO
│   │   │       ├── EntityListPickerRenderer.tsx  # ⚠️ TODO
│   │   │       ├── EntityPickerOrBooleanRenderer.tsx  # ⚠️ TODO
│   │   │       ├── EntityPickerOrNumberRenderer.tsx
│   │   │       └── index.ts  # Renderer registration
│   │   └── App.tsx
│   └── package.json
└── QUICK_START_GUIDE.md  # This file
```

---

## Example: Complete Field Definition

Here's a complete example showing all supported x- extensions:

```python
from pydantic import BaseModel, Field, ConfigDict

class DatabaseConfig(BaseModel):
    """Database configuration."""
    
    engine: Literal['sqlite', 'mysql'] = Field(
        default="sqlite",
        description="Database engine type",
        json_schema_extra={
            "x-help": "**SQLite** for local setups, **MySQL** for networked.",
            "x-ui-section": "Connection Settings",
            "x-ui-collapse": False  # Expanded by default
        }
    )
    
    server: Optional[str] = Field(
        default=None,
        description="Database server hostname",
        json_schema_extra={
            "x-help": "Hostname or IP address. Required for MySQL.",
            "x-ui-section": "Connection Settings",
            "x-validation-hint": "Required for MySQL engine",
            "x-ui-rules": {
                "effect": "SHOW",
                "condition": {
                    "scope": "#/properties/engine",
                    "schema": {"enum": ["mysql"]}
                }
            }
        }
    )
    
    port: Optional[int] = Field(
        default=None,
        ge=1, le=65535,
        description="Database port",
        json_schema_extra={
            "x-help": "Default: 3306 for MySQL.",
            "x-unit": "port",
            "x-ui-section": "Connection Settings",
            "x-validation-hint": "1-65535",
            "x-ui-rules": {
                "effect": "SHOW",
                "condition": {
                    "scope": "#/properties/engine",
                    "schema": {"enum": ["mysql"]}
                }
            }
        }
    )
    
    sensor_entity: str = Field(
        description="Temperature sensor entity",
        json_schema_extra={
            "x-help": "Select a temperature sensor from Home Assistant.",
            "x-ui-widget": "entity-picker",
            "x-ui-widget-filter": "sensor",  # Required!
            "x-ui-section": "Sensors"
        }
    )
    
    model_config = ConfigDict(
        extra='allow',
        json_schema_extra={
            'x-help': '''# Database Configuration

Complete guide for database setup.

## Engine Options

### SQLite
- Simple, no server needed
- Best for single HA instance

### MySQL
- Requires server setup
- Multi-user support
''',
            'x-ui-group': 'Integration',  # Tab name
            'x-order': 10,                # Tab sort order
            'x-icon': 'database',         # Tab icon (future)
            'x-docs-url': 'https://...'   # External docs (future)
        }
    )
```

---

## Tips for Model Developers

### 1. Use Model-Level Help for Complex Configs

Add comprehensive markdown documentation to `model_config.json_schema_extra['x-help']`:

```python
model_config = ConfigDict(
    json_schema_extra={
        'x-help': '''# Configuration Guide

Full markdown documentation here with:
- Headings
- Lists
- Code blocks
- **Bold** and *italic*
'''
    }
)
```

This appears as a collapsible help panel in the GUI.

### 2. Group Related Fields

Use `x-ui-section` to group related fields:

```python
# Connection fields
server: str = Field(..., json_schema_extra={"x-ui-section": "Connection"})
port: int = Field(..., json_schema_extra={"x-ui-section": "Connection"})

# Credentials fields
username: str = Field(..., json_schema_extra={"x-ui-section": "Credentials"})
password: str = Field(..., json_schema_extra={"x-ui-section": "Credentials"})
```

Sections appear as collapsible groups within tabs.

### 3. Use Conditional Visibility

Hide fields until relevant using `x-ui-rules`:

```python
server: Optional[str] = Field(
    default=None,
    json_schema_extra={
        "x-ui-rules": {
            "effect": "SHOW",
            "condition": {
                "scope": "#/properties/engine",
                "schema": {"enum": ["mysql", "postgresql"]}
            }
        }
    }
)
```

The `server` field only appears when `engine` is mysql or postgresql.

**⚠️ Important**: `x-ui-rules` must be a **dict/object**, not a list/array!

**❌ Wrong** (will cause runtime error):
```python
"x-ui-rules": [
    {
        "effect": "SHOW",
        "condition": {...}
    }
]
```

**✅ Correct**:
```python
"x-ui-rules": {
    "effect": "SHOW",
    "condition": {
        "scope": "#/properties/field_name",
        "schema": {"const": "value"}
    }
}
```

**Common patterns**:

Show field when another field equals a value:
```python
"x-ui-rules": {
    "effect": "SHOW",
    "condition": {
        "scope": "#/properties/source",
        "schema": {"const": "entsoe"}
    }
}
```

Show field when another field is one of several values:
```python
"x-ui-rules": {
    "effect": "SHOW",
    "condition": {
        "scope": "#/properties/engine",
        "schema": {"enum": ["mysql", "postgresql"]}
    }
}
```

Hide field when another field equals a value (using "not"):
```python
"x-ui-rules": {
    "effect": "SHOW",
    "condition": {
        "scope": "#/properties/source",
        "schema": {
            "not": {"const": "sqlite"}
        }
    }
}
```

**Validation**: The schema generator will now catch invalid `x-ui-rules` formats and report clear errors.

### 4. Always Add Help Text

Use `x-help` for every field to guide users:

```python
field: str = Field(
    description="Short description",  # Shown in form
    json_schema_extra={
        "x-help": "Longer explanation with examples and tips."  # Shown in tooltip/help
    }
)
```

### 5. Validate Entity Picker Filters

Before committing, run the generator to validate:

```bash
source activate.sh  # Required for TypeScript validation
python ./generate_uischema.py
```

**Validation checks**:
- Entity picker widgets have `x-ui-widget-filter` defined
- UISchema structure matches JSONForms TypeScript types
- Rules are properly formatted (dict, not list)
- All required properties are present

If any entity picker is missing `x-ui-widget-filter`, you'll see:

```
❌ Entity picker widgets missing x-ui-widget-filter:
  - sensor_entity -> SensorConfig (widget: entity-picker)
```

If the UISchema has structural errors, TypeScript validation will fail:

```
❌ UISchema TypeScript Validation Failed:
   validate-uischema.ts(13,5): error TS2322: Type 'string[]' is not assignable to type 'Rule'.
```

### 6. Test Nested Objects

Nested objects (models used as Field types) handle their own sectioning:

```python
class DatabaseConfig(BaseModel):
    # ... fields with x-ui-section: "Database Config"
    pass

class Configuration(BaseModel):
    database: DatabaseConfig = Field(
        json_schema_extra={
            # Don't set x-ui-section here - DatabaseConfig handles it internally
        }
    )
```

The generator prevents double-nesting of sections.

---

## Troubleshooting

### Schema Generation Fails

**Error**: `Entity picker widgets missing x-ui-widget-filter`

**Solution**: Add `x-ui-widget-filter` to all fields with `x-ui-widget: "entity-picker"`:

```python
json_schema_extra={
    "x-ui-widget": "entity-picker",
    "x-ui-widget-filter": "sensor"  # Add this!
}
```

### Field Not Showing in GUI

1. **Check x-ui-group**: Field needs a tab assignment (defaults to "General")
2. **Check x-ui-rules**: Field might be hidden by conditional rule
3. **Check required vs optional**: Optional fields show when parent object is created

### Validation Not Working

1. **Pydantic validators**: Only run when model is instantiated
2. **JSON Schema conditionals**: Enforced by jsonschema library validator
3. **Frontend validation**: JSONForms validates against JSON Schema, not Pydantic constraints

### Help Text Not Rendering Markdown

- Model-level help (`x-help` in `model_config`) renders as markdown in collapsible panel
- Field-level help (`x-help` in `json_schema_extra`) currently renders as plain text in tooltips
- Use MarkdownLabelRenderer for standalone markdown labels

---

## Next Steps

### Phase 1: Basic GUI ✅ Complete
- [x] Schema generation
- [x] Tab ordering
- [x] Section grouping
- [x] Collapsible sections
- [x] Model-level help display
- [x] Markdown rendering

### Phase 2: Entity Pickers ⚠️ In Progress
- [ ] EntityPickerRenderer implementation
- [ ] EntityListPickerRenderer implementation
- [ ] EntityPickerOrBooleanRenderer implementation
- [ ] Home Assistant API integration
- [ ] Entity domain filtering

### Phase 3: Advanced Features
- [ ] Secrets manager integration
- [ ] Configuration validation preview
- [ ] Import/export configurations
- [ ] Field-level markdown help (tooltips)
- [ ] Real-time entity state preview

---

## Resources

- **JSONForms Documentation**: https://jsonforms.io/
- **Material-UI Components**: https://mui.com/
- **Pydantic Documentation**: https://docs.pydantic.dev/
- **JSON Schema Spec**: https://json-schema.org/

---

**Questions?** Check the existing model files in `config/models/` for examples!


