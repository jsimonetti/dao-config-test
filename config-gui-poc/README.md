# Config GUI PoC - Pydantic to UISchema

Clean proof-of-concept demonstrating UISchema generation from Pydantic models with embedded UI metadata.

## Architecture

```
Pydantic Models (Python)
  └─> generate_uischema.py
       └─> uischema.json (generated)
            └─> React App (JSONForms)
```

## Quick Start

### 1. Generate UISchema from Pydantic models

```bash
cd /Users/jeroens/dev/simonetti/config
source .venv/bin/activate
python generate_uischema.py
```

This extracts UI metadata from your Pydantic models and generates `config-gui-poc/public/uischema.json`.

### 2. Install frontend dependencies

```bash
cd config-gui-poc
npm install
```

### 3. Start dev server

```bash
npm run dev
```

Open http://localhost:5173

## What This PoC Demonstrates

✅ **Single source of truth**: All UI metadata lives in Pydantic `Field(json_schema_extra={...})`
✅ **Automatic grouping**: `x-ui-group` and `x-ui-section` organize forms
✅ **Ordering**: `x-ui-order` controls field display sequence
✅ **Help text**: `x-help` provides contextual guidance
✅ **Units**: `x-unit` displays measurement units
✅ **Validation hints**: `x-validation-hint` shows constraints

## Current Models in PoC

- **GridConfig**: Maximum grid power configuration
- **PricingConfig**: Day-ahead pricing and tariff configuration

## Next Steps

1. Add more models to the generator
2. Implement custom renderers for FlexValue and SecretStr
3. Add rules and conditional visibility
4. Integrate with backend API
