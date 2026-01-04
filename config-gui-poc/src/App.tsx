import { useState, useEffect, createContext } from 'react'
import { JsonForms } from '@jsonforms/react'
import { materialCells } from '@jsonforms/material-renderers'
import { allRenderers } from './components/renderers'
import { SecretsEditor } from './components/SecretsEditor'
import './App.css'
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
  AppBar,
  Tabs,
  Tab,
  Alert
} from '@mui/material'
import SaveIcon from '@mui/icons-material/Save'
import LockIcon from '@mui/icons-material/Lock'
import UndoIcon from '@mui/icons-material/Undo'
import CloseIcon from '@mui/icons-material/Close'
import { createAjv } from '@jsonforms/core'

// Context to share secrets with renderers
export const SecretsContext = createContext<{ secrets: Record<string, string> }>({
  secrets: {}
})

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
  const [secrets, setSecrets] = useState<Record<string, string>>({})
  const [originalSecrets, setOriginalSecrets] = useState<Record<string, string>>({})
  const [currentCategory, setCurrentCategory] = useState<string>('General')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showSaveDialog, setShowSaveDialog] = useState(false)
  const [saveDialogType, setSaveDialogType] = useState<'config' | 'secrets'>('config')

  useEffect(() => {
    // Load schemas and data
    Promise.all([
      fetch('/uischema.json').then(r => r.json()),
      fetch('/schema.json').then(r => r.json()),
      fetch('/secrets.json').then(r => r.json()).catch(() => ({}))
    ])
      .then(([uischemaData, schemaData, secretsData]) => {
        // Add Secrets category to UISchema
        const enhancedUISchema = {
          ...uischemaData,
          elements: [
            ...(uischemaData.elements || []),
            {
              type: 'Category',
              label: 'Secrets',
              elements: [
                {
                  type: 'VerticalLayout',
                  elements: [] // Empty but required for proper rendering
                }
              ]
            }
          ]
        }
        setUISchema(enhancedUISchema)
        setSchema(schemaData)
        setSecrets(secretsData)
        setOriginalSecrets(secretsData)
        setLoading(false)
      })
      .catch(err => {
        setError(err.message)
        setLoading(false)
      })
  }, [])

  // Style the Secrets tab with background color and track tab changes
  useEffect(() => {
    const styleSecretsTab = () => {
      const tabs = document.querySelectorAll('.MuiTab-root')
      tabs.forEach(tab => {
        if (tab.textContent === 'Secrets') {
          tab.style.backgroundColor = 'rgba(244, 67, 54, 0.1)' // Light red background
          tab.style.borderRadius = '4px'
          tab.style.margin = '0 2px'
        }
      })
    }
    
    // Track tab changes
    const trackTabChange = () => {
      const activeTab = document.querySelector('.MuiTab-root.Mui-selected')
      if (activeTab) {
        const categoryLabel = activeTab.textContent || ''
        if (categoryLabel && currentCategory !== categoryLabel) {
          setCurrentCategory(categoryLabel)
        }
      }
    }
    
    const timer = setTimeout(() => {
      styleSecretsTab()
      trackTabChange()
    }, 100)
    
    const interval = setInterval(() => {
      styleSecretsTab()
      trackTabChange()
    }, 300)
    
    // Add click listeners to tabs
    const tabs = document.querySelectorAll('.MuiTab-root')
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        setTimeout(trackTabChange, 50)
      })
    })
    
    return () => {
      clearTimeout(timer)
      clearInterval(interval)
    }
  }, [uischema, currentCategory])

  const secretsChanged = JSON.stringify(secrets) !== JSON.stringify(originalSecrets)

  const handleConfigChange = (state: { data: any }) => {
    setData(state.data)
  }

  const handleSecretsChange = (newSecrets: Record<string, string>) => {
    setSecrets(newSecrets)
  }

  const handleSaveConfig = () => {
    setSaveDialogType('config')
    setShowSaveDialog(true)
  }

  const handleSaveSecrets = async () => {
    // TODO: Replace with actual backend API call
    console.log('Saving secrets to backend:', secrets)
    
    // Simulate backend save - in real implementation, this would be an API call
    // For now, just update originalSecrets to mark as saved
    setOriginalSecrets(secrets)
    
    // Reload secrets to ensure config editor has latest
    try {
      const response = await fetch('/secrets.json')
      if (response.ok) {
        const freshSecrets = await response.json()
        setSecrets(freshSecrets)
        setOriginalSecrets(freshSecrets)
      }
    } catch (err) {
      console.error('Failed to reload secrets:', err)
    }
    
    setSaveDialogType('secrets')
    setShowSaveDialog(true)
  }

  const handleRevert = () => {
    // TODO: Implement revert functionality
    console.log('Revert clicked (placeholder)')
  }

  const handleCloseSaveDialog = () => {
    setShowSaveDialog(false)
  }

  const handleCopyToClipboard = (type: 'config' | 'secrets' | 'both') => {
    let jsonString = ''
    if (type === 'config') {
      jsonString = JSON.stringify(data, null, 2)
    } else if (type === 'secrets') {
      jsonString = JSON.stringify(secrets, null, 2)
    } else {
      jsonString = `// options.json\n${JSON.stringify(data, null, 2)}\n\n// secrets.json\n${JSON.stringify(secrets, null, 2)}`
    }
    
    navigator.clipboard.writeText(jsonString)
      .then(() => {
        console.log(`${type} copied to clipboard`)
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
          {currentCategory === 'Secrets' && secretsChanged ? (
            <Button
              startIcon={<LockIcon />}
              onClick={handleSaveSecrets}
              variant="contained"
              size="small"
              color="warning"
            >
              Save Secrets
            </Button>
          ) : (
            <Button
              startIcon={<SaveIcon />}
              onClick={handleSaveConfig}
              variant="contained"
              size="small"
              color="primary"
            >
              Save Configuration
            </Button>
          )}
        </Toolbar>
      </AppBar>

      {/* Form content */}
      <Box sx={{ flex: 1, overflow: 'auto' }}>
        <SecretsContext.Provider value={{ secrets }}>
          {uischema && schema && (
            <>
              <JsonForms
                schema={schema}
                uischema={uischema}
                data={data}
                renderers={allRenderers}
                cells={materialCells}
                onChange={(state) => {
                  handleConfigChange(state)
                  // Track category changes
                  const activeTab = document.querySelector('.MuiTab-root.Mui-selected')
                  if (activeTab) {
                    const categoryLabel = activeTab.textContent || ''
                    if (categoryLabel && currentCategory !== categoryLabel) {
                      setCurrentCategory(categoryLabel)
                    }
                  }
                }}
                ajv={createAjv()}
              />
              {/* Render Secrets Editor when Secrets tab is active */}
              {currentCategory === 'Secrets' && (
                <Container maxWidth="md" sx={{ mt: 4, mb: 4 }}>
                  <Alert 
                    severity="info" 
                    icon={<LockIcon />}
                    sx={{ mb: 3 }}
                  >
                    <Typography variant="body2" fontWeight="medium">
                      Secrets are stored separately in <code>secrets.json</code>
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Changes to secrets require saving before they can be used in configuration fields.
                      Use the "Save Secrets" button above when you have made changes.
                    </Typography>
                  </Alert>
                  <Paper sx={{ p: 3 }}>
                    <Typography variant="h5" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <LockIcon color="warning" />
                      Secrets Management
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                      Manage secret values referenced in your configuration using !secret key_name.
                    </Typography>
                    <SecretsEditor 
                      secrets={secrets}
                      onChange={handleSecretsChange}
                    />
                  </Paper>
                </Container>
              )}
            </>
          )}
        </SecretsContext.Provider>
      </Box>

      {/* Save dialog with tabs for both JSONs */}
      <Dialog 
        open={showSaveDialog} 
        onClose={handleCloseSaveDialog}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          Save Configuration
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
          <Tabs value={saveDialogType} onChange={(_, newValue) => setSaveDialogType(newValue)}>
            <Tab label="Configuration (options.json)" value="config" />
            <Tab label="Secrets (secrets.json)" value="secrets" icon={<LockIcon />} iconPosition="end" />
          </Tabs>
          <Paper 
            sx={{ 
              mt: 2,
              p: 2, 
              bgcolor: 'grey.100',
              maxHeight: '50vh',
              overflow: 'auto'
            }}
          >
            <pre style={{ margin: 0, fontSize: '0.875rem', fontFamily: 'monospace' }}>
              {JSON.stringify(saveDialogType === 'config' ? data : secrets, null, 2)}
            </pre>
          </Paper>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => handleCopyToClipboard(saveDialogType)} variant="outlined">
            Copy to Clipboard
          </Button>
          <Button onClick={() => handleCopyToClipboard('both')} variant="outlined">
            Copy Both
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
