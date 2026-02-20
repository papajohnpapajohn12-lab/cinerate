"""
Vercel Serverless Entry Point - ASGI Handler
"""
import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Import FastAPI app
from main import app

# Use ASGI handler from Mangum
from mangum import Mangum

# Create handler - Vercel will use this
handler = Mangum(app, lifespan="off")
