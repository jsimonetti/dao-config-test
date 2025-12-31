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
  ToggleButtonGroup,
  ToggleButton,
  Chip,
} from '@mui/material'
import HelpOutlineIcon from '@mui/icons-material/HelpOutline'
import WarningIcon from '@mui/icons-material/Warning'

interface EntityPickerOrNumberRendererProps extends ControlProps {
  data: number | string | object | undefined
}

const EntityPickerOrNumberRenderer: React.FC<EntityPickerOrNumberRendererProps> = ({
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
  
  // Determine if current value is a number or entity ID
  const isEntityId = typeof data === 'string' || (typeof data === 'object' && data !== null && 'entity_id' in data)
  const [mode, setMode] = useState<'number' | 'entity'>(isEntityId ? 'entity' : 'number')
  
  // errors is a string, not an array
  const hasError = Boolean(errors && errors.length > 0)
  const errorMessage = hasError ? errors : undefined
  
  // Debug logging
  console.log('EntityPickerOrNumberRenderer', { path, data, errors, hasError })
  
  const handleModeChange = (_: React.MouseEvent<HTMLElement>, newMode: 'number' | 'entity' | null) => {
    if (newMode === null) return
    setMode(newMode)
    
    // Reset value when switching modes
    if (newMode === 'number') {
      handleChange(path, 0)
    } else {
      // Set to empty FlexValue object
      handleChange(path, null)
    }
  }
  
  const handleValueChange = (value: string) => {
    if (mode === 'number') {
      const numValue = parseFloat(value)
      if (!isNaN(numValue)) {
        handleChange(path, numValue)
      } else if (value === '') {
        handleChange(path, null)
      }
    } else {
      // Entity mode - send as plain string (entity ID)
      handleChange(path, value || null)
    }
  }
  
  const displayValue = mode === 'number' 
    ? (typeof data === 'number' ? data : '')
    : (typeof data === 'string' ? data : (data && typeof data === 'object' && 'entity_id' in data ? data.entity_id : ''))

  return (
    <Box sx={{ mb: 2, p: 2, backgroundColor: '#e8f5e9', borderRadius: 1 }}>
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
          label="TODO: Number/Entity Picker"
          size="small"
          color="warning"
          sx={{ ml: 1 }}
        />
      </Box>
      {(description || hasError) && (
        <Typography variant="body2" sx={{ mb: 1 }}>
          {description && <span style={{ color: 'text.secondary' }}>{description}</span>}
          {description && hasError && <span> • </span>}
          {hasError && <span style={{ color: '#d32f2f' }}>{errorMessage}</span>}
        </Typography>
      )}
      
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
        <ToggleButtonGroup
          value={mode}
          exclusive
          onChange={handleModeChange}
          size="small"
        >
          <ToggleButton value="number">
            Number
          </ToggleButton>
          <ToggleButton value="entity">
            Entity
          </ToggleButton>
        </ToggleButtonGroup>
        
        <TextField
          type={mode === 'number' ? 'number' : 'text'}
          value={displayValue}
          onChange={(e) => handleValueChange(e.target.value)}
          fullWidth
          size="small"
          placeholder={mode === 'number' ? (validationHint || 'Enter number') : 'Enter entity ID'}
          error={hasError}
          inputProps={{
            step: mode === 'number' ? 0.01 : undefined,
          }}
        />
      </Box>
    </Box>
  )
}

// Tester that matches fields with x-ui-widget: entity-picker-or-number
export const entityPickerOrNumberTester = rankWith(
  15, // Very high priority to override default anyOf renderer
  (uischema) => {
    const widget = uischema?.options?.widget
    return widget === 'entity-picker-or-number'
  }
)

export default withJsonFormsControlProps(EntityPickerOrNumberRenderer)
