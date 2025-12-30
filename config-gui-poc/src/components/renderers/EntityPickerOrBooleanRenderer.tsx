import React, { useState } from 'react'
import {
  ControlProps,
  rankWith,
} from '@jsonforms/core'
import { withJsonFormsControlProps } from '@jsonforms/react'
import {
  TextField,
  Box,
  Typography,
  IconButton,
  Tooltip,
  Chip,
  ToggleButtonGroup,
  ToggleButton,
} from '@mui/material'
import HelpOutlineIcon from '@mui/icons-material/HelpOutline'
import WarningIcon from '@mui/icons-material/Warning'

/**
 * Placeholder renderer for x-ui-widget: "entity-picker-or-boolean"
 * TODO: Implement proper boolean/entity picker with toggle
 */
const EntityPickerOrBooleanRenderer: React.FC<ControlProps> = ({
  data,
  handleChange,
  path,
  label,
  description,
  uischema,
  visible,
  required,
  errors,
}) => {
  if (!visible) {
    return null
  }

  const help = uischema?.options?.help
  const unit = uischema?.options?.unit
  const validationHint = uischema?.options?.validationHint
  
  // Determine if current value is a boolean or entity ID
  const isEntityId = typeof data === 'string'
  const [mode, setMode] = useState<'boolean' | 'entity'>(isEntityId ? 'entity' : 'boolean')
  
  const hasError = Boolean(errors && errors.length > 0)
  const errorMessage = hasError ? errors : undefined

  const handleModeChange = (_: React.MouseEvent<HTMLElement>, newMode: 'boolean' | 'entity' | null) => {
    if (newMode === null) return
    setMode(newMode)
    
    // Reset value when switching modes
    if (newMode === 'boolean') {
      handleChange(path, false)
    } else {
      handleChange(path, '')
    }
  }

  const handleValueChange = (value: string | boolean) => {
    handleChange(path, value || (mode === 'boolean' ? false : ''))
  }

  const displayValue = mode === 'boolean' 
    ? String(data === true)
    : (typeof data === 'string' ? data : '')

  return (
    <Box sx={{ mb: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 500 }}>
          {label}
          {unit && ` (${unit})`}
          {required && <span style={{ color: 'red' }}> *</span>}
        </Typography>
        {help && (
          <Tooltip title={help} arrow>
            <IconButton size="small" sx={{ p: 0 }}>
              <HelpOutlineIcon sx={{ fontSize: 18, color: 'text.secondary' }} />
            </IconButton>
          </Tooltip>
        )}
        <Chip
          icon={<WarningIcon />}
          label="TODO: Boolean/Entity Picker"
          size="small"
          color="warning"
          sx={{ ml: 1 }}
        />
      </Box>
      {(description || hasError || validationHint) && (
        <Typography variant="body2" sx={{ mb: 1 }}>
          {description && <span style={{ color: 'text.secondary' }}>{description}</span>}
          {description && hasError && <span> • </span>}
          {hasError && <span style={{ color: '#d32f2f' }}>{errorMessage}</span>}
          {validationHint && <span style={{ color: 'text.secondary', fontStyle: 'italic' }}> ({validationHint})</span>}
        </Typography>
      )}
      
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
        <ToggleButtonGroup
          value={mode}
          exclusive
          onChange={handleModeChange}
          size="small"
        >
          <ToggleButton value="boolean">
            Boolean
          </ToggleButton>
          <ToggleButton value="entity">
            Entity
          </ToggleButton>
        </ToggleButtonGroup>
        
        {mode === 'boolean' ? (
          <ToggleButtonGroup
            value={data === true ? 'true' : 'false'}
            exclusive
            onChange={(_, value) => handleValueChange(value === 'true')}
            size="small"
            sx={{ flex: 1 }}
          >
            <ToggleButton value="false" sx={{ flex: 1 }}>
              False
            </ToggleButton>
            <ToggleButton value="true" sx={{ flex: 1 }}>
              True
            </ToggleButton>
          </ToggleButtonGroup>
        ) : (
          <TextField
            type="text"
            value={displayValue}
            onChange={(e) => handleValueChange(e.target.value)}
            fullWidth
            size="small"
            placeholder="Enter entity ID"
            error={hasError}
            sx={{
              '& .MuiOutlinedInput-root': {
                backgroundColor: '#d4edda', // Green background
              }
            }}
          />
        )}
      </Box>
    </Box>
  )
}

// Tester that matches fields with x-ui-widget: entity-picker-or-boolean
export const entityPickerOrBooleanTester = rankWith(
  15, // High priority
  (uischema) => {
    const widget = uischema?.options?.widget
    return widget === 'entity-picker-or-boolean'
  }
)

export default withJsonFormsControlProps(EntityPickerOrBooleanRenderer)
