import React, { useState } from 'react'
import {
  ControlProps,
  rankWith,
} from '@jsonforms/core'
import { withJsonFormsControlProps } from '@jsonforms/react'
import {
  Box,
  ToggleButton,
  ToggleButtonGroup,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Typography,
} from '@mui/material'

interface EntityPickerOrEnumRendererProps extends ControlProps {
  data: string | undefined
}

const EntityPickerOrEnumRenderer: React.FC<EntityPickerOrEnumRendererProps> = ({
  data,
  handleChange,
  path,
  label,
  description,
  uischema,
}) => {
  const help = uischema?.options?.help || description
  const enumValues = uischema?.options?.enumValues || []
  
  // Determine initial mode based on data
  const isEnumValue = enumValues.includes(data)
  const [mode, setMode] = useState<'enum' | 'entity'>(
    isEnumValue ? 'enum' : 'entity'
  )

  const handleModeChange = (_: React.MouseEvent, newMode: 'enum' | 'entity' | null) => {
    if (newMode) {
      setMode(newMode)
      // When switching to enum, use first value; when switching to entity, clear
      handleChange(path, newMode === 'enum' ? (enumValues[0] || '') : '')
    }
  }

  return (
    <Box sx={{ mb: 3 }}>
      <Typography variant="subtitle1" gutterBottom>
        {label}
      </Typography>
      {help && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {help}
        </Typography>
      )}

      <ToggleButtonGroup
        value={mode}
        exclusive
        onChange={handleModeChange}
        size="small"
        sx={{ mb: 2 }}
      >
        <ToggleButton value="enum">Preset Value</ToggleButton>
        <ToggleButton value="entity">Entity ID</ToggleButton>
      </ToggleButtonGroup>

      {mode === 'enum' ? (
        <FormControl fullWidth size="small">
          <InputLabel>{label}</InputLabel>
          <Select
            value={data && enumValues.includes(data) ? data : (enumValues[0] || '')}
            onChange={(e) => handleChange(path, e.target.value)}
            label={label}
          >
            {enumValues.map((value: string) => (
              <MenuItem key={value} value={value}>
                {value}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      ) : (
        <TextField
          value={typeof data === 'string' && !enumValues.includes(data) ? data : ''}
          onChange={(e) => handleChange(path, e.target.value)}
          placeholder="e.g., input_select.optimization_strategy"
          fullWidth
          size="small"
          label="Entity ID"
        />
      )}
    </Box>
  )
}

// Tester for FlexEnum type (detected via refType in UISchema options)
export const entityPickerOrEnumTester = rankWith(
  15, // Higher priority than standard enum renderer
  (uischema) => {
    // Check if this is a FlexEnum by looking at refType preserved in UISchema options
    return uischema.options?.refType === 'FlexEnum'
  }
)

export default withJsonFormsControlProps(EntityPickerOrEnumRenderer)
