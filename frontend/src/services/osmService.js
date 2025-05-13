import axios from 'axios';
import overpass from 'query-overpass';
import { promisify } from 'util';

// Convert Overpass query to promise
const overpassQueryPromise = promisify(overpass);

// Modified function to fetch building outlines from OpenStreetMap
export async function fetchBuildingsFromOSM(bounds) {
  const { south, west, north, east } = bounds;
  
  try {
    // Overpass API query for buildings in the given area
    const query = `
      [out:json];
      (
        way["building"]({south},{west},{north},{east});
        relation["building"]({south},{west},{north},{east});
      );
      out body;
      >;
      out skel qt;
    `;
    
    const result = await overpassQueryPromise(query);
    
    // Convert to GeoJSON
    return {
      type: "FeatureCollection",
      features: result.features.filter(feature => 
        feature.geometry.type === 'Polygon' || feature.geometry.type === 'MultiPolygon'
      )
    };
  } catch (error) {
    console.error('Error fetching buildings from OSM:', error);
    
    // Fallback to sample buildings if the query fails
    return getSampleBuildings();
  }
}

// Fallback sample buildings
function getSampleBuildings() {
  return {
    type: "FeatureCollection",
    features: [
      // Add a few sample buildings in Espoo for fallback
      {
        type: "Feature",
        properties: { 
          id: "sample1",
          name: "Sample Building 1",
          building: "residential"
        },
        geometry: {
          type: "Polygon",
          coordinates: [[[24.77, 60.17], [24.775, 60.17], [24.775, 60.175], [24.77, 60.175], [24.77, 60.17]]]
        }
      },
      // Add more sample buildings here
    ]
  };
}