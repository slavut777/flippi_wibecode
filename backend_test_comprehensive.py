import requests
import sys
import os
import json
from datetime import datetime

class EspooRealEstateTester:
    def __init__(self, base_url):
        self.base_url = base_url
        self.tests_run = 0
        self.tests_passed = 0

    def run_test(self, name, method, endpoint, expected_status, data=None, files=None):
        """Run a single API test"""
        url = f"{self.base_url}/{endpoint}"
        headers = {'Content-Type': 'application/json'} if not files else {}
        
        self.tests_run += 1
        print(f"\n🔍 Testing {name}...")
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=headers)
            elif method == 'POST':
                if files:
                    response = requests.post(url, files=files)
                else:
                    response = requests.post(url, json=data, headers=headers)
            elif method == 'DELETE':
                response = requests.delete(url, headers=headers)

            success = response.status_code == expected_status
            if success:
                self.tests_passed += 1
                print(f"✅ Passed - Status: {response.status_code}")
                if response.text:
                    try:
                        return success, response.json()
                    except:
                        return success, response.text
                return success, {}
            else:
                print(f"❌ Failed - Expected {expected_status}, got {response.status_code}")
                print(f"Response: {response.text}")
                return False, {}

        except Exception as e:
            print(f"❌ Failed - Error: {str(e)}")
            return False, {}

    def test_api_root(self):
        """Test API root endpoint"""
        return self.run_test(
            "API Root",
            "GET",
            "api",
            200
        )

    def test_import_default_data(self):
        """Test importing default data"""
        return self.run_test(
            "Import Default Data",
            "POST",
            "api/import-default-data",
            200
        )

    def test_get_properties(self):
        """Test getting properties"""
        return self.run_test(
            "Get Properties",
            "GET",
            "api/properties",
            200
        )

    def test_get_property_types(self):
        """Test getting property types"""
        return self.run_test(
            "Get Property Types",
            "GET",
            "api/property-types",
            200
        )

    def test_get_sources(self):
        """Test getting data sources"""
        return self.run_test(
            "Get Sources",
            "GET",
            "api/property-sources",
            200
        )

    def test_get_region_stats(self):
        """Test getting region statistics"""
        return self.run_test(
            "Get Region Stats",
            "GET",
            "api/properties/stats/regions",
            200
        )

    def test_get_roi_analysis(self):
        """Test getting ROI analysis"""
        return self.run_test(
            "Get ROI Analysis",
            "GET",
            "api/roi-analysis",
            200
        )

    def test_filtered_properties(self, filters=None):
        """Test getting properties with filters"""
        if not filters:
            filters = "price_min=200000&property_type=Apartment"
        
        return self.run_test(
            f"Get Filtered Properties ({filters})",
            "GET",
            f"api/properties?{filters}",
            200
        )

    def test_filter_by_rooms(self, min_rooms=2, max_rooms=3):
        """Test filtering properties by rooms"""
        return self.run_test(
            f"Filter by Rooms (min={min_rooms}, max={max_rooms})",
            "GET",
            f"api/properties?rooms_min={min_rooms}&rooms_max={max_rooms}",
            200
        )

    def test_filter_by_price(self, min_price=200000, max_price=400000):
        """Test filtering properties by price"""
        return self.run_test(
            f"Filter by Price (min={min_price}, max={max_price})",
            "GET",
            f"api/properties?price_min={min_price}&price_max={max_price}",
            200
        )

    def test_get_buildings(self):
        """Test getting building outlines"""
        return self.run_test(
            "Get Buildings",
            "GET",
            "api/buildings",
            200
        )

    def test_create_property(self):
        """Test creating a new property"""
        property_data = {
            "title": "Test Property in Espoo",
            "price": 300000,
            "price_currency": "EUR",
            "property_type": "Apartment",
            "area": 80,
            "rooms": 3,
            "bathrooms": 1,
            "location": {
                "type": "Point",
                "coordinates": [24.78, 60.18],  # Espoo coordinates
                "address": "123 Test Street",
                "city": "Espoo",
                "region": "Espoo",
                "postal_code": "02100"
            },
            "source": "test",
            "url": "https://example.com/test",
            "is_for_sale": True
        }
        
        return self.run_test(
            "Create Property",
            "POST",
            "api/properties",
            200,  # The API returns 200 instead of 201
            data=property_data
        )

