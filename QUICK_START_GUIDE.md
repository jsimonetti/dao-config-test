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
| `x-help` | `str` | Help text for the field (tooltip) | `"Database engine where Home Assistant stores history"` |
| `x-unit` | `str` | Display unit for fields. Also used for entity filtering. | `"Wh"`, `"€/kWh"`, `"%"`, `"W"` |
| `x-ui-widget` | `str` | Custom widget type for rendering | `"entity-picker"`, `"entity-picker-or-number"`, `"entity-picker-or-boolean"` |
| `x-ui-widget-filter` | `str` | Home Assistant entity domain filter (**required** for entity pickers). Comma-separated for multiple domains. | `"sensor"`, `"sensor,input_number"`, `"switch"` |
| `x-ui-section` | `str` | Group fields into collapsible sections within a tab | `"Connection Settings"`, `"Database Config"` |
| `x-ui-collapse` | `bool` | Whether section is collapsed by default | `true` (collapsed), `false` (expanded) |
| `x-ui-rules` | `dict` | Conditional visibility rules (JSONForms rule format). **Must be a dict, not a list**. | `{"effect": "SHOW", "condition": {"scope": "#/properties/field", "schema": {...}}}` |
| `x-validation-hint` | `str` | Additional validation guidance text | `"Required for mysql/postgresql engines"` |
| `x-order` | `int` | Sort order within section (also used for section ordering) | `1`, `10`, `100` |

**Note on `x-order`**: This field serves two purposes:
- **Within a section**: Fields are sorted by their `x-order` value (lower values appear first)
- **Section ordering**: Sections are ordered by the minimum `x-order` value found in that section, then alphabetically
  - Example: Section "B" with fields having `x-order: 10, 20` appears before Section "A" with `x-order: 100`
  - This allows logical ordering without renaming sections

### Model-Level Extensions

Add these to your model's `model_config.json_schema_extra` dictionary:

| Extension | Type | Description | Example |
|-----------|------|-------------|---------|
| `x-help` | `str` | Model-level help text (markdown, appears as collapsible panel) | `"# Database Config\n\nComplete guide..."` |
| `x-ui-group` | `str` | Tab name for this model's properties | `"Integration"`, `"Energy"`, `"Devices"` |
| `x-order` | `int` | Sort order within tab | `10`, `20`, `30` |
| `x-docs-url` | `str` | External documentation URL (adds link to help panel) | `"https://github.com/.../wiki"` |

### Fixed Tab Order

The generator uses predefined tab ordering:
1. **General** (displayed first)
2. **Energy** (displayed second)
3. **Devices** (displayed third)
4. All other tabs (sorted alphabetically)

Define tabs using `x-ui-group` on your model's `model_config.json_schema_extra`.

### Entity Picker Features

**Entity pickers integrate with Home Assistant to provide live entity selection**:

- **Live entity loading**: Fetches entities from Home Assistant when dropdown opens
- **Domain filtering**: Filter by entity domain using `x-ui-widget-filter` (e.g., `"sensor,input_number"`)
- **Unit filtering**: Automatically filters by `unit_of_measurement` when `x-unit` is specified
- **Smart caching**: 5-minute cache to minimize API calls
- **Manual entry**: Users can type entity IDs directly if needed (freeSolo mode)
- **Entity display**: Shows `entity_id - friendly_name (state unit)` format
- **Domain grouping**: Entities organized by domain in dropdown
- **Error handling**: Graceful fallback when Home Assistant is unreachable

**FlexValue fields**: Fields with union types (e.g., `int | str`) use toggle buttons to switch between number and entity modes. Entity IDs are saved as plain strings compatible with Pydantic's FlexValue pattern.

**Configuration**: Entity pickers require Home Assistant connection details (host, port, token) to be configured in the application. The backend API proxies requests to Home Assistant to avoid CORS issues.

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

