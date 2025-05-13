import requests
import os

# Get backend URL from environment
backend_url = os.environ.get('REACT_APP_BACKEND_URL', 'https://b5ad1baa-345b-4d6d-adfe-2605c7d2b628.preview.emergentagent.com')

# Test getting all properties
print("Checking property counts...")
response = requests.get(f"{backend_url}/api/properties?limit=10000")
if response.status_code == 200:
    properties = response.json()
    total_count = len(properties)
    sale_count = len([p for p in properties if p.get('is_for_sale') == True])
    rental_count = len([p for p in properties if p.get('is_for_sale') == False])
    
    print(f"Total properties: {total_count}")
    print(f"Properties for sale: {sale_count}")
    print(f"Properties for rent: {rental_count}")
else:
    print(f"Error getting properties: {response.status_code}")
    print(response.text)