def main():
    # Get backend URL from environment or use default
    backend_url = os.environ.get('REACT_APP_BACKEND_URL', 'https://b5ad1baa-345b-4d6d-adfe-2605c7d2b628.preview.emergentagent.com')
    
    # Setup tester
    tester = EspooRealEstateTester(backend_url)
    
    # Run API tests
    print("\n===== Testing Espoo Real Estate Dashboard API =====\n")
    
    # Test API root
    tester.test_api_root()
    
    # Test importing default data
    success, import_result = tester.test_import_default_data()
    if success:
        print(f"Import result: {import_result}")
    
    # Test getting properties
    success, properties = tester.test_get_properties()
    initial_property_count = len(properties) if success and isinstance(properties, list) else 0
    print(f"Initial property count: {initial_property_count}")
    
    # Test property types
    success, property_types = tester.test_get_property_types()
    if success:
        print(f"Available property types: {property_types}")
    
    # Test sources
    success, sources = tester.test_get_sources()
    if success:
        print(f"Available sources: {sources}")
    
    # Test region stats
    success, region_stats = tester.test_get_region_stats()
    if success and isinstance(region_stats, list):
        print(f"Region statistics available for {len(region_stats)} regions")
        
        # Print average sale and rental prices by region
        print("\nRegion Statistics (Average Prices):")
        for region in region_stats:
            region_name = region.get("region_name", "Unknown")
            avg_sale = region.get("avg_sale_price")
            avg_rent = region.get("avg_rent_price")
            roi = region.get("roi_years")
            
            sale_str = f"{avg_sale:,.2f} €" if avg_sale else "N/A"
            rent_str = f"{avg_rent:,.2f} €/month" if avg_rent else "N/A"
            roi_str = f"{roi:.2f} years" if roi else "N/A"
            
            print(f"  - {region_name}: Sale: {sale_str}, Rent: {rent_str}, ROI: {roi_str}")
    
    # Test ROI analysis
    success, roi_data = tester.test_get_roi_analysis()
    if success and isinstance(roi_data, list):
        print(f"ROI analysis available for {len(roi_data)} locations")
        
        # Print top 5 ROI locations
        if len(roi_data) > 0:
            sorted_roi = sorted(roi_data, key=lambda x: x.get('roi_years', float('inf')))
            print("\nTop 5 ROI Locations:")
            for i, item in enumerate(sorted_roi[:5]):
                address = item.get("address", "Unknown")
                avg_sale = item.get("avg_sale_price")
                avg_rent = item.get("avg_monthly_rent")
                roi = item.get("roi_years")
                
                print(f"  {i+1}. {address}: Sale: {avg_sale:,.2f} €, Rent: {avg_rent:,.2f} €/month, ROI: {roi:.2f} years")
    
    # Test filtered properties
    success, filtered_properties = tester.test_filtered_properties()
    if success and isinstance(filtered_properties, list):
        print(f"Filtered properties count: {len(filtered_properties)}")
    
    # Test filtering by rooms
    success, room_filtered = tester.test_filter_by_rooms(2, 3)
    if success and isinstance(room_filtered, list):
        print(f"Properties with 2-3 rooms: {len(room_filtered)}")
    
    # Test filtering by price
    success, price_filtered = tester.test_filter_by_price(200000, 400000)
    if success and isinstance(price_filtered, list):
        print(f"Properties with price 200k-400k: {len(price_filtered)}")
    
    # Test getting buildings
    success, buildings = tester.test_get_buildings()
    if success and isinstance(buildings, list):
        print(f"Building outlines available: {len(buildings)}")
    
    # Test creating a new property
    success, new_property = tester.test_create_property()
    if success:
        print(f"Created new property with ID: {new_property.get('id', 'unknown')}")
    
    # Print results
    print(f"\n📊 Tests passed: {tester.tests_passed}/{tester.tests_run}")
    return 0 if tester.tests_passed == tester.tests_run else 1

if __name__ == "__main__":
    sys.exit(main())