import React, { useState, useContext } from 'react'
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
  Autocomplete,
  CircularProgress,
  Alert,
  ListSubheader,
} from '@mui/material'
import HelpOutlineIcon from '@mui/icons-material/HelpOutline'
import RefreshIcon from '@mui/icons-material/Refresh'
import { HAContext, API_ENDPOINTS } from '../../App'
import {
  fetchHAEntities,
  filterEntitiesByDomain,
  groupEntitiesByDomain,
  formatEntityLabel,
  getCachedEntities,
  type HAEntityOption,
} from '../../services/homeassistant'

/**
 * Entity picker renderer with live Home Assistant entity loading
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
  const { config: haConfig, secrets } = useContext(HAContext)
  const [entities, setEntities] = useState<HAEntityOption[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  
  if (!visible) {
    return null
  }

  const help = uischema?.options?.help
  const unit = uischema?.options?.unit
  const validationHint = uischema?.options?.validationHint
  const widgetFilter = uischema?.options?.widgetFilter // e.g., "sensor,input_number"
  
  const hasError = Boolean(errors && errors.length > 0)
  const errorMessage = hasError ? errors : undefined

  /**
   * Load entities from Home Assistant
   */
  const loadEntities = async (forceRefresh = false) => {
    // Check cache first
    if (!forceRefresh) {
      const cached = getCachedEntities()
      if (cached) {
        const filtered = filterEntitiesByDomain(cached, widgetFilter)
        setEntities(filtered)
        return
      }
    }
    
    setLoading(true)
    setError(null)
    
    try {
      const allEntities = await fetchHAEntities(API_ENDPOINTS.HA_STATES, haConfig, secrets)
      const filtered = filterEntitiesByDomain(allEntities, widgetFilter)
      setEntities(filtered)
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to load entities'
      setError(errorMsg)
      console.error('Failed to fetch HA entities:', err)
    } finally {
      setLoading(false)
    }
  }

  /**
   * Handle autocomplete open - load entities on demand
   */
  const handleOpen = () => {
    setOpen(true)
    if (entities.length === 0 && !error) {
      loadEntities()
    }
  }

  /**
   * Handle autocomplete close
   */
  const handleClose = () => {
    setOpen(false)
  }

  /**
   * Handle refresh button click
   */
  const handleRefresh = () => {
    loadEntities(true)
  }

  // Group entities by domain for organized display
  const groupedEntities = entities.length > 0 ? groupEntitiesByDomain(entities) : {}
  const sortedDomains = Object.keys(groupedEntities).sort()

  // Flatten for autocomplete options with group info
  const options: (HAEntityOption | { header: string })[] = []
  sortedDomains.forEach(domain => {
    options.push({ header: domain })
    options.push(...groupedEntities[domain])
  })

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
        {entities.length > 0 && (
          <Tooltip title="Refresh entities" arrow>
            <IconButton size="small" onClick={handleRefresh} disabled={loading}>
              <RefreshIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>
        )}
      </Box>
      
      {(description || hasError || validationHint) && (
        <Typography variant="body2" sx={{ mb: 1 }}>
          {description && <span style={{ color: 'text.secondary' }}>{description}</span>}
          {description && hasError && <span> • </span>}
          {hasError && <span style={{ color: '#d32f2f' }}>{errorMessage}</span>}
          {validationHint && <span style={{ color: 'text.secondary', fontStyle: 'italic' }}> ({validationHint})</span>}
        </Typography>
      )}
      
      {error && (
        <Alert severity="warning" sx={{ mb: 1 }}>
          {error}
          <Typography variant="caption" display="block" sx={{ mt: 0.5 }}>
            You can still enter an entity ID manually.
          </Typography>
        </Alert>
      )}
      
      <Autocomplete
        open={open}
        onOpen={handleOpen}
        onClose={handleClose}
        value={data || null}
        onChange={(_, newValue) => {
          if (typeof newValue === 'string') {
            handleChange(path, newValue || null)
          } else if (newValue && 'entity_id' in newValue) {
            handleChange(path, newValue.entity_id || null)
          } else {
            handleChange(path, null)
          }
        }}
        inputValue={data || ''}
        onInputChange={(_, newInputValue) => {
          handleChange(path, newInputValue || null)
        }}
        options={options}
        getOptionLabel={(option) => {
          if (typeof option === 'string') return option
          if ('header' in option) return ''
          return option.entity_id
        }}
        renderOption={(props, option) => {
          if ('header' in option) {
            return (
              <ListSubheader key={option.header} sx={{ lineHeight: '32px' }}>
                {option.header}
              </ListSubheader>
            )
          }
          return (
            <li {...props} key={option.entity_id}>
              <Box>
                <Typography variant="body2">{formatEntityLabel(option)}</Typography>
              </Box>
            </li>
          )
        }}
        renderInput={(params) => (
          <TextField
            {...params}
            placeholder={widgetFilter ? `Select ${widgetFilter} entity...` : 'Select entity...'}
            size="small"
            error={hasError}
            InputProps={{
              ...params.InputProps,
              endAdornment: (
                <>
                  {loading ? <CircularProgress color="inherit" size={20} /> : null}
                  {params.InputProps.endAdornment}
                </>
              ),
            }}
          />
        )}
        freeSolo
        clearOnBlur={false}
        selectOnFocus
        handleHomeEndKeys
        loading={loading}
        filterOptions={(x) => x} // Let user type freely, we filter by domain already
        isOptionEqualToValue={(option, value) => {
          if (typeof option === 'string' && typeof value === 'string') {
            return option === value
          }
          if ('entity_id' in option && typeof value === 'string') {
            return option.entity_id === value
          }
          if ('entity_id' in option && 'entity_id' in value) {
            return option.entity_id === value.entity_id
          }
          return false
        }}
        groupBy={(option) => {
          if ('header' in option) return ''
          return '' // We handle grouping manually with ListSubheader
        }}
      />
      
      {entities.length > 0 && !error && (
        <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
          {entities.length} {widgetFilter || 'available'} entities loaded
        </Typography>
      )}
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
