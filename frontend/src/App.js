import { useState, useEffect, useRef } from "react";
import "./App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import axios from "axios";
import { MapContainer, TileLayer, Marker, Popup, GeoJSON, useMap } from 'react-leaflet';
import { HeatmapLayer } from 'react-leaflet-heatmap-layer-v3';
import 'leaflet/dist/leaflet.css';
import Papa from 'papaparse';
import { ArrowUpTrayIcon, ChartBarIcon, MapIcon, ChevronDownIcon, XMarkIcon, ArrowPathIcon } from '@heroicons/react/24/outline';
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { Pie, Bar } from "react-chartjs-2";
import { Chart as ChartJS, ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, Title } from 'chart.js';

// Register ChartJS components
ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, Title);

// Fix Leaflet icon issues
import L from 'leaflet';
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
});

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Define Espoo as initial map center
const ESPOO_CENTER = [60.18, 24.78]; // Center of Espoo, Finland
const ESPOO_ZOOM = 13;

// Color scale for ROI
const getColorForROI = (roi) => {
  if (!roi) return '#CCCCCC'; // gray for no data
  
  if (roi < 15) return '#1a9850'; // green (good)
  if (roi < 18) return '#91cf60';
  if (roi < 21) return '#d9ef8b';
  if (roi < 24) return '#fee08b';
  if (roi < 27) return '#fc8d59';
  return '#d73027'; // red (poor)
};

// Style function for building outlines
const buildingStyle = (feature, roi) => {
  let fillColor = '#CCCCCC';
  
  // If we have ROI data for this building, color it accordingly
  if (roi) {
    fillColor = getColorForROI(roi);
  }
  
  return {
    fillColor: fillColor,
    weight: 1,
    opacity: 1,
    color: '#666',
    fillOpacity: 0.7
  };
};

// Fit map bounds when GeoJSON data changes
const GeoJsonUpdater = ({ data }) => {
  const map = useMap();
  
  useEffect(() => {
    if (data && data.features && data.features.length > 0) {
      try {
        const bounds = L.geoJSON(data).getBounds();
        map.fitBounds(bounds);
      } catch (e) {
        console.error("Error fitting bounds:", e);
      }
    }
  }, [data, map]);
  
  return null;
};

