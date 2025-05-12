import requests
import sys
import os
import json
from datetime import datetime

class LocationIntelligenceTester:
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

    def test_upload_csv(self, csv_path):
        """Test CSV upload functionality"""
        try:
            with open(csv_path, 'rb') as f:
                files = {'file': (os.path.basename(csv_path), f, 'text/csv')}
                return self.run_test(
                    "Upload CSV",
                    "POST",
                    "api/properties/upload-csv",
                    200,
                    files=files
                )
        except Exception as e:
            print(f"❌ Failed to open CSV file: {str(e)}")
            return False, {}

    def test_create_property(self):
        """Test creating a new property"""
        property_data = {
            "title": "Test Property",
            "price": 300000,
            "price_currency": "EUR",
            "property_type": "Apartment",
            "area": 80,
            "rooms": 3,
            "bathrooms": 1,
            "location": {
                "type": "Point",
                "coordinates": [2.3522, 48.8566],
                "address": "123 Test Street",
                "city": "Paris",
                "region": "Île-de-France",
                "postal_code": "75001"
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

    def test_filtered_properties(self):
        """Test getting properties with filters"""
        return self.run_test(
            "Get Filtered Properties",
            "GET",
            "api/properties?price_min=200000&property_type=Apartment",
            200
        )

def main():
    # Get backend URL from environment or use default
    backend_url = os.environ.get('REACT_APP_BACKEND_URL', 'https://b5ad1baa-345b-4d6d-adfe-2605c7d2b628.preview.emergentagent.com')
    
    # Setup tester
    tester = LocationIntelligenceTester(backend_url)
    
    # Run API tests
    print("\n===== Testing Location Intelligence Dashboard API =====\n")
    
    # Test API root
    tester.test_api_root()
    
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
    
    # Test CSV upload
    csv_path = "/app/sample_data.csv"
    success, upload_result = tester.test_upload_csv(csv_path)
    if success:
        print(f"CSV upload result: {upload_result}")
    
    # Test getting properties after upload
    success, properties_after_upload = tester.test_get_properties()
    if success and isinstance(properties_after_upload, list):
        new_count = len(properties_after_upload)
        print(f"Property count after upload: {new_count}")
        print(f"Added {new_count - initial_property_count} properties")
    
    # Test filtered properties
    success, filtered_properties = tester.test_filtered_properties()
    if success and isinstance(filtered_properties, list):
        print(f"Filtered properties count: {len(filtered_properties)}")
    
    # Test creating a new property
    success, new_property = tester.test_create_property()
    if success:
        print(f"Created new property with ID: {new_property.get('id', 'unknown')}")
    
    # Print results
    print(f"\n📊 Tests passed: {tester.tests_passed}/{tester.tests_run}")
    return 0 if tester.tests_passed == tester.tests_run else 1

if __name__ == "__main__":
    sys.exit(main())