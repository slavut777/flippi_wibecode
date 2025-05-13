from fastapi import FastAPI, APIRouter, HTTPException, UploadFile, File, Form, Depends, Query
from fastapi.responses import JSONResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional, Dict, Any, Union
import uuid
from datetime import datetime
import pandas as pd
import numpy as np
import json
import aiohttp
from bs4 import BeautifulSoup
import io
import re
import asyncio
from aiohttp import ClientSession
import csv
import overpy

# Root directory and environment variables
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ.get('DB_NAME', 'real_estate_db')]

# Create the main app without a prefix
app = FastAPI(title="Location Intelligence Dashboard")

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Define Models
class Property(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    title: str
    price: float
    price_currency: str = "EUR"
    property_type: str
    area: Optional[float] = None
    rooms: Optional[int] = None
    bathrooms: Optional[int] = None
    location: dict
    source: str
    url: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    is_for_sale: bool = True

class PropertyCreate(BaseModel):
    title: str
    price: float
    price_currency: str = "EUR"
    property_type: str
    area: Optional[float] = None
    rooms: Optional[int] = None
    bathrooms: Optional[int] = None
    location: dict
    source: str
    url: Optional[str] = None
    is_for_sale: bool = True

class PropertyFilter(BaseModel):
    price_min: Optional[float] = None
    price_max: Optional[float] = None
    property_type: Optional[str] = None
    area_min: Optional[float] = None
    area_max: Optional[float] = None
    rooms_min: Optional[int] = None
    rooms_max: Optional[int] = None
    is_for_sale: Optional[bool] = None
    source: Optional[str] = None

class RegionData(BaseModel):
    region_name: str
    avg_sale_price: Optional[float] = None
    avg_rent_price: Optional[float] = None
    roi_years: Optional[float] = None
    property_count: int = 0

class Building(BaseModel):
    id: str
    geometry: Dict[str, Any]
    properties: Dict[str, Any]

# Utils for parsing CSV
def parse_csv_to_properties(csv_content, is_rental=False):
    try:
        df = pd.read_csv(io.StringIO(csv_content.decode('utf-8')))
        
        # Map CSV columns to our property model
        properties = []
        
        for _, row in df.iterrows():
            # Extract coordinates
            lat = row.get('latitude', None)
            lng = row.get('longitude', None)
            
            if pd.isna(lat) or pd.isna(lng):
                # Skip entries without valid coordinates
                continue
            
            # Get other properties    
            price = float(row.get('price', 0))
            square_meters = float(row.get('square', 0)) if not pd.isna(row.get('square', None)) else None
            rooms = int(row.get('rooms', 0)) if not pd.isna(row.get('rooms', None)) else None
            address = row.get('address', '')
            house_type = row.get('house_type', '')
            building_type = row.get('building_type', '')
            year = row.get('year_of_construction', None)
            
            # Create property object
            property_data = {
                "title": address,
                "price": price,
                "price_currency": "EUR",
                "property_type": f"{rooms} Room {building_type}",
                "area": square_meters,
                "rooms": rooms,
                "bathrooms": 1,  # Default value
                "location": {
                    "type": "Point",
                    "coordinates": [float(lng), float(lat)],
                    "address": address,
                    "city": "Espoo",
                    "region": "Espoo",
                    "postal_code": ""
                },
                "source": "rental_data" if is_rental else "sales_data",
                "url": None,
                "is_for_sale": not is_rental,
                "year_built": year if not pd.isna(year) else None,
                "house_type": house_type,
                "building_type": building_type,
                "has_sauna": row.get('sauna', False) if not pd.isna(row.get('sauna', None)) else False
            }
            
            # Add property ID
            property_data["id"] = str(uuid.uuid4())
            
            # Add timestamps
            property_data["created_at"] = datetime.utcnow()
            property_data["updated_at"] = datetime.utcnow()
            
            properties.append(property_data)
        
        if not properties:
            logging.warning("No valid properties found in CSV data")
        
        return properties
    except Exception as e:
        logging.error(f"Error parsing CSV: {str(e)}", exc_info=True)
        raise HTTPException(status_code=400, detail=f"Error parsing CSV file: {str(e)}")

# Utility function to fetch building outlines from OpenStreetMap
async def fetch_buildings_from_osm(south, west, north, east):
    try:
        logging.info(f"Fetching buildings from OSM: {south}, {west}, {north}, {east}")
        
        # Use aiohttp to make an async request to the Overpass API
        async with aiohttp.ClientSession() as session:
            # Construct the Overpass query for buildings
            overpass_url = "https://overpass-api.de/api/interpreter"
            overpass_query = f"""
            [out:json];
            (
              way["building"]({south},{west},{north},{east});
              relation["building"]({south},{west},{north},{east});
            );
            out body;
            >;
            out skel qt;
            """
            
            # Make the request
            async with session.post(overpass_url, data={"data": overpass_query}) as response:
                if response.status != 200:
                    logging.error(f"Error from Overpass API: {response.status}")
                    return []
                
                data = await response.json()
                
                # Process the OSM data into GeoJSON features
                buildings = []
                nodes = {}
                
                # First, store all nodes
                for element in data.get("elements", []):
                    if element["type"] == "node":
                        nodes[element["id"]] = {
                            "lat": element["lat"],
                            "lon": element["lon"]
                        }
                
                # Then process ways (buildings)
                for element in data.get("elements", []):
                    if element["type"] == "way" and "tags" in element and "building" in element["tags"]:
                        # Extract coordinates from nodes
                        coords = []
                        for node_id in element["nodes"]:
                            if node_id in nodes:
                                node = nodes[node_id]
                                coords.append([node["lon"], node["lat"]])
                        
                        # Ensure the polygon is closed
                        if coords and coords[0] != coords[-1]:
                            coords.append(coords[0])
                        
                        # Only add if we have enough points for a polygon
                        if len(coords) >= 4:  # Need at least 4 points for a closed triangle
                            building = {
                                "id": str(element["id"]),
                                "geometry": {
                                    "type": "Polygon",
                                    "coordinates": [coords]
                                },
                                "properties": {
                                    "name": element["tags"].get("name", ""),
                                    "building_type": element["tags"].get("building", "yes"),
                                    "levels": element["tags"].get("building:levels", ""),
                                    "height": element["tags"].get("height", ""),
                                    "address": (
                                        element["tags"].get("addr:street", "") + " " + 
                                        element["tags"].get("addr:housenumber", "")
                                    ).strip()
                                }
                            }
                            buildings.append(building)
                
                logging.info(f"Found {len(buildings)} buildings in OSM data")
                return buildings
    except Exception as e:
        logging.error(f"Error fetching buildings from OSM: {str(e)}", exc_info=True)
        return []

# Add routes to the router
@api_router.get("/")
async def root():
    return {"message": "Location Intelligence Dashboard API"}

# Upload CSV file with property data
@api_router.post("/properties/upload-csv")
async def upload_csv(file: UploadFile = File(...)):
    try:
        # Read the CSV file
        csv_content = await file.read()
        
        # Parse the CSV into a list of property objects
        properties = parse_csv_to_properties(csv_content)
        
        # Save to database
        if properties:
            await db.properties.insert_many(properties)
            return {"message": f"Successfully imported {len(properties)} properties"}
        else:
            raise HTTPException(status_code=400, detail="No valid properties found in the CSV file")
    except Exception as e:
        logging.error(f"Error processing CSV file: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error processing CSV file: {str(e)}")

# Direct import of the provided CSV files
@api_router.post("/import-default-data")
async def import_default_data():
    try:
        # Delete existing data
        delete_result = await db.properties.delete_many({})
        logging.info(f"Deleted {delete_result.deleted_count} existing properties")
        
        # Import sales data
        with open('/app/sales_data.csv', 'r') as f:
            sales_content = f.read().encode('utf-8')
            sales_properties = parse_csv_to_properties(sales_content, is_rental=False)
            
            if sales_properties:
                logging.info(f"Importing {len(sales_properties)} sales properties")
                # Debug the first property
                if len(sales_properties) > 0:
                    logging.info(f"Sample sale property: {sales_properties[0]}")
                
                result = await db.properties.insert_many(sales_properties)
                logging.info(f"Inserted {len(result.inserted_ids)} sales properties")
        
        # Import rental data
        with open('/app/rental_data.csv', 'r') as f:
            rental_content = f.read().encode('utf-8')
            rental_properties = parse_csv_to_properties(rental_content, is_rental=True)
            
            if rental_properties:
                logging.info(f"Importing {len(rental_properties)} rental properties")
                # Debug the first property
                if len(rental_properties) > 0:
                    logging.info(f"Sample rental property: {rental_properties[0]}")
                
                result = await db.properties.insert_many(rental_properties)
                logging.info(f"Inserted {len(result.inserted_ids)} rental properties")
        
        # Verify data was imported
        count = await db.properties.count_documents({})
        sale_count = await db.properties.count_documents({"is_for_sale": True})
        rental_count = await db.properties.count_documents({"is_for_sale": False})
        logging.info(f"Total properties in database after import: {count} (sales: {sale_count}, rentals: {rental_count})")
        
        return {"message": f"Successfully imported {count} properties ({sale_count} sales, {rental_count} rentals)"}
    except Exception as e:
        logging.error(f"Error importing default data: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error importing default data: {str(e)}")

# Get all properties with optional filtering
@api_router.get("/properties")
async def get_properties(
    price_min: Optional[float] = None,
    price_max: Optional[float] = None,
    property_type: Optional[str] = None,
    area_min: Optional[float] = None,
    area_max: Optional[float] = None,
    rooms_min: Optional[int] = None,
    rooms_max: Optional[int] = None,
    is_for_sale: Optional[bool] = None,
    source: Optional[str] = None,
    limit: int = 1000,
    skip: int = 0
):
    # Build filter criteria
    filter_criteria = {}
    
    if price_min is not None:
        filter_criteria["price"] = {"$gte": price_min}
    if price_max is not None:
        if "price" in filter_criteria:
            filter_criteria["price"]["$lte"] = price_max
        else:
            filter_criteria["price"] = {"$lte": price_max}
            
    if property_type:
        filter_criteria["property_type"] = property_type
        
    if area_min is not None:
        filter_criteria["area"] = {"$gte": area_min}
    if area_max is not None:
        if "area" in filter_criteria:
            filter_criteria["area"]["$lte"] = area_max
        else:
            filter_criteria["area"] = {"$lte": area_max}
            
    if rooms_min is not None:
        filter_criteria["rooms"] = {"$gte": rooms_min}
    if rooms_max is not None:
        if "rooms" in filter_criteria:
            filter_criteria["rooms"]["$lte"] = rooms_max
        else:
            filter_criteria["rooms"] = {"$lte": rooms_max}
            
    if is_for_sale is not None:
        filter_criteria["is_for_sale"] = is_for_sale
        
    if source:
        filter_criteria["source"] = source
    
    # Query database
    cursor = db.properties.find(filter_criteria).skip(skip).limit(limit)
    
    # Convert MongoDB documents to dictionaries
    properties = []
    async for doc in cursor:
        # Convert ObjectId to string if needed
        if '_id' in doc:
            doc['_id'] = str(doc['_id'])
        properties.append(doc)
    
    return properties

# Get property by ID
@api_router.get("/properties/{property_id}")
async def get_property(property_id: str):
    property_data = await db.properties.find_one({"id": property_id})
    
    if property_data:
        # Convert ObjectId to string if needed
        if '_id' in property_data:
            property_data['_id'] = str(property_data['_id'])
        return property_data
    else:
        raise HTTPException(status_code=404, detail="Property not found")

# Add a new property
@api_router.post("/properties", response_model=Property)
async def create_property(property_data: PropertyCreate):
    property_obj = Property(**property_data.dict())
    
    # Convert to dict for MongoDB
    property_dict = property_obj.dict()
    
    # Insert into database
    await db.properties.insert_one(property_dict)
    
    return property_obj

# Delete a property
@api_router.delete("/properties/{property_id}")
async def delete_property(property_id: str):
    result = await db.properties.delete_one({"id": property_id})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Property not found")
    
    return {"message": "Property deleted successfully"}

# Get property statistics by region
@api_router.get("/properties/stats/regions")
async def get_region_stats():
    # Pipeline to calculate average prices and counts by region
    pipeline = [
        {
            "$group": {
                "_id": "$location.region",
                "avg_sale_price": {
                    "$avg": {
                        "$cond": [
                            {"$eq": ["$is_for_sale", True]},
                            "$price",
                            None
                        ]
                    }
                },
                "avg_rent_price": {
                    "$avg": {
                        "$cond": [
                            {"$eq": ["$is_for_sale", False]},
                            "$price",
                            None
                        ]
                    }
                },
                "property_count": {"$sum": 1},
                "sale_count": {
                    "$sum": {
                        "$cond": [
                            {"$eq": ["$is_for_sale", True]},
                            1,
                            0
                        ]
                    }
                },
                "rent_count": {
                    "$sum": {
                        "$cond": [
                            {"$eq": ["$is_for_sale", False]},
                            1,
                            0
                        ]
                    }
                }
            }
        }
    ]
    
    cursor = db.properties.aggregate(pipeline)
    result = []
    async for doc in cursor:
        result.append(doc)
    
    # Calculate ROI (Return on Investment) in years
    region_stats = []
    for item in result:
        region_name = item["_id"] if item["_id"] else "Unknown"
        avg_sale_price = item["avg_sale_price"]
        avg_rent_price = item["avg_rent_price"]
        
        # Calculate ROI in years (price / annual rent)
        roi_years = None
        if avg_sale_price and avg_rent_price and avg_rent_price > 0:
            annual_rent = avg_rent_price * 12  # Assuming monthly rent
            roi_years = avg_sale_price / annual_rent
        
        region_stats.append({
            "region_name": region_name,
            "avg_sale_price": avg_sale_price,
            "avg_rent_price": avg_rent_price,
            "roi_years": roi_years,
            "property_count": item["property_count"],
            "sale_count": item["sale_count"],
            "rent_count": item["rent_count"]
        })
    
    return region_stats

# Get property types
@api_router.get("/property-types")
async def get_property_types():
    # Use aggregation to get unique property types
    pipeline = [
        {"$group": {"_id": "$property_type"}},
        {"$match": {"_id": {"$ne": None}}},
        {"$sort": {"_id": 1}}
    ]
    
    cursor = db.properties.aggregate(pipeline)
    
    types = []
    async for doc in cursor:
        if doc["_id"]:
            types.append(doc["_id"])
    
    return types

# Get sources
@api_router.get("/property-sources")
async def get_sources():
    # Use aggregation to get unique sources
    pipeline = [
        {"$group": {"_id": "$source"}},
        {"$match": {"_id": {"$ne": None}}},
        {"$sort": {"_id": 1}}
    ]
    
    cursor = db.properties.aggregate(pipeline)
    
    sources = []
    async for doc in cursor:
        if doc["_id"]:
            sources.append(doc["_id"])
    
    return sources

# Get building outlines from OpenStreetMap
@api_router.get("/buildings")
async def get_buildings(
    south: float = 60.10,
    west: float = 24.60,
    north: float = 60.25,
    east: float = 24.90
):
    buildings = await fetch_buildings_from_osm(south, west, north, east)
    return buildings

# ROI analysis by building
@api_router.get("/roi-analysis")
async def get_roi_analysis():
    try:
        logging.info("Fetching ROI analysis data")
        
        # Get all properties
        sale_properties = []
        rent_properties = []
        
        # Fetch sales properties
        sale_cursor = db.properties.find({"is_for_sale": True})
        async for doc in sale_cursor:
            if '_id' in doc:
                doc['_id'] = str(doc['_id'])
            sale_properties.append(doc)
        
        logging.info(f"Found {len(sale_properties)} sales properties")
        
        # Fetch rental properties
        rent_cursor = db.properties.find({"is_for_sale": False})
        async for doc in rent_cursor:
            if '_id' in doc:
                doc['_id'] = str(doc['_id'])
            rent_properties.append(doc)
        
        logging.info(f"Found {len(rent_properties)} rental properties")
        
        # Calculate ROI for each location
        roi_data = []
        
        # Group properties by coordinates
        coords_map = {}
        
        # Process sale properties
        for prop in sale_properties:
            coords = tuple(prop["location"]["coordinates"])
            if coords not in coords_map:
                coords_map[coords] = {"sales": [], "rentals": []}
            coords_map[coords]["sales"].append(prop)
        
        # Process rental properties
        for prop in rent_properties:
            coords = tuple(prop["location"]["coordinates"])
            if coords not in coords_map:
                coords_map[coords] = {"sales": [], "rentals": []}
            coords_map[coords]["rentals"].append(prop)
        
        logging.info(f"Found {len(coords_map)} unique coordinate pairs with properties")
        
        # Calculate ROI for each location
        for coords, data in coords_map.items():
            if data["sales"] and data["rentals"]:
                avg_sale_price = sum(p["price"] for p in data["sales"]) / len(data["sales"])
                avg_monthly_rent = sum(p["price"] for p in data["rentals"]) / len(data["rentals"])
                annual_rent = avg_monthly_rent * 12
                
                if annual_rent > 0:
                    roi_years = avg_sale_price / annual_rent
                    
                    roi_data.append({
                        "coordinates": list(coords),
                        "avg_sale_price": avg_sale_price,
                        "avg_monthly_rent": avg_monthly_rent,
                        "roi_years": roi_years,
                        "address": data["sales"][0]["location"]["address"] if data["sales"] else data["rentals"][0]["location"]["address"]
                    })
        
        logging.info(f"Generated ROI analysis for {len(roi_data)} locations")
        return roi_data
    except Exception as e:
        logging.error(f"Error generating ROI analysis: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error generating ROI analysis: {str(e)}")

# Include the router in the main app
app.include_router(api_router)

# Set up CORS
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
