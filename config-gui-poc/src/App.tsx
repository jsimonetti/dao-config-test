import { useState, useEffect } from 'react'
import { JsonForms } from '@jsonforms/react'
import { materialCells } from '@jsonforms/material-renderers'
import { allRenderers } from './components/renderers'
import { Box, Container, Typography, Paper, CircularProgress } from '@mui/material'
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
  )
}

export default App