const Dashboard = () => {
  // State variables
  const [properties, setProperties] = useState([]);
  const [regionStats, setRegionStats] = useState([]);
  const [propertyTypes, setPropertyTypes] = useState([]);
  const [sources, setSources] = useState([]);
  const [buildings, setBuildings] = useState([]);
  const [roiData, setRoiData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('map');
  const [mapMode, setMapMode] = useState('markers'); // markers, heatmap, or roi
  const [mapTooltip, setMapTooltip] = useState('');
  const [heatmapMetric, setHeatmapMetric] = useState('price'); // price, density
  
  // Filter state
  const [filters, setFilters] = useState({
    price_min: '',
    price_max: '',
    property_type: '',
    area_min: '',
    area_max: '',
    rooms_min: '',
    rooms_max: '',
    is_for_sale: null,
    source: ''
  });
  
  // File upload state
  const [csvFile, setCsvFile] = useState(null);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [dataImported, setDataImported] = useState(false);
  
  // GeoJSON state for buildings
  const [buildingsGeoJson, setBuildingsGeoJson] = useState(null);
  
  // Load initial data
  useEffect(() => {
    importDefaultData();
  }, []);
  
  // Import default data
  const importDefaultData = async () => {
    setLoading(true);
    try {
      // Clear any existing data
      setProperties([]);
      setRoiData([]);
      
      // Import data
      const response = await axios.post(`${API}/import-default-data`);
      console.log('Default data imported:', response.data);
      setDataImported(true);
      
      // Load property data
      const propsResponse = await axios.get(`${API}/properties?limit=10000`);
      setProperties(propsResponse.data);
      console.log(`Loaded ${propsResponse.data.length} properties`);
      
      // Load dependent data in parallel
      await Promise.all([
        fetchPropertyTypes(),
        fetchSources(),
        fetchBuildings(),
        fetchRegionStats(),
        fetchRoiAnalysis()
      ]);
      
      console.log('All data loaded successfully');
    } catch (error) {
      console.error('Error importing default data:', error);
      setUploadError('Error importing data: ' + (error.response?.data?.detail || error.message));
    } finally {
      setLoading(false);
    }
  };
  
  // Fetch properties with filters
  const fetchProperties = async () => {
    setLoading(true);
    try {
      // Build query parameters from filters
      const queryParams = new URLSearchParams();
      
      // Add non-empty filter values to query parameters
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== '' && value !== null) {
          queryParams.append(key, value);
        }
      });
      
      // Add a high limit to get all properties
      queryParams.append('limit', '10000');
      
      const response = await axios.get(`${API}/properties?${queryParams.toString()}`);
      const data = response.data;
      setProperties(data);
      console.log(`Fetched ${data.length} properties`);
      console.log(`Sale properties: ${data.filter(p => p.is_for_sale === true).length}`);
      console.log(`Rental properties: ${data.filter(p => p.is_for_sale === false).length}`);
      
      return data;
    } catch (error) {
      console.error('Error fetching properties:', error);
      return [];
    } finally {
      setLoading(false);
    }
  };
  
  // Fetch region statistics
  const fetchRegionStats = async () => {
    try {
      const response = await axios.get(`${API}/properties/stats/regions`);
      setRegionStats(response.data);
    } catch (error) {
      console.error('Error fetching region stats:', error);
    }
  };
  
  // Fetch property types for filter dropdown
  const fetchPropertyTypes = async () => {
    try {
      const response = await axios.get(`${API}/property-types`);
      setPropertyTypes(response.data);
    } catch (error) {
      console.error('Error fetching property types:', error);
    }
  };
  
  // Fetch data sources for filter dropdown
  const fetchSources = async () => {
    try {
      const response = await axios.get(`${API}/property-sources`);
      setSources(response.data);
    } catch (error) {
      console.error('Error fetching sources:', error);
    }
  };
  
  // Fetch building outlines from OpenStreetMap
  const fetchBuildings = async () => {
    try {
      // Use a direct Overpass API call from the frontend
      const overpassUrl = "https://overpass-api.de/api/interpreter";
      const query = `
        [out:json];
        (
          way["building"](60.1,24.7,60.25,24.9);
          relation["building"](60.1,24.7,60.25,24.9);
        );
        out body;
        >;
        out skel qt;
      `;
      
      const response = await axios.post(overpassUrl, query, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });
      
      if (response.data && response.data.elements) {
        // Process the OSM data
        const nodes = {};
        const buildings = [];
        
        // First, index all nodes
        response.data.elements.forEach(element => {
          if (element.type === 'node') {
            nodes[element.id] = {
              lat: element.lat,
              lon: element.lon
            };
          }
        });
        
        // Then, process the ways (buildings)
        response.data.elements.forEach(element => {
          if (element.type === 'way' && element.tags && element.tags.building) {
            const coords = [];
            
            // Extract coordinates from nodes
            if (element.nodes) {
              element.nodes.forEach(nodeId => {
                if (nodes[nodeId]) {
                  coords.push([nodes[nodeId].lon, nodes[nodeId].lat]);
                }
              });
            }
            
            // Ensure the polygon is closed
            if (coords.length > 0 && coords[0] !== coords[coords.length - 1]) {
              coords.push(coords[0]);
            }
            
            // Only add if we have enough points for a polygon
            if (coords.length >= 4) {
              buildings.push({
                id: element.id,
                geometry: {
                  type: 'Polygon',
                  coordinates: [coords]
                },
                properties: {
                  name: element.tags.name || '',
                  building_type: element.tags.building || 'yes',
                  levels: element.tags['building:levels'] || '',
                  height: element.tags.height || '',
                  address: [element.tags['addr:street'], element.tags['addr:housenumber']]
                    .filter(Boolean)
                    .join(' ')
                }
              });
            }
          }
        });
        
        setBuildings(buildings);
        
        // Convert to GeoJSON format
        const geojson = {
          type: "FeatureCollection",
          features: buildings.map(building => ({
            type: "Feature",
            geometry: building.geometry,
            properties: {
              ...building.properties,
              id: building.id
            }
          }))
        };
        
        setBuildingsGeoJson(geojson);
        console.log(`Processed ${buildings.length} buildings from OpenStreetMap`);
      } else {
        console.error('Invalid response from Overpass API');
      }
    } catch (error) {
      console.error('Error fetching buildings:', error);
    }
  };
  
  // Fetch ROI analysis data
  const fetchRoiAnalysis = async () => {
    try {
      console.log('Getting ROI data from API');
      const response = await axios.get(`${API}/roi-analysis`);
      const data = response.data;
      console.log(`Got ${data.length} ROI data points from API`);
      setRoiData(data);
    } catch (error) {
      console.error('Error fetching ROI data:', error);
    }
  };
  
  // Handle file selection for CSV upload
  const handleFileSelect = (event) => {
    setCsvFile(event.target.files[0]);
  };
  
  // Handle CSV file upload
  const handleFileUpload = async () => {
    if (!csvFile) {
      setUploadError('Please select a CSV file to upload.');
      return;
    }
    
    setLoading(true);
    
    try {
      const formData = new FormData();
      formData.append('file', csvFile);
      
      const response = await axios.post(`${API}/properties/upload-csv`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });
      
      setUploadSuccess(true);
      setUploadError('');
      
      // Reset file input
      setCsvFile(null);
      document.getElementById('file-upload').value = '';
      
      // Refresh data
      fetchProperties();
      fetchRegionStats();
      fetchPropertyTypes();
      fetchSources();
      fetchRoiAnalysis();
      
      // Show success message
      setTimeout(() => {
        setUploadSuccess(false);
      }, 5000);
    } catch (error) {
      console.error('Error uploading CSV:', error);
      setUploadError(error.response?.data?.detail || 'Error uploading CSV file.');
    } finally {
      setLoading(false);
    }
  };
  
  // Handle filter changes
  const handleFilterChange = (key, value) => {
    setFilters({
      ...filters,
      [key]: value
    });
  };
  
  // Apply filters
  const applyFilters = () => {
    fetchProperties();
  };
  
  // Reset filters
  const resetFilters = () => {
    setFilters({
      price_min: '',
      price_max: '',
      property_type: '',
      area_min: '',
      area_max: '',
      rooms_min: '',
      rooms_max: '',
      is_for_sale: null,
      source: ''
    });
  };
  
  // Prepare data for heatmap
  const getHeatmapData = () => {
    if (!properties || properties.length === 0) return [];
    
    return properties.map(property => {
      if (!property.location || !property.location.coordinates) {
        console.warn("Property missing coordinates:", property);
        return null;
      }
      
      const coords = property.location.coordinates;
      let intensity = 1;
      
      // Adjust intensity based on selected metric
      if (heatmapMetric === 'price') {
        // For price heatmap, use higher values for higher prices
        intensity = property.is_for_sale ? 
          property.price / 1000000 :  // Scale down sale prices (typically higher)
          property.price / 3000;      // Scale down rental prices (typically lower)
      } else if (heatmapMetric === 'density') {
        // For density heatmap, use uniform intensity
        intensity = 1.5;
      }
      
      return [
        coords[1], // latitude
        coords[0], // longitude
        intensity
      ];
    }).filter(Boolean); // Remove null values
  };
  
  // Prepare building-ROI data for choropleth map
  const getBuildingRoiData = () => {
    if (!buildingsGeoJson || !roiData || roiData.length === 0) {
      console.log('Missing GeoJSON or ROI data for map visualization');
      return buildingsGeoJson;
    }
    
    // Clone the original buildings GeoJSON
    const enhancedGeoJson = JSON.parse(JSON.stringify(buildingsGeoJson));
    
    // Create a function to find the nearest ROI point
    const findNearestRoi = (buildingCenter) => {
      let nearest = null;
      let minDistance = Number.MAX_VALUE;
      
      roiData.forEach(roi => {
        const roiLat = roi.coordinates[1];
        const roiLng = roi.coordinates[0];
        
        // Calculate distance (simplified Euclidean)
        const distance = Math.sqrt(
          Math.pow(buildingCenter[0] - roiLng, 2) + 
          Math.pow(buildingCenter[1] - roiLat, 2)
        );
        
        if (distance < minDistance) {
          minDistance = distance;
          nearest = roi;
        }
      });
      
      // Only return if the nearest point is reasonably close (0.05 deg is roughly 5km)
      if (minDistance < 0.05) {
        return nearest;
      }
      return null;
    };
    
    // Process buildings
    let buildingsWithRoi = 0;
    
    enhancedGeoJson.features = enhancedGeoJson.features.map(feature => {
      // Skip if geometry is missing
      if (!feature.geometry || !feature.geometry.coordinates || !feature.geometry.coordinates[0]) {
        return feature;
      }
      
      // Calculate the center of the building polygon
      const coords = feature.geometry.coordinates[0];
      const center = coords.reduce(
        (acc, curr) => [
          acc[0] + curr[0] / coords.length, 
          acc[1] + curr[1] / coords.length
        ], 
        [0, 0]
      );
      
      // Find the nearest ROI data
      const nearestRoi = findNearestRoi(center);
      
      if (nearestRoi) {
        buildingsWithRoi++;
        return {
          ...feature,
          properties: {
            ...feature.properties,
            roi: nearestRoi.roi_years,
            avg_sale_price: nearestRoi.avg_sale_price,
            avg_rent: nearestRoi.avg_monthly_rent
          }
        };
      }
      
      return feature;
    });
    
    console.log(`Enhanced ${buildingsWithRoi} buildings with ROI data out of ${enhancedGeoJson.features.length} total`);
    
    return enhancedGeoJson;
  };
  
  // Prepare data for charts
  const getChartData = () => {
    if (!properties || properties.length === 0) {
      return {
        propertyTypeData: {
          labels: [],
          datasets: []
        },
        priceRangeData: {
          labels: [],
          datasets: []
        }
      };
    }
    
    // Property types pie chart
    const propertyTypeCounts = {};
    properties.forEach(property => {
      const type = property.property_type || 'Unknown';
      propertyTypeCounts[type] = (propertyTypeCounts[type] || 0) + 1;
    });
    
    const propertyTypeData = {
      labels: Object.keys(propertyTypeCounts),
      datasets: [
        {
          data: Object.values(propertyTypeCounts),
          backgroundColor: [
            '#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF',
            '#FF9F40', '#C9CBCF', '#7BC043', '#F37735', '#EFC94C'
          ],
          borderWidth: 1
        }
      ]
    };
    
    // Price ranges bar chart for sale properties
    const salePriceRanges = {
      '0-150k': 0,
      '150k-200k': 0,
      '200k-250k': 0,
      '250k-300k': 0,
      '300k-400k': 0,
      '400k+': 0
    };
    
    properties.filter(p => p.is_for_sale).forEach(property => {
      const price = property.price;
      if (price < 150000) salePriceRanges['0-150k']++;
      else if (price < 200000) salePriceRanges['150k-200k']++;
      else if (price < 250000) salePriceRanges['200k-250k']++;
      else if (price < 300000) salePriceRanges['250k-300k']++;
      else if (price < 400000) salePriceRanges['300k-400k']++;
      else salePriceRanges['400k+']++;
    });
    
    const priceRangeData = {
      labels: Object.keys(salePriceRanges),
      datasets: [
        {
          label: 'Number of Properties',
          data: Object.values(salePriceRanges),
          backgroundColor: '#36A2EB',
          borderColor: '#2980B9',
          borderWidth: 1
        }
      ]
    };
    
    return {
      propertyTypeData,
      priceRangeData
    };
  };
  
  // Charts configuration
  const { propertyTypeData, priceRangeData } = getChartData();
  
  return (
    <div className="dashboard">
      {/* Header */}
      <header className="glass-header text-white p-4 sticky top-0 z-10">
        <div className="container mx-auto flex justify-between items-center">
          <div className="flex items-center">
            <img src="/flippi-logo.svg" alt="Flippi Logo" className="flippi-logo" />
            <h1 className="text-2xl font-bold">Flippi Dashboard</h1>
          </div>
          <div className="flex space-x-2">
            <button 
              onClick={fetchProperties}
              className="glass-button px-3 py-2 rounded hover:bg-gray-700 flex items-center"
            >
              <ArrowPathIcon className="h-4 w-4 mr-1" />
              Refresh
            </button>
          </div>
        </div>
      </header>
      
      {/* Main content */}
      <main className="container mx-auto p-4">
        {/* Tabs */}
        <div className="flex border-b border-gray-700 mb-4">
          <button 
            className={`px-4 py-2 ${activeTab === 'map' ? 'active-tab' : 'inactive-tab'}`}
            onClick={() => setActiveTab('map')}
          >
            <div className="flex items-center">
              <MapIcon className="h-5 w-5 mr-1" />
              Map View
            </div>
          </button>
          <button 
            className={`px-4 py-2 ${activeTab === 'analytics' ? 'active-tab' : 'inactive-tab'}`}
            onClick={() => setActiveTab('analytics')}
          >
            <div className="flex items-center">
              <ChartBarIcon className="h-5 w-5 mr-1" />
              Analytics
            </div>
          </button>
          <button 
            className={`px-4 py-2 ${activeTab === 'data' ? 'active-tab' : 'inactive-tab'}`}
            onClick={() => setActiveTab('data')}
          >
            <div className="flex items-center">
              <ArrowUpTrayIcon className="h-5 w-5 mr-1" />
              Data Import
            </div>
          </button>
        </div>
        
        {/* Map View */}
        {activeTab === 'map' && (
          <div className="mt-4">
            <div className="grid grid-cols-12 gap-4">
              {/* Filters Panel - Left Side */}
              <div className="col-span-3 glass-card p-4">
                <h3 className="font-bold text-lg mb-4">Filters</h3>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">Property Type</label>
                    <select
                      value={filters.property_type}
                      onChange={(e) => handleFilterChange('property_type', e.target.value)}
                      className="glass-input w-full px-3 py-2 rounded"
                    >
                      <option value="">All Types</option>
                      {propertyTypes.map((type, index) => (
                        <option key={index} value={type}>{type}</option>
                      ))}
                    </select>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">Price Range</label>
                    <div className="flex space-x-2">
                      <input
                        type="number"
                        placeholder="Min"
                        value={filters.price_min}
                        onChange={(e) => handleFilterChange('price_min', e.target.value)}
                        className="glass-input w-full px-3 py-2 rounded"
                      />
                      <input
                        type="number"
                        placeholder="Max"
                        value={filters.price_max}
                        onChange={(e) => handleFilterChange('price_max', e.target.value)}
                        className="glass-input w-full px-3 py-2 rounded"
                      />
                    </div>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">Area (m²)</label>
                    <div className="flex space-x-2">
                      <input
                        type="number"
                        placeholder="Min"
                        value={filters.area_min}
                        onChange={(e) => handleFilterChange('area_min', e.target.value)}
                        className="glass-input w-full px-3 py-2 rounded"
                      />
                      <input
                        type="number"
                        placeholder="Max"
                        value={filters.area_max}
                        onChange={(e) => handleFilterChange('area_max', e.target.value)}
                        className="glass-input w-full px-3 py-2 rounded"
                      />
                    </div>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">Rooms</label>
                    <div className="flex space-x-2">
                      <input
                        type="number"
                        placeholder="Min"
                        value={filters.rooms_min}
                        onChange={(e) => handleFilterChange('rooms_min', e.target.value)}
                        className="glass-input w-full px-3 py-2 rounded"
                      />
                      <input
                        type="number"
                        placeholder="Max"
                        value={filters.rooms_max}
                        onChange={(e) => handleFilterChange('rooms_max', e.target.value)}
                        className="glass-input w-full px-3 py-2 rounded"
                      />
                    </div>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">Listing Type</label>
                    <select
                      value={filters.is_for_sale === null ? '' : filters.is_for_sale ? 'sale' : 'rent'}
                      onChange={(e) => {
                        if (e.target.value === '') {
                          handleFilterChange('is_for_sale', null);
                        } else {
                          handleFilterChange('is_for_sale', e.target.value === 'sale');
                        }
                      }}
                      className="glass-input w-full px-3 py-2 rounded"
                    >
                      <option value="">All</option>
                      <option value="sale">For Sale</option>
                      <option value="rent">For Rent</option>
                    </select>
                  </div>
                  
                  <div className="flex justify-end space-x-2 pt-4">
                    <button 
                      onClick={resetFilters}
                      className="glass-button px-4 py-2 text-sm rounded"
                    >
                      Reset
                    </button>
                    <button 
                      onClick={applyFilters}
                      className="glass-button px-4 py-2 text-sm rounded"
                    >
                      Apply Filters
                    </button>
                  </div>
                </div>
              </div>
              
              {/* Main Map Area - Center */}
              <div className="col-span-6">
                <div className="mb-4 flex justify-between items-center">
                  <div className="flex space-x-2">
                    <button 
                      className={`glass-button px-3 py-1 rounded ${mapMode === 'markers' ? 'bg-gray-600' : ''}`}
                      onClick={() => setMapMode('markers')}
                    >
                      Markers
                    </button>
                    <button 
                      className={`glass-button px-3 py-1 rounded ${mapMode === 'heatmap' ? 'bg-gray-600' : ''}`}
                      onClick={() => setMapMode('heatmap')}
                    >
                      Heat Map
                    </button>
                    <button 
                      className={`glass-button px-3 py-1 rounded ${mapMode === 'roi' ? 'bg-gray-600' : ''}`}
                      onClick={() => setMapMode('roi')}
                    >
                      ROI Map
                    </button>
                  </div>
                  
                  {mapMode === 'heatmap' && (
                    <div className="flex space-x-2">
                      <button 
                        className={`glass-button px-3 py-1 rounded ${heatmapMetric === 'price' ? 'bg-gray-600' : ''}`}
                        onClick={() => setHeatmapMetric('price')}
                      >
                        Price
                      </button>
                      <button 
                        className={`glass-button px-3 py-1 rounded ${heatmapMetric === 'density' ? 'bg-gray-600' : ''}`}
                        onClick={() => setHeatmapMetric('density')}
                      >
                        Density
                      </button>
                    </div>
                  )}
                </div>
                
                <div style={{ height: '70vh', width: '100%' }}>
                  <MapContainer 
                    center={ESPOO_CENTER} 
                    zoom={ESPOO_ZOOM} 
                    style={{ height: '100%', width: '100%' }}
                  >
                    {/* OpenStreetMap tile layer - using light gray style */}
                    <TileLayer
                      attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
                      url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
                    />
                    
                    {mapMode === 'markers' && properties.map((property, index) => (
                      <Marker 
                        key={property.id || index}
                        position={[property.location.coordinates[1], property.location.coordinates[0]]}
                      >
                        <Popup>
                          <div>
                            <h3 className="font-bold">{property.title}</h3>
                            <p className="text-lg">{property.price.toLocaleString()} {property.price_currency}</p>
                            <p>{property.property_type} - {property.area} m²</p>
                            <p className="text-sm text-gray-500">{property.location.address}</p>
                            <p className="text-sm text-gray-500">
                              {property.is_for_sale ? 'For Sale' : 'For Rent'}
                            </p>
                          </div>
                        </Popup>
                      </Marker>
                    ))}
                    
                    {mapMode === 'heatmap' && properties.length > 0 && (
                      <HeatmapLayer
                        points={getHeatmapData()}
                        longitudeExtractor={m => m[1]}
                        latitudeExtractor={m => m[0]}
                        intensityExtractor={m => m[2]}
                        radius={20}
                        max={10}
                        minOpacity={0.2}
                      />
                    )}
                    
                    {mapMode === 'roi' && getBuildingRoiData() && (
                      <GeoJSON 
                        data={getBuildingRoiData()}
                        style={(feature) => buildingStyle(feature, feature.properties.roi)}
                        onEachFeature={(feature, layer) => {
                          layer.on({
                            mouseover: (e) => {
                              const roi = feature.properties.roi;
                              let popup = `<strong>${feature.properties.name || feature.properties.address || 'Building'}</strong><br/>`;
                              
                              if (roi) {
                                popup += `ROI: ${roi.toFixed(1)} years`;
                              } else {
                                popup += 'No ROI data available';
                              }
                              
                              layer.bindTooltip(popup).openTooltip();
                            }
                          });
                        }}
                      />
                    )}
                    
                    {/* Update map bounds when GeoJSON data changes */}
                    {mapMode === 'roi' && getBuildingRoiData() && (
                      <GeoJsonUpdater data={getBuildingRoiData()} />
                    )}
                  </MapContainer>
                </div>
                
                {mapMode === 'roi' && (
                  <div className="mt-2 p-2 bg-gray-100 rounded flex items-center justify-center">
                    <div className="flex items-center space-x-8">
                      <span className="text-sm font-bold">ROI (years):</span>
                      <div className="flex items-center space-x-1">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: '#1a9850' }}></div>
                        <span className="text-xs">&lt;15</span>
                      </div>
                      <div className="flex items-center space-x-1">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: '#91cf60' }}></div>
                        <span className="text-xs">15-18</span>
                      </div>
                      <div className="flex items-center space-x-1">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: '#d9ef8b' }}></div>
                        <span className="text-xs">18-21</span>
                      </div>
                      <div className="flex items-center space-x-1">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: '#fee08b' }}></div>
                        <span className="text-xs">21-24</span>
                      </div>
                      <div className="flex items-center space-x-1">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: '#fc8d59' }}></div>
                        <span className="text-xs">24-27</span>
                      </div>
                      <div className="flex items-center space-x-1">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: '#d73027' }}></div>
                        <span className="text-xs">&gt;27</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
              
              {/* Stats Panel - Right Side */}
              <div className="col-span-3">
                <div className="space-y-4">
                  <div className="glass-card p-4">
                    <h3 className="font-bold text-lg mb-2">Property Count</h3>
                    {loading ? (
                      <p className="text-gray-500">Loading...</p>
                    ) : (
                      <p className="text-3xl font-bold text-gray-800">{properties.length}</p>
                    )}
                  </div>
                  
                  <div className="glass-card p-4">
                    <h3 className="font-bold text-lg mb-2">Average Sale Price</h3>
                    {loading ? (
                      <p className="text-gray-500">Loading...</p>
                    ) : (
                      <p className="text-3xl font-bold text-gray-800">
                        {(() => {
                          const saleProps = properties.filter(p => p.is_for_sale === true);
                          if (saleProps.length > 0) {
                            const avg = saleProps.reduce((sum, p) => sum + p.price, 0) / saleProps.length;
                            return avg.toLocaleString('fi-FI', { maximumFractionDigits: 0 });
                          }
                          return '0';
                        })()
                        } €
                      </p>
                    )}
                  </div>
                  
                  <div className="glass-card p-4">
                    <h3 className="font-bold text-lg mb-2">Average Rental Price</h3>
                    {loading ? (
                      <p className="text-gray-500">Loading...</p>
                    ) : (
                      <p className="text-3xl font-bold text-gray-800">
                        {(() => {
                          const rentalProps = properties.filter(p => p.is_for_sale === false);
                          if (rentalProps.length > 0) {
                            const avg = rentalProps.reduce((sum, p) => sum + p.price, 0) / rentalProps.length;
                            return avg.toLocaleString('fi-FI', { maximumFractionDigits: 0 });
                          }
                          return '0';
                        })()
                        } € /month
                      </p>
                    )}
                  </div>
                  
                  <div className="glass-card p-4">
                    <h3 className="font-bold text-lg mb-2">Average ROI</h3>
                    {loading ? (
                      <p className="text-gray-500">Loading...</p>
                    ) : (
                      <p className="text-3xl font-bold text-gray-800">
                        {roiData.length > 0
                          ? (roiData.reduce((sum, item) => sum + item.roi_years, 0) / roiData.length)
                              .toLocaleString('fi-FI', { maximumFractionDigits: 1 })
                          : '0'
                        } years
                      </p>
                    )}
                  </div>
                  
                  <div className="glass-card p-4">
                    <h3 className="font-bold text-lg mb-2">Property Types</h3>
                    <div style={{ height: '150px' }}>
                      <Pie 
                        data={propertyTypeData} 
                        options={{
                          maintainAspectRatio: false,
                          plugins: {
                            legend: {
                              position: 'right',
                              labels: {
                                boxWidth: 10,
                                font: {
                                  size: 10
                                }
                              }
                            }
                          }
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
        
        {/* Analytics View */}
        {activeTab === 'analytics' && (
          <div className="mt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* ROI Analysis */}
              <div className="glass-card p-4">
                <h3 className="font-bold text-lg mb-4">Return on Investment Analysis</h3>
                {loading ? (
                  <div className="flex justify-center items-center h-40">
                    <p>Loading ROI data...</p>
                  </div>
                ) : roiData.length > 0 ? (
                  <div className="overflow-auto max-h-96">
                    <table className="min-w-full">
                      <thead>
                        <tr className="bg-gray-100">
                          <th className="px-4 py-2 text-left">Address</th>
                          <th className="px-4 py-2 text-right">Avg. Sale Price</th>
                          <th className="px-4 py-2 text-right">Avg. Rent (Monthly)</th>
                          <th className="px-4 py-2 text-right">ROI (Years)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {roiData.sort((a, b) => a.roi_years - b.roi_years).slice(0, 50).map((item, index) => (
                          <tr key={index} className={index % 2 === 0 ? 'bg-gray-50' : ''}>
                            <td className="px-4 py-2">{item.address}</td>
                            <td className="px-4 py-2 text-right">
                              {item.avg_sale_price.toLocaleString('fi-FI', { maximumFractionDigits: 0 })} €
                            </td>
                            <td className="px-4 py-2 text-right">
                              {item.avg_monthly_rent.toLocaleString('fi-FI', { maximumFractionDigits: 0 })} €
                            </td>
                            <td className="px-4 py-2 text-right">
                              {item.roi_years.toFixed(1)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    
                    {roiData.length > 50 && (
                      <div className="mt-4 text-center text-gray-500">
                        Showing first 50 of {roiData.length} results.
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="p-4 bg-yellow-100 text-yellow-800 rounded">
                    <p>Загрузка данных об окупаемости...</p>
                    <p className="mt-2">Пожалуйста, дождитесь загрузки данных или перейдите на вкладку Data Import и нажмите "Import Sample Data".</p>
                  </div>
                )}
              </div>
              
              {/* Property Type Distribution */}
              <div className="glass-card p-4">
                <h3 className="font-bold text-lg mb-4">Property Type Distribution</h3>
                <div style={{ height: '300px' }}>
                  <Pie 
                    data={propertyTypeData} 
                    options={{
                      maintainAspectRatio: false,
                      plugins: {
                        legend: {
                          position: 'right',
                        }
                      }
                    }}
                  />
                </div>
              </div>
              
              {/* Price Range Distribution */}
              <div className="glass-card p-4 col-span-1 md:col-span-2">
                <h3 className="font-bold text-lg mb-4">Price Range Distribution (Sales)</h3>
                <div style={{ height: '300px' }}>
                  <Bar
                    data={priceRangeData}
                    options={{
                      maintainAspectRatio: false,
                      plugins: {
                        legend: {
                          display: false
                        },
                        title: {
                          display: true,
                          text: 'Number of Properties by Price Range',
                          color: '#333'
                        }
                      },
                      scales: {
                        y: {
                          beginAtZero: true,
                          ticks: {
                            color: '#333'
                          }
                        },
                        x: {
                          ticks: {
                            color: '#333'
                          }
                        }
                      }
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        )}
        
        {/* Data Import */}
        {activeTab === 'data' && (
          <div className="mt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* CSV Upload */}
              <div className="glass-card p-4">
                <h3 className="font-bold text-lg mb-4">Upload CSV Data</h3>
                <p className="mb-4 text-gray-600">
                  Upload a CSV file containing property data. The file should include columns for title, price, property type, 
                  location information (latitude, longitude, address, etc.), and listing type (sale/rent).
                </p>
                
                <div className="mb-4">
                  <input
                    id="file-upload"
                    type="file"
                    accept=".csv"
                    onChange={handleFileSelect}
                    className="text-sm text-gray-500
                    file:mr-4 file:py-2 file:px-4
                    file:rounded file:border-0
                    file:text-sm file:font-medium
                    file:bg-gray-800 file:text-white
                    hover:file:bg-gray-700"
                  />
                </div>
                
                <button
                  onClick={handleFileUpload}
                  disabled={!csvFile || loading}
                  className={`glass-button px-4 py-2 rounded flex items-center 
                    ${(!csvFile || loading) ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <ArrowUpTrayIcon className="h-5 w-5 mr-2" />
                  {loading ? 'Uploading...' : 'Upload Data'}
                </button>
                
                {uploadSuccess && (
                  <div className="mt-4 p-2 bg-green-100 text-green-800 rounded">
                    CSV file uploaded successfully!
                  </div>
                )}
                
                {uploadError && (
                  <div className="mt-4 p-2 bg-red-100 text-red-800 rounded">
                    {uploadError}
                  </div>
                )}
              </div>
              
              {/* Import Default Data */}
              <div className="bg-white rounded shadow p-4">
                <h3 className="font-bold text-lg mb-4">Import Sample Data</h3>
                <p className="mb-4 text-gray-600">
                  Import the sample dataset of Espoo properties. This includes both sales and rental data,
                  with information about property prices, locations, and characteristics.
                </p>
                
                <button
                  onClick={importDefaultData}
                  disabled={loading}
                  className={`bg-indigo-600 text-white px-4 py-2 rounded hover:bg-indigo-700 flex items-center 
                    ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <ArrowUpTrayIcon className="h-5 w-5 mr-2" />
                  {loading ? 'Importing...' : 'Import Sample Data'}
                </button>
                
                {dataImported && (
                  <div className="mt-4 p-2 bg-green-100 text-green-800 rounded">
                    Sample data imported successfully!
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Dashboard />} />
        </Routes>
      </BrowserRouter>
    </div>
  );
}

export default App;
