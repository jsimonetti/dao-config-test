"""
Version 0 configuration model (root).

This is the main configuration model that ties all sub-models together.
Version 0 represents the initial Pydantic migration - unversioned configs
get migrated to this version with no format changes.
"""

from typing import Optional, Literal
from pydantic import BaseModel, Field, ConfigDict, field_validator

from ..models.base import SecretStr
from ..models.database import HADatabaseConfig, DatabaseConfig
from ..models.pricing import PricingConfig
from ..models.graphics import GraphicsConfig
from ..models.notifications import NotificationsConfig
from ..models.grid import GridConfig
from ..models.history import HistoryConfig
from ..models.dashboard import DashboardConfig
from ..models.tibber import TibberConfig
from ..models.report import ReportConfig
from ..models.scheduler import SchedulerConfig
from ..models.homeassistant import HomeAssistantConfig
from ..models.devices.battery import BatteryConfig
from ..models.devices.solar import SolarConfig
from ..models.devices.ev import EVConfig
from ..models.devices.boiler import BoilerConfig
from ..models.devices.heating import HeatingConfig
from ..models.devices.machines import MachineConfig


class ConfigurationV0(BaseModel):
    """
    Day Ahead Optimizer Configuration - Version 0.
    
    This is the root configuration model that encompasses all settings.
    """
    
    # Version
    config_version: Literal[0] = 0
    
    # Connection
    homeassistant: HomeAssistantConfig = Field(
        default_factory=lambda: HomeAssistantConfig(),
        description="Home Assistant connection settings"
    )
    
    # Databases
    database_ha: Optional[HADatabaseConfig] = Field(
        default=None,
        alias="database ha",
        description="Home Assistant database connection",
    )
    database_da: Optional[DatabaseConfig] = Field(
        default=None,
        alias="database da",
        description="Day Ahead optimization database connection"
    )
    
    # Location (auto-fetched from HA, but can be in config)
    latitude: Optional[float] = Field(
        default=None,
        description="Latitude (auto-fetched from HA if not set)",
        json_schema_extra={
            "x-ui-group": "DAO",
            "x-ui-section": "Your home"
        }
    )
    longitude: Optional[float] = Field(
        default=None,
        description="Longitude (auto-fetched from HA if not set)",
        json_schema_extra={
            "x-ui-group": "DAO",
            "x-ui-section": "Your home"
        }
    )
    time_zone: Optional[str] = Field(
        default=None,
        alias="time_zone",
        description="Timezone (auto-fetched from HA if not set)",
        json_schema_extra={
            "x-ui-group": "DAO",
            "x-ui-section": "Your home"
        }
    )
    country: Optional[str] = Field(
        default=None,
        description="Country code (auto-fetched from HA if not set)",
        json_schema_extra={
            "x-ui-group": "DAO",
            "x-ui-section": "Your home"
        }
    )
    
    # Meteoserver
    meteoserver_key: str | SecretStr = Field(
        alias="meteoserver-key",
        description="Meteoserver API key (can use !secret)",
        json_schema_extra={
            "x-ui-group": "DAO",
            "x-ui-section": "Weather",
            "x-help": "Meteoserver API access key. Get from Meteoserver.nl account. Use !secret for security. Required for weather forecasts.",
            "x-validation-hint": "Use !secret for API keys",
            "x-ui-widget": "secret-picker"  # TODO: Implement secret-picker widget similar to entity-picker
        }
    )
    meteoserver_model: Literal['harmonie', 'gfs'] = Field(
        default="harmonie",
        alias="meteoserver-model",
        description="Meteoserver model",
        json_schema_extra={
            "x-ui-group": "DAO",
            "x-ui-section": "Weather"
        }
    )
    meteoserver_attemps: Optional[int] = Field(
        default=2,
        alias="meteoserver-attemps",
        ge=1,
        description="Number of meteoserver fetch attempts",
        json_schema_extra={
            "x-ui-group": "DAO",
            "x-ui-section": "Weather"
        }
    )
    
    # Pricing
    prices: Optional[PricingConfig] = Field(
        default=None,
        description="Day-ahead pricing and tariff configuration"
    )
    
    # General settings
    logging_level: Literal['debug', 'info', 'warning', 'error'] = Field(
        default="info",
        alias="logging level",
        description="Logging level",
        json_schema_extra={
            "x-ui-group": "DAO",
            'x-ui-section': "Main"
        }
    )
    protocol_api: Optional[Literal['http', 'https']] = Field(
        default=None,
        alias="protocol api",
        description="API protocol",
        json_schema_extra={
            "x-ui-group": "Integration",
            'x-ui-section': "Dashboard"
        }
    )
    
    # Baseload
    use_calc_baseload: bool = Field(
        default=False,
        alias="use_calc_baseload",
        description="Whether to calculate baseload automatically",
        json_schema_extra={
            "x-ui-group": "DAO",
            "x-ui-section": "Baseload",
            "x-order": 101
        }
    )
    baseload_calc_periode: int = Field(
        default=56,
        alias="baseload calc periode",
        ge=1,
        description="Period in days for baseload calculation",
        json_schema_extra={
            "x-ui-group": "DAO",
            "x-ui-section": "Baseload",
            "x-order": 102,
            "x-ui-rules": {
                "effect": "SHOW",
                "condition": {
                    "scope": "#/properties/use_calc_baseload",
                    "schema": {"enum": [True]}
                }
            }
        }
    )
    baseload: Optional[list[int]] = Field(
        default=None,
        min_length=24,
        max_length=24,
        description="Baseload power consumption (watts) - 24 hourly values",
        json_schema_extra={
            "x-ui-group": "DAO",
            "x-ui-section": "Baseload",
            "x-order": 103,
            "x-help": "Baseload power consumption in watts for each hour of the day (24 values). Leave empty to use calculated baseload.",
            "x-ui-rules": {
                "effect": "HIDE",
                "condition": {
                    "scope": "#/properties/use_calc_baseload",
                    "schema": {"enum": [True]}
                }
            }
        }
    )
    
    @field_validator('baseload')
    @classmethod
    def validate_baseload_length(cls, v):
        """Validate baseload has exactly 24 values if it's a list."""
        if v is not None and isinstance(v, list):
            if len(v) != 24:
                raise ValueError(f"baseload must have exactly 24 hourly values, got {len(v)}")
        return v
    
    # Graphics
    graphical_backend: str = Field(
        default="",
        alias="graphical backend",
        description="Matplotlib graphical backend",
        json_schema_extra={
            "x-ui-group": "Visualization",
            "x-validation-hint": "Leave empty for auto-detect, use 'Agg' for headless"
        }
    )
    graphics: GraphicsConfig = Field(
        default_factory=GraphicsConfig,
        description="Graphics and visualization settings"
    )
    
    # Optimization
    interval: Literal['1hour', '15min'] = Field(
        default='1hour',
        description="Optimization interval in minutes",
        json_schema_extra={
            "x-ui-group": "DAO",
            "x-ui-section": "Optimization",
            "x-help": "Time interval for optimization calculations. '1hour' for hourly optimization, '15min' for quarter-hourly optimization (more detailed, higher computation).",
            "x-docs-url": "https://github.com/corneel72/day-ahead/wiki/Optimization",
            "x-order": 1
        }
    )
    strategy: Literal['minimize cost', 'minimize consumption'] = Field(
        default="minimize cost",
        description="Optimization strategy",
        json_schema_extra={
            "x-ui-group": "DAO",
            "x-ui-section": "Optimization",
            "x-order": 2
        }
    )
    
    # User Interface
    notifications: Optional[NotificationsConfig] = Field(
        default=None,
        description="Notification settings"
    )

    grid: GridConfig = Field(
        default_factory=GridConfig,
        description="Grid connection settings",
        json_schema_extra={
            "x-ui-section": "Grid"
        }
    )
    history: HistoryConfig = Field(
        default_factory=HistoryConfig,
        description="History retention settings"
    )
    dashboard: DashboardConfig = Field(
        default_factory=DashboardConfig,
        description="Dashboard web UI settings"
    )
    
    # Devices (required arrays)
    battery: list[BatteryConfig] = Field(
        default_factory=list,
        json_schema_extra={
            "x-ui-section": "Batteries"
        }
    )
    solar: list[SolarConfig] = Field(
        default_factory=list,
        description="Solar panel configurations",
        json_schema_extra={
            "x-ui-section": "Solar Panels"
        }
    )
    electric_vehicle: list[EVConfig] = Field(
        default_factory=list,
        alias="electric vehicle",
        description="Electric vehicle configurations",
        json_schema_extra={
            "x-ui-section": "Vehicles"
        }
    )
    machines: list[MachineConfig] = Field(
        default_factory=list,
        description="Appliance/machine configurations",
        json_schema_extra={
            "x-ui-section": "Machines"
        }
    )
    
    # Optional devices
    boiler: Optional[BoilerConfig] = Field(
        default=None,
        description="Hot water boiler configuration"
    )
    heating: Optional[HeatingConfig] = Field(
        default=None,
        description="Heating system / heat pump configuration"
    )
    
    # Optional integrations
    tibber: Optional[TibberConfig] = Field(
        default=None,
        description="Tibber API integration"
    )
    
    # Reporting & Scheduling
    report: ReportConfig = Field(
        default_factory=ReportConfig,
        description="Reporting entity configuration"
    )
    scheduler: SchedulerConfig = Field(
        default_factory=SchedulerConfig,
        description="Task scheduler configuration"
    )
    
    model_config = ConfigDict(
        extra='allow',  # Preserve unknown keys
        populate_by_name=True  # Allow both snake_case and aliases
    )
