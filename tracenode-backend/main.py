import os
import sys
import uuid
import shutil
import subprocess
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image
import cv2
import numpy as np
from svg_parser import get_svg_node_count

app = FastAPI(title="TraceNode Backend Server")
# Note: Stripe checkout success/cancel URLs are resolved dynamically in tracenode-frontend

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # This wildcard is the magic key
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
BIN_DIR = os.path.join(BASE_DIR, "bin")

IS_WINDOWS = sys.platform.startswith("win32")

# Potrace binary path
if IS_WINDOWS:
    POTRACE_PATH = os.path.join(BIN_DIR, "potrace-1.16.win64", "potrace.exe")
    PYAUTOTRACE_PATH = os.path.join(BASE_DIR, ".venv", "Scripts", "pyautotrace.exe")
else:
    # Linux / Render environment fallbacks
    POTRACE_PATH = os.path.join(BIN_DIR, "linux", "potrace")
    if not os.path.exists(POTRACE_PATH):
        POTRACE_PATH = "potrace"
    
    PYAUTOTRACE_PATH = os.path.join(BIN_DIR, "linux", "autotrace")
    if not os.path.exists(PYAUTOTRACE_PATH):
        PYAUTOTRACE_PATH = "autotrace"

# Define target /tmp/vectors directory
if IS_WINDOWS:
    VECTORS_DIR = "C:\\tmp\\vectors"
    try:
        os.makedirs(VECTORS_DIR, exist_ok=True)
    except Exception:
        VECTORS_DIR = os.path.join(BASE_DIR, "tmp", "vectors")
        os.makedirs(VECTORS_DIR, exist_ok=True)
else:
    VECTORS_DIR = "/tmp/vectors"
    os.makedirs(VECTORS_DIR, exist_ok=True)

print(f"Vectors output directory initialized at: {VECTORS_DIR}")

def binarize_image(input_path, output_bmp_path, threshold_val: float, blur_intensity: int, noise_reduction: int):
    """
    Upgraded OpenCV image preprocessing pipeline:
    1. Bilateral filter (smooth while keeping edges sharp).
    2. Convert to Grayscale.
    3. Adaptive Gaussian thresholding.
    4. Morphological closing (noise_reduction x noise_reduction kernel).
    Saves the result as a BMP file.
    """
    # Read image
    img = cv2.imread(input_path)
    if img is None:
        raise ValueError(f"Failed to read image with OpenCV from {input_path}")

    # 1. Apply Bilateral Filter
    # blur_intensity controls the neighborhood diameter for smoothing
    smooth = cv2.bilateralFilter(img, d=blur_intensity, sigmaColor=75, sigmaSpace=75)

    # 2. Convert to Grayscale
    gray = cv2.cvtColor(smooth, cv2.COLOR_BGR2GRAY)

    # 3. Apply Adaptive Thresholding (Gaussian C)
    # Map threshold_val (0.0 to 1.0) to C constant.
    # Default threshold 0.5 maps to C = 2. Range: threshold_val=0 maps to C=-13, threshold_val=1 maps to C=17.
    c_constant = int((threshold_val - 0.5) * 30) + 2

    # We use cv2.THRESH_BINARY_INV so that target features are white (255) for morphological closing.
    thresh = cv2.adaptiveThreshold(
        gray, 
        255, 
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C, 
        cv2.THRESH_BINARY_INV, 
        11, 
        c_constant
    )

    # 4. Apply Morphological Closing (noise_reduction x noise_reduction kernel)
    # Connects broken line segments and eliminates isolated noise points.
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (noise_reduction, noise_reduction))
    closed = cv2.morphologyEx(thresh, cv2.MORPH_CLOSE, kernel)

    # 5. Invert back so that lines are black (0) on white background (255) for Potrace/Autotrace
    final = cv2.bitwise_not(closed)

    # Save to BMP
    cv2.imwrite(output_bmp_path, final)

@app.post("/api/vectorize")
async def vectorize(
    image: UploadFile = File(...),
    mode: str = Form("laser"),  # 'laser' or 'cnc'
    threshold: float = Form(0.5),  # 0.0 to 1.0
    smoothing: float = Form(1.0),  # alphamax for potrace, error-threshold for autotrace
    blur_intensity: int = Form(9), # Bilateral filter diameter (odd 1-15)
    noise_reduction: int = Form(3) # Morphological closing kernel size (1-10)
):
    if mode not in ("laser", "cnc"):
        raise HTTPException(status_code=400, detail="Invalid mode. Must be 'laser' or 'cnc'.")

    # Setup temporary directory for this request session
    session_id = str(uuid.uuid4())
    temp_dir = os.path.join(BASE_DIR, "tmp", "sessions", session_id)
    os.makedirs(temp_dir, exist_ok=True)

    input_ext = os.path.splitext(image.filename)[1] or ".png"
    temp_input_path = os.path.join(temp_dir, f"input{input_ext}")
    temp_bmp_path = os.path.join(temp_dir, "input.bmp")
    output_svg_path = os.path.join(VECTORS_DIR, f"{session_id}.svg")

    try:
        # Save upload to temporary file
        with open(temp_input_path, "wb") as buffer:
            shutil.copyfileobj(image.file, buffer)

        # Preprocess image to a black-and-white BMP with dynamic controls
        binarize_image(temp_input_path, temp_bmp_path, threshold, blur_intensity, noise_reduction)

        # Run vectorizer according to mode
        if mode == "laser":
            if not os.path.exists(POTRACE_PATH):
                raise HTTPException(status_code=500, detail=f"Potrace binary not found at {POTRACE_PATH}")
            
            # Run potrace to generate outline SVG
            cmd = [
                POTRACE_PATH,
                "-s",
                "-a", str(smoothing),
                "-o", output_svg_path,
                temp_bmp_path
            ]
            
            res = subprocess.run(cmd, capture_output=True, text=True)
            if res.returncode != 0:
                raise HTTPException(
                    status_code=500,
                    detail=f"Potrace failed: {res.stderr or res.stdout}"
                )

        elif mode == "cnc":
            if not os.path.exists(PYAUTOTRACE_PATH):
                # Fallback to python -m autotrace if CLI entry point exe is missing
                # but we already verified pyautotrace.exe exists
                raise HTTPException(status_code=500, detail=f"Autotrace CLI not found at {PYAUTOTRACE_PATH}")

            # Run pyautotrace to generate centerline SVG
            cmd = [
                PYAUTOTRACE_PATH,
                "--centerline",
                "--error-threshold", str(smoothing),
                temp_bmp_path,
                output_svg_path
            ]
            
            res = subprocess.run(cmd, capture_output=True, text=True)
            if res.returncode != 0:
                raise HTTPException(
                    status_code=500,
                    detail=f"Autotrace failed: {res.stderr or res.stdout}"
                )

        # Parse the generated SVG for node count
        if not os.path.exists(output_svg_path):
            raise HTTPException(status_code=500, detail="Vectorization failed to write output SVG.")

        node_count = get_svg_node_count(output_svg_path)

        with open(output_svg_path, "r", encoding="utf-8") as f:
            svg_content = f.read()

        return {
            "file_path": output_svg_path,
            "node_count": node_count,
            "svg_content": svg_content
        }

    except HTTPException as he:
        raise he
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")
    finally:
        # Cleanup temporary files
        try:
            shutil.rmtree(temp_dir, ignore_errors=True)
        except Exception:
            pass

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
