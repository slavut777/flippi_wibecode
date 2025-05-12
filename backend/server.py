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

# Utils for parsing CSV
def parse_csv_to_properties(csv_content):
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
                
            # Determine if property is for sale or rent
            is_for_sale = True
            if 'listing_type' in row:
                is_for_sale = row['listing_type'].lower() in ['sale', 'buy', 'for sale', 'sell']
            
            # Create property object
            property_data = {
                "title": row.get('title', 'Unnamed Property'),
                "price": float(row.get('price', 0)),
                "price_currency": row.get('currency', 'EUR'),
                "property_type": row.get('property_type', 'Unknown'),
                "area": float(row.get('area', 0)) if not pd.isna(row.get('area', None)) else None,
                "rooms": int(row.get('rooms', 0)) if not pd.isna(row.get('rooms', None)) else None,
                "bathrooms": int(row.get('bathrooms', 0)) if not pd.isna(row.get('bathrooms', None)) else None,
                "location": {
                    "type": "Point",
                    "coordinates": [float(lng), float(lat)],
                    "address": row.get('address', ''),
                    "city": row.get('city', ''),
                    "region": row.get('region', ''),
                    "postal_code": row.get('postal_code', '')
                },
                "source": row.get('source', 'csv_import'),
                "url": row.get('url', None),
                "is_for_sale": is_for_sale
            }
            
            # Add property ID
            property_data["id"] = str(uuid.uuid4())
            
            # Add timestamps
            property_data["created_at"] = datetime.utcnow()
            property_data["updated_at"] = datetime.utcnow()
            
            properties.append(property_data)
            
        return properties
    except Exception as e:
        logging.error(f"Error parsing CSV: {str(e)}")
        raise HTTPException(status_code=400, detail=f"Error parsing CSV file: {str(e)}")

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
@api_router.get("/properties/sources")
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

# Web scraping routes
@api_router.post("/scrape/leboncoin")
async def scrape_leboncoin(query: str = Form(...), limit: int = Form(10)):
    try:
        # Here we would normally implement the scraping logic for leboncoin
        # This is a placeholder implementation
        
        # As this is a demo, we'll return a mock error since web scraping
        # requires more complex implementation with CAPTCHA handling, etc.
        return {"message": "Scraping from leboncoin is not implemented. Please use CSV import instead."}
    except Exception as e:
        logging.error(f"Error scraping leboncoin: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error scraping data: {str(e)}")

@api_router.post("/scrape/idealista")
async def scrape_idealista(query: str = Form(...), limit: int = Form(10)):
    try:
        # Here we would implement the scraping logic for idealista
        # This is a placeholder implementation
        
        # As this is a demo, we'll return a mock error since web scraping
        # requires more complex implementation with CAPTCHA handling, etc.
        return {"message": "Scraping from idealista is not implemented. Please use CSV import instead."}
    except Exception as e:
        logging.error(f"Error scraping idealista: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error scraping data: {str(e)}")

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
