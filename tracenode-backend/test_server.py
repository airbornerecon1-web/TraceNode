import os
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

def test_vectorize_laser():
    print("\n--- Testing Vectorize Laser Mode (Potrace) ---")
    image_path = "test_input.png"
    if not os.path.exists(image_path):
        print(f"Error: {image_path} not found.")
        return
        
    with open(image_path, "rb") as f:
        files = {"image": (image_path, f, "image/png")}
        data = {
            "mode": "laser",
            "threshold": 0.5,
            "smoothing": 1.0
        }
        response = client.post("/api/vectorize", files=files, data=data)
        
    print("Status code:", response.status_code)
    print("Response JSON:", response.json())
    
    assert response.status_code == 200
    json_data = response.json()
    assert "file_path" in json_data
    assert "node_count" in json_data
    assert os.path.exists(json_data["file_path"])
    print("Laser mode test passed successfully!")
    print("Generated SVG path:", json_data["file_path"])
    print("Node count:", json_data["node_count"])

def test_vectorize_cnc():
    print("\n--- Testing Vectorize CNC Mode (Autotrace) ---")
    image_path = "test_input.png"
    if not os.path.exists(image_path):
        print(f"Error: {image_path} not found.")
        return
        
    with open(image_path, "rb") as f:
        files = {"image": (image_path, f, "image/png")}
        data = {
            "mode": "cnc",
            "threshold": 0.5,
            "smoothing": 1.0
        }
        response = client.post("/api/vectorize", files=files, data=data)
        
    print("Status code:", response.status_code)
    print("Response JSON:", response.json())
    
    assert response.status_code == 200
    json_data = response.json()
    assert "file_path" in json_data
    assert "node_count" in json_data
    assert os.path.exists(json_data["file_path"])
    print("CNC mode test passed successfully!")
    print("Generated SVG path:", json_data["file_path"])
    print("Node count:", json_data["node_count"])

if __name__ == '__main__':
    test_vectorize_laser()
    test_vectorize_cnc()
