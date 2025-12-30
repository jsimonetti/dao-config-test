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
 * Placeholder renderer for x-ui-widget: "entity-picker"
 * TODO: Implement proper entity picker with HA entity dropdown
 */
const EntityPickerRenderer: React.FC<ControlProps> = ({
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
          label="TODO: Entity Picker"
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
        value={data || ''}
        onChange={(e) => handleChange(path, e.target.value || null)}
        fullWidth
        size="small"
        placeholder="Enter entity ID (e.g., sensor.battery_level)"
        error={hasError}
        sx={{
          '& .MuiOutlinedInput-root': {
            backgroundColor: '#fff3cd', // Yellow background
          }
        }}
      />
    </Box>
  )
}

// Tester that matches fields with x-ui-widget: entity-picker
export const entityPickerTester = rankWith(
  15, // High priority
  (uischema) => {
    const widget = uischema?.options?.widget
    return widget === 'entity-picker'
  }
)

export default withJsonFormsControlProps(EntityPickerRenderer)
