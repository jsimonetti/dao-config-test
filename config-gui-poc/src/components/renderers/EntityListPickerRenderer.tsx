import React from 'react'
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
} from '@mui/material'
import HelpOutlineIcon from '@mui/icons-material/HelpOutline'
import WarningIcon from '@mui/icons-material/Warning'

/**
 * Placeholder renderer for x-ui-widget: "entity-list-picker"
 * TODO: Implement proper multi-select entity picker with chips
 */
const EntityListPickerRenderer: React.FC<ControlProps> = ({
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
  
  const hasError = Boolean(errors && errors.length > 0)
  const errorMessage = hasError ? errors : undefined

  // Handle array data
  const arrayValue = Array.isArray(data) ? data.join(', ') : (data || '')

  const handleValueChange = (value: string) => {
    // Split by comma and trim
    const items = value.split(',').map(s => s.trim()).filter(s => s.length > 0)
    handleChange(path, items.length > 0 ? items : [])
  }

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
          label="TODO: Multi-Entity Picker"
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
      
      <TextField
        type="text"
        value={arrayValue}
        onChange={(e) => handleValueChange(e.target.value)}
        fullWidth
        size="small"
        placeholder="Enter entity IDs, comma-separated (e.g., sensor.solar1, sensor.solar2)"
        error={hasError}
        multiline
        rows={2}
        sx={{
          '& .MuiOutlinedInput-root': {
            backgroundColor: '#d1ecf1', // Blue background
          }
        }}
      />
    </Box>
  )
}

// Tester that matches fields with x-ui-widget: entity-list-picker
export const entityListPickerTester = rankWith(
  15, // High priority
  (uischema) => {
    const widget = uischema?.options?.widget
    return widget === 'entity-list-picker'
  }
)

export default withJsonFormsControlProps(EntityListPickerRenderer)