The config GUI uses custom renderers to handle complex field types. All renderers are fully implemented and functional.

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
| **EntityPickerRenderer** | `entity-picker` | Live Home Assistant entity picker with domain/unit filtering, caching, and manual entry fallback. |
| **EntityPickerOrNumberRenderer** | `entity-picker-or-number` | Toggle between number input and entity picker for FlexValue fields. Saves plain strings for entities. |
| **EntityPickerOrBooleanRenderer** | `entity-picker-or-boolean` | Toggle between boolean toggles and entity picker for boolean or entity fields. |

### Renderer Priority

Renderers are checked in order of registration (see `src/components/renderers/index.ts`):
1. HelpButton (rank 10) - custom UISchema element
2. MarkdownLabel (rank 5) - override default Label renderer
3. EntityPickerOrNumber (rank 15) - FlexValue fields with number or entity
4. EntityPickerOrBoolean (rank 15) - Boolean or entity fields
5. EntityPicker (rank 15) - Single entity fields with live HA integration
6. OptionalString - nullable strings
7. BoolOrString - boolean/string anyOf
8. DateDict - date object fields
9. Enum - enum/Literal fields
10. Number - numeric fields
11. String - string fields
12. Material renderers (default fallback)

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
│   │   │       ├── EntityPickerRenderer.tsx
│   │   │       ├── EntityPickerOrBooleanRenderer.tsx
│   │   │       ├── EntityPickerOrNumberRenderer.tsx
│   │   │       ├── BoolOrStringRenderer.tsx
│   │   │       ├── OptionalStringRenderer.tsx
│   │   │       ├── DateDictRenderer.tsx
│   │   │       ├── EnumRenderer.tsx
│   │   │       ├── NumberRenderer.tsx
│   │   │       ├── StringRenderer.tsx
│   │   │       └── index.ts  # Renderer registration
│   │   ├── services/
│   │   │   └── homeassistant.ts  # HA API integration
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
            "x-ui-widget-filter": "sensor",  # Required! Filters dropdown to sensors only
            "x-unit": "°C",  # Optional: Further filters to temperature sensors with °C unit
            "x-ui-section": "Sensors"
        }
    )
    
    max_power: int | str = Field(
        description="Maximum power limit",
        json_schema_extra={
            "x-help": "Enter a number in watts or select a Home Assistant entity.",
            "x-ui-widget": "entity-picker-or-number",
            "x-ui-widget-filter": "sensor,input_number",  # Multiple domains supported
            "x-unit": "W",  # Shows unit label and filters entities by watt sensors
            "x-ui-section": "Power Configuration"
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
            'x-docs-url': 'https://github.com/user/repo/wiki/Integration'  # External docs link in help panel
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

### 5. Validate Entity Picker Configuration

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

### Completed Features ✅
- [x] Schema generation with TypeScript validation
- [x] Tab ordering and organization
- [x] Section grouping with collapsible sections
- [x] Model-level help display with markdown
- [x] Field-level help tooltips
- [x] Custom renderers for all field types
- [x] Entity picker with live Home Assistant integration
- [x] Domain and unit-based entity filtering
- [x] FlexValue renderers (number/entity, boolean/entity toggles)
- [x] Entity caching and error handling
- [x] Secrets management UI
- [x] Visual polish and user experience refinements
- [x] Entity list picker (multi-select with chips)

### Future Enhancements
- [ ] Backend API proxy for Home Assistant integration
- [ ] Configuration validation preview
- [ ] Import/export configurations
- [ ] Real-time entity state preview
- [ ] Form-wide validation feedback
- [ ] Configuration diff viewer

---

## Resources

- **JSONForms Documentation**: https://jsonforms.io/
- **Material-UI Components**: https://mui.com/
- **Pydantic Documentation**: https://docs.pydantic.dev/
- **JSON Schema Spec**: https://json-schema.org/

---

**Questions?** Check the existing model files in `config/models/` for examples!


