import { useState, useEffect } from 'react'
import { JsonForms } from '@jsonforms/react'
import { materialCells } from '@jsonforms/material-renderers'
import { allRenderers } from './components/renderers'
import { 
  Box, 
  Container, 
  Typography, 
  Paper, 
  CircularProgress,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  Toolbar,
  AppBar
} from '@mui/material'
import SaveIcon from '@mui/icons-material/Save'
import UndoIcon from '@mui/icons-material/Undo'
import CloseIcon from '@mui/icons-material/Close'
import { createAjv } from '@jsonforms/core'

interface UISchema {
  type: string
  [key: string]: any
}

interface Schema {
  type: string
  [key: string]: any
}

interface ConfigData {
  [key: string]: any
}

function App() {
  const [uischema, setUISchema] = useState<UISchema | null>(null)
  const [schema, setSchema] = useState<Schema | null>(null)
  const [data, setData] = useState<ConfigData>({
    // Infrastructure
    grid: {
      max_power: 17
    },
    // Pricing
    pricing: {
      source_day_ahead: 'nordpool',
      entsoe_api_key: null,
      energy_taxes_consumption: { '2024-01-01': 0.05 },
      energy_taxes_production: { '2024-01-01': 0.0 },
      cost_supplier_consumption: { '2024-01-01': 0.02 },
      cost_supplier_production: { '2024-01-01': -0.02 },
      vat_consumption: { '2024-01-01': 21 },
      vat_production: { '2024-01-01': 21 },
      last_invoice: '2025-12-03',
      tax_refund: false
    },
    // Integration
    homeassistant: {
      ip_address: 'homeassistant.local',
      ip_port: 8123,
      hasstoken: '',
      protocol_api: 'http'
    },
    // Energy Storage - array of batteries
    battery: [],
    // Energy Production - array of solar configs
    solar: [],
    // Devices
    electric_vehicle: [],
    machines: []
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showSaveDialog, setShowSaveDialog] = useState(false)

  useEffect(() => {
    // Load combined UISchema and JSON Schema
    Promise.all([
      fetch('/uischema.json').then(r => r.json()),
      fetch('/schema.json').then(r => r.json())
    ])
      .then(([uischemaData, schemaData]) => {
        setUISchema(uischemaData)
        setSchema(schemaData)
        setLoading(false)
      })
      .catch(err => {
        setError(err.message)
        setLoading(false)
      })
  }, [])

  const handleChange = (state: { data: any }) => {
    setData(state.data)
    console.log('Form data changed:', state.data)
  }

  const handleSave = () => {
    setShowSaveDialog(true)
  }

  const handleRevert = () => {
    // TODO: Implement revert functionality
    console.log('Revert clicked (placeholder)')
  }

  const handleCloseSaveDialog = () => {
    setShowSaveDialog(false)
  }

  const handleCopyToClipboard = () => {
    const jsonString = JSON.stringify(data, null, 2)
    navigator.clipboard.writeText(jsonString)
      .then(() => {
        console.log('Configuration copied to clipboard')
      })
      .catch(err => {
        console.error('Failed to copy:', err)
      })
  }

  if (loading) {
    return (
      <Container maxWidth="md" sx={{ mt: 4, textAlign: 'center' }}>
        <CircularProgress />
        <Typography sx={{ mt: 2 }}>Loading configuration...</Typography>
      </Container>
    )
  }

  if (error) {
    return (
      <Container maxWidth="md" sx={{ mt: 4 }}>
        <Paper sx={{ p: 3, bgcolor: 'error.light' }}>
          <Typography color="error">Error loading configuration: {error}</Typography>
        </Paper>
      </Container>
    )
  }

  return (
    <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Top toolbar with action buttons */}
      <AppBar position="static" color="default" elevation={1}>
        <Toolbar sx={{ justifyContent: 'flex-end', gap: 1 }}>
          <Button
            startIcon={<UndoIcon />}
            onClick={handleRevert}
            variant="outlined"
            size="small"
          >
            Revert
          </Button>
          <Button
            startIcon={<SaveIcon />}
            onClick={handleSave}
            variant="contained"
            size="small"
            color="primary"
          >
            Save
          </Button>
        </Toolbar>
      </AppBar>

      {/* Form content */}
      <Box sx={{ flex: 1, overflow: 'auto' }}>
        {uischema && schema && (
          <JsonForms
            schema={schema}
            uischema={uischema}
            data={data}
            renderers={allRenderers}
            cells={materialCells}
            onChange={handleChange}
            ajv={createAjv()}
          />
        )}
      </Box>

      {/* Save dialog */}
      <Dialog 
        open={showSaveDialog} 
        onClose={handleCloseSaveDialog}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          Configuration JSON
          <IconButton
            aria-label="close"
            onClick={handleCloseSaveDialog}
            sx={{
              position: 'absolute',
              right: 8,
              top: 8,
            }}
          >
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          <Paper 
            sx={{ 
              p: 2, 
              bgcolor: 'grey.100',
              maxHeight: '60vh',
              overflow: 'auto'
            }}
          >
            <pre style={{ margin: 0, fontSize: '0.875rem', fontFamily: 'monospace' }}>
              {JSON.stringify(data, null, 2)}
            </pre>
          </Paper>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCopyToClipboard} variant="outlined">
            Copy to Clipboard
          </Button>
          <Button onClick={handleCloseSaveDialog} variant="contained">
            Close
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}

export default App
