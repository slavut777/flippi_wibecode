import { useState, useEffect } from "react";
import "./App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import axios from "axios";
import { MapContainer, TileLayer, Marker, Popup, GeoJSON } from 'react-leaflet';
import { Heatmap } from 'react-leaflet-heatmap-layer-v3';
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

// Define France as initial map center
const FRANCE_CENTER = [46.603354, 1.888334]; // Center of France
const FRANCE_ZOOM = 6;

const Dashboard = () => {
  // State variables
  const [properties, setProperties] = useState([]);
  const [regionStats, setRegionStats] = useState([]);
  const [propertyTypes, setPropertyTypes] = useState([]);
  const [sources, setSources] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('map');
  const [mapMode, setMapMode] = useState('markers'); // markers, heatmap, or choropleth
  const [heatmapMetric, setHeatmapMetric] = useState('price'); // price, roi
  const [mapTooltip, setMapTooltip] = useState('');
  
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
  
  // Modal state
  const [showFiltersModal, setShowFiltersModal] = useState(false);
  
  // Load initial data
  useEffect(() => {
    fetchProperties();
    fetchRegionStats();
    fetchPropertyTypes();
    fetchSources();
  }, []);
  
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
      
      const response = await axios.get(`${API}/properties?${queryParams.toString()}`);
      setProperties(response.data);
      
      // Prepare data for heatmap
      if (response.data.length > 0) {
        // Additional data processing if needed
      }
    } catch (error) {
      console.error('Error fetching properties:', error);
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
    setShowFiltersModal(false);
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
      const coords = property.location.coordinates;
      let intensity = 1;
      
      // Adjust intensity based on selected metric
      if (heatmapMetric === 'price') {
        intensity = property.price / 10000; // Scale down prices for better visualization
      }
      
      return [
        coords[1], // latitude
        coords[0], // longitude
        intensity
      ];
    });
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
    
    // Price ranges bar chart
    const priceRanges = {
      '0-100k': 0,
      '100k-200k': 0,
      '200k-300k': 0,
      '300k-400k': 0,
      '400k-500k': 0,
      '500k+': 0
    };
    
    properties.forEach(property => {
      const price = property.price;
      if (price < 100000) priceRanges['0-100k']++;
      else if (price < 200000) priceRanges['100k-200k']++;
      else if (price < 300000) priceRanges['200k-300k']++;
      else if (price < 400000) priceRanges['300k-400k']++;
      else if (price < 500000) priceRanges['400k-500k']++;
      else priceRanges['500k+']++;
    });
    
    const priceRangeData = {
      labels: Object.keys(priceRanges),
      datasets: [
        {
          label: 'Number of Properties',
          data: Object.values(priceRanges),
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
      <header className="bg-indigo-600 text-white p-4">
        <div className="container mx-auto flex justify-between items-center">
          <h1 className="text-2xl font-bold">Location Intelligence Dashboard</h1>
          <div className="flex space-x-2">
            <button 
              onClick={() => setShowFiltersModal(true)}
              className="px-3 py-2 bg-indigo-700 rounded hover:bg-indigo-800 flex items-center"
            >
              <ChevronDownIcon className="h-4 w-4 mr-1" />
              Filters
            </button>
            <button 
              onClick={fetchProperties}
              className="px-3 py-2 bg-indigo-700 rounded hover:bg-indigo-800 flex items-center"
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
        <div className="flex border-b">
          <button 
            className={`px-4 py-2 ${activeTab === 'map' ? 'border-b-2 border-indigo-500 text-indigo-500' : 'text-gray-500'}`}
            onClick={() => setActiveTab('map')}
          >
            <div className="flex items-center">
              <MapIcon className="h-5 w-5 mr-1" />
              Map View
            </div>
          </button>
          <button 
            className={`px-4 py-2 ${activeTab === 'analytics' ? 'border-b-2 border-indigo-500 text-indigo-500' : 'text-gray-500'}`}
            onClick={() => setActiveTab('analytics')}
          >
            <div className="flex items-center">
              <ChartBarIcon className="h-5 w-5 mr-1" />
              Analytics
            </div>
          </button>
          <button 
            className={`px-4 py-2 ${activeTab === 'data' ? 'border-b-2 border-indigo-500 text-indigo-500' : 'text-gray-500'}`}
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
            <div className="mb-4 flex space-x-2">
              <div className="flex space-x-2">
                <button 
                  className={`px-3 py-1 rounded ${mapMode === 'markers' ? 'bg-indigo-100 text-indigo-800' : 'bg-gray-100'}`}
                  onClick={() => setMapMode('markers')}
                >
                  Markers
                </button>
                <button 
                  className={`px-3 py-1 rounded ${mapMode === 'heatmap' ? 'bg-indigo-100 text-indigo-800' : 'bg-gray-100'}`}
                  onClick={() => setMapMode('heatmap')}
                >
                  Heat Map
                </button>
                <button 
                  className={`px-3 py-1 rounded ${mapMode === 'choropleth' ? 'bg-indigo-100 text-indigo-800' : 'bg-gray-100'}`}
                  onClick={() => setMapMode('choropleth')}
                >
                  Choropleth
                </button>
              </div>
              
              {mapMode === 'heatmap' && (
                <div className="flex space-x-2">
                  <button 
                    className={`px-3 py-1 rounded ${heatmapMetric === 'price' ? 'bg-indigo-100 text-indigo-800' : 'bg-gray-100'}`}
                    onClick={() => setHeatmapMetric('price')}
                  >
                    Price
                  </button>
                  <button 
                    className={`px-3 py-1 rounded ${heatmapMetric === 'roi' ? 'bg-indigo-100 text-indigo-800' : 'bg-gray-100'}`}
                    onClick={() => setHeatmapMetric('roi')}
                  >
                    ROI
                  </button>
                </div>
              )}
            </div>
            
            <div style={{ height: '70vh', width: '100%' }}>
              <MapContainer 
                center={FRANCE_CENTER} 
                zoom={FRANCE_ZOOM} 
                style={{ height: '100%', width: '100%' }}
              >
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
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
                        <p>{property.rooms} rooms, {property.bathrooms} bathrooms</p>
                        <p className="text-sm text-gray-500">{property.location.address}, {property.location.city}</p>
                        <p className="text-sm text-gray-500">{property.source}</p>
                        {property.url && (
                          <a 
                            href={property.url} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-blue-500 hover:underline"
                          >
                            View Listing
                          </a>
                        )}
                      </div>
                    </Popup>
                  </Marker>
                ))}
                
                {mapMode === 'heatmap' && (
                  <Heatmap
                    points={getHeatmapData()}
                    longitudeExtractor={m => m[1]}
                    latitudeExtractor={m => m[0]}
                    intensityExtractor={m => m[2]}
                    radius={20}
                    max={10}
                    minOpacity={0.2}
                  />
                )}
                
                {mapMode === 'choropleth' && regionStats.length > 0 && (
                  <div className="absolute top-2 right-2 z-50 bg-white p-2 rounded shadow">
                    <p className="text-sm font-bold">ROI by Region (Years)</p>
                    <div className="flex flex-col space-y-1 mt-1">
                      {regionStats.map((region, i) => (
                        <div key={i} className="flex items-center space-x-2">
                          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: getColorForROI(region.roi_years) }}></div>
                          <span className="text-xs">{region.region_name}: {region.roi_years ? region.roi_years.toFixed(1) : 'N/A'}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </MapContainer>
            </div>
            
            {mapTooltip && (
              <div className="mt-2 p-2 bg-gray-100 rounded text-sm">{mapTooltip}</div>
            )}
            
            <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-white rounded shadow p-4">
                <h3 className="font-bold text-lg mb-2">Property Count</h3>
                <p className="text-3xl font-bold text-indigo-600">{properties.length}</p>
              </div>
              
              <div className="bg-white rounded shadow p-4">
                <h3 className="font-bold text-lg mb-2">Average Sale Price</h3>
                <p className="text-3xl font-bold text-indigo-600">
                  {properties.length > 0 
                    ? (properties
                        .filter(p => p.is_for_sale)
                        .reduce((sum, p) => sum + p.price, 0) / 
                        properties.filter(p => p.is_for_sale).length
                      ).toLocaleString('fr-FR', { maximumFractionDigits: 0 })
                    : '0'
                  } €
                </p>
              </div>
              
              <div className="bg-white rounded shadow p-4">
                <h3 className="font-bold text-lg mb-2">Average Rental Price</h3>
                <p className="text-3xl font-bold text-indigo-600">
                  {properties.length > 0 && properties.filter(p => !p.is_for_sale).length > 0
                    ? (properties
                        .filter(p => !p.is_for_sale)
                        .reduce((sum, p) => sum + p.price, 0) / 
                        properties.filter(p => !p.is_for_sale).length
                      ).toLocaleString('fr-FR', { maximumFractionDigits: 0 })
                    : '0'
                  } € /month
                </p>
              </div>
            </div>
          </div>
        )}
        
        {/* Analytics View */}
        {activeTab === 'analytics' && (
          <div className="mt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Region Statistics */}
              <div className="bg-white rounded shadow p-4">
                <h3 className="font-bold text-lg mb-4">Return on Investment by Region</h3>
                <div className="overflow-auto max-h-96">
                  <table className="min-w-full">
                    <thead>
                      <tr className="bg-gray-100">
                        <th className="px-4 py-2 text-left">Region</th>
                        <th className="px-4 py-2 text-right">Avg. Sale Price</th>
                        <th className="px-4 py-2 text-right">Avg. Rent (Monthly)</th>
                        <th className="px-4 py-2 text-right">ROI (Years)</th>
                        <th className="px-4 py-2 text-right">Properties</th>
                      </tr>
                    </thead>
                    <tbody>
                      {regionStats.sort((a, b) => (a.roi_years || 999) - (b.roi_years || 999)).map((region, index) => (
                        <tr key={index} className={index % 2 === 0 ? 'bg-gray-50' : ''}>
                          <td className="px-4 py-2">{region.region_name}</td>
                          <td className="px-4 py-2 text-right">
                            {region.avg_sale_price 
                              ? region.avg_sale_price.toLocaleString('fr-FR', { maximumFractionDigits: 0 }) + ' €' 
                              : '-'
                            }
                          </td>
                          <td className="px-4 py-2 text-right">
                            {region.avg_rent_price 
                              ? region.avg_rent_price.toLocaleString('fr-FR', { maximumFractionDigits: 0 }) + ' €' 
                              : '-'
                            }
                          </td>
                          <td className="px-4 py-2 text-right">
                            {region.roi_years 
                              ? region.roi_years.toFixed(1) 
                              : '-'
                            }
                          </td>
                          <td className="px-4 py-2 text-right">{region.property_count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              
              {/* Property Type Distribution */}
              <div className="bg-white rounded shadow p-4">
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
              <div className="bg-white rounded shadow p-4 col-span-1 md:col-span-2">
                <h3 className="font-bold text-lg mb-4">Price Range Distribution</h3>
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
                          text: 'Number of Properties by Price Range'
                        }
                      },
                      scales: {
                        y: {
                          beginAtZero: true
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
              <div className="bg-white rounded shadow p-4">
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
                    file:bg-indigo-50 file:text-indigo-700
                    hover:file:bg-indigo-100"
                  />
                </div>
                
                <button
                  onClick={handleFileUpload}
                  disabled={!csvFile || loading}
                  className={`bg-indigo-600 text-white px-4 py-2 rounded hover:bg-indigo-700 flex items-center 
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
              
              {/* Sample CSV Template */}
              <div className="bg-white rounded shadow p-4">
                <h3 className="font-bold text-lg mb-4">CSV Template</h3>
                <p className="mb-4 text-gray-600">
                  Use this template for your CSV file. The minimum required fields are title, price, latitude, and longitude.
                </p>
                
                <div className="overflow-auto max-h-64 border rounded">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">title</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">price</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">currency</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">property_type</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">area</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">rooms</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">bathrooms</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">latitude</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">longitude</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">address</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">city</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">region</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">postal_code</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">listing_type</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">source</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">url</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      <tr>
                        <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-500">Apartment in Paris</td>
                        <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-500">250000</td>
                        <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-500">EUR</td>
                        <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-500">Apartment</td>
                        <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-500">75</td>
                        <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-500">3</td>
                        <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-500">1</td>
                        <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-500">48.8566</td>
                        <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-500">2.3522</td>
                        <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-500">123 Rue Example</td>
                        <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-500">Paris</td>
                        <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-500">Île-de-France</td>
                        <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-500">75001</td>
                        <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-500">sale</td>
                        <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-500">leboncoin</td>
                        <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-500">https://example.com/listing/123</td>
                      </tr>
                      <tr>
                        <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-500">Studio for rent</td>
                        <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-500">800</td>
                        <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-500">EUR</td>
                        <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-500">Studio</td>
                        <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-500">30</td>
                        <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-500">1</td>
                        <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-500">1</td>
                        <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-500">48.8744</td>
                        <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-500">2.3526</td>
                        <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-500">456 Blvd Sample</td>
                        <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-500">Paris</td>
                        <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-500">Île-de-France</td>
                        <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-500">75002</td>
                        <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-500">rent</td>
                        <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-500">idealista</td>
                        <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-500">https://example.com/listing/456</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                
                <button
                  onClick={() => {
                    // Create CSV content
                    const csvContent = [
                      'title,price,currency,property_type,area,rooms,bathrooms,latitude,longitude,address,city,region,postal_code,listing_type,source,url',
                      'Apartment in Paris,250000,EUR,Apartment,75,3,1,48.8566,2.3522,123 Rue Example,Paris,Île-de-France,75001,sale,leboncoin,https://example.com/listing/123',
                      'Studio for rent,800,EUR,Studio,30,1,1,48.8744,2.3526,456 Blvd Sample,Paris,Île-de-France,75002,rent,idealista,https://example.com/listing/456'
                    ].join('\n');
                    
                    // Create and download the CSV file
                    const blob = new Blob([csvContent], { type: 'text/csv' });
                    const url = window.URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.setAttribute('hidden', '');
                    a.setAttribute('href', url);
                    a.setAttribute('download', 'property_template.csv');
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                  }}
                  className="mt-4 bg-gray-100 text-gray-700 px-4 py-2 rounded hover:bg-gray-200"
                >
                  Download Template
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
      
      {/* Filters Modal */}
      {showFiltersModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-lg">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-lg">Filter Properties</h3>
              <button onClick={() => setShowFiltersModal(false)}>
                <XMarkIcon className="h-5 w-5 text-gray-500" />
              </button>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Price Range</label>
                <div className="flex space-x-2">
                  <input
                    type="number"
                    placeholder="Min"
                    value={filters.price_min}
                    onChange={(e) => handleFilterChange('price_min', e.target.value)}
                    className="w-full px-2 py-1 border rounded"
                  />
                  <input
                    type="number"
                    placeholder="Max"
                    value={filters.price_max}
                    onChange={(e) => handleFilterChange('price_max', e.target.value)}
                    className="w-full px-2 py-1 border rounded"
                  />
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Property Type</label>
                <select
                  value={filters.property_type}
                  onChange={(e) => handleFilterChange('property_type', e.target.value)}
                  className="w-full px-2 py-1 border rounded"
                >
                  <option value="">All Types</option>
                  {propertyTypes.map((type, index) => (
                    <option key={index} value={type}>{type}</option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Area (m²)</label>
                <div className="flex space-x-2">
                  <input
                    type="number"
                    placeholder="Min"
                    value={filters.area_min}
                    onChange={(e) => handleFilterChange('area_min', e.target.value)}
                    className="w-full px-2 py-1 border rounded"
                  />
                  <input
                    type="number"
                    placeholder="Max"
                    value={filters.area_max}
                    onChange={(e) => handleFilterChange('area_max', e.target.value)}
                    className="w-full px-2 py-1 border rounded"
                  />
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Rooms</label>
                <div className="flex space-x-2">
                  <input
                    type="number"
                    placeholder="Min"
                    value={filters.rooms_min}
                    onChange={(e) => handleFilterChange('rooms_min', e.target.value)}
                    className="w-full px-2 py-1 border rounded"
                  />
                  <input
                    type="number"
                    placeholder="Max"
                    value={filters.rooms_max}
                    onChange={(e) => handleFilterChange('rooms_max', e.target.value)}
                    className="w-full px-2 py-1 border rounded"
                  />
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Listing Type</label>
                <select
                  value={filters.is_for_sale === null ? '' : filters.is_for_sale ? 'sale' : 'rent'}
                  onChange={(e) => {
                    if (e.target.value === '') {
                      handleFilterChange('is_for_sale', null);
                    } else {
                      handleFilterChange('is_for_sale', e.target.value === 'sale');
                    }
                  }}
                  className="w-full px-2 py-1 border rounded"
                >
                  <option value="">All</option>
                  <option value="sale">For Sale</option>
                  <option value="rent">For Rent</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Source</label>
                <select
                  value={filters.source}
                  onChange={(e) => handleFilterChange('source', e.target.value)}
                  className="w-full px-2 py-1 border rounded"
                >
                  <option value="">All Sources</option>
                  {sources.map((source, index) => (
                    <option key={index} value={source}>{source}</option>
                  ))}
                </select>
              </div>
            </div>
            
            <div className="flex justify-end space-x-2 mt-6">
              <button 
                onClick={resetFilters}
                className="px-4 py-2 bg-gray-100 rounded hover:bg-gray-200"
              >
                Reset
              </button>
              <button 
                onClick={applyFilters}
                className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700"
              >
                Apply Filters
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Helper function to get color for ROI values (for choropleth map)
const getColorForROI = (roi) => {
  if (!roi) return '#CCCCCC'; // gray for no data
  
  if (roi < 10) return '#1a9850'; // green (good)
  if (roi < 15) return '#91cf60';
  if (roi < 20) return '#d9ef8b';
  if (roi < 25) return '#fee08b';
  if (roi < 30) return '#fc8d59';
  return '#d73027'; // red (poor)
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